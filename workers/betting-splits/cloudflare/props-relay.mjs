import {currentWeekEvents} from './props-week.mjs';
const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','access-control-allow-origin':'*'}});
const encode=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const MARKETS=['player_pass_yds','player_pass_tds','player_rush_yds','player_rush_tds','player_reception_yds','player_reception_tds','player_receptions'];
export class PropsRelay {
 constructor(storage,env){this.storage=storage;this.env=env;this.keyPromise=null;this.pending=null;}
 keys(){return this.keyPromise??=(async()=>{
  let stored=await this.storage.get('props:signing-key');
  if(!stored){const pair=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);stored={private:await crypto.subtle.exportKey('jwk',pair.privateKey),public:await crypto.subtle.exportKey('jwk',pair.publicKey)};await this.storage.put('props:signing-key',stored);}
  return {public:stored.public,sign:await crypto.subtle.importKey('jwk',stored.private,{name:'Ed25519'},false,['sign']),verify:await crypto.subtle.importKey('jwk',stored.public,{name:'Ed25519'},false,['verify'])};
 })();}
 async handle(request){
  const path=new URL(request.url).pathname;
  if(path==='/props/public-key.json'&&request.method==='GET')return json((await this.keys()).public);
  if(path==='/props/claim'&&request.method==='POST'){
   const body=await request.text();if(body.length>4096)return json({error:'Invalid signed request'},401);
   let event;try{event=JSON.parse(body);if(!await crypto.subtle.verify('Ed25519',(await this.keys()).verify,decode(request.headers.get('x-ctd-signature')||''),new TextEncoder().encode(body)))throw Error();}catch{return json({error:'Invalid signature'},401);}
   if(!Number.isFinite(event.scheduled_time)||Math.abs(Date.now()-event.scheduled_time)>300000||!/^[-\w]{20,80}$/.test(event.nonce||''))return json({error:'Expired request'},401);
   const accepted=await this.storage.transaction(async tx=>{const key='props:claim:'+event.nonce;if(await tx.get(key))return false;await tx.put(key,Date.now());return true;});
   return accepted?json({accepted:true}):json({error:'Replay rejected'},409);
  }
  if(path==='/props/collect'&&request.method==='POST'){
   const event=await request.json(),operation=(this.pending||Promise.resolve()).catch(()=>{}).then(()=>this.collect(event));this.pending=operation;
   try{return (await operation).clone();}finally{if(this.pending===operation)this.pending=null;}
  }
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  if(path==='/props/latest.json'){
   const latest=await this.storage.get('props:latest');if(!latest)return json({error:'No successful scheduled prop collection yet'},404);
   const games=await Promise.all(latest.game_ids.map(id=>this.storage.get('props:game:'+id)));const future=games.filter(g=>g&&Date.parse(g.kickoff)>Date.now());
   const current=future.filter(g=>Date.now()-Date.parse(g.observed_at)<=150*60000),status=await this.storage.get('props:status');
   return json({...latest,games:current,quotes:current.flatMap(g=>g.quotes),health:{status:status?.status==='FAILED'?'STALE':current.length===latest.game_ids.length&&current.length===(latest.expected_games??latest.game_ids.length)&&current.length>0?'CURRENT':current.length?'PARTIAL':'STALE',last_checked_at:status?.last_checked_at,last_success_at:latest.last_success_at,stale_games:(latest.expected_games??latest.game_ids.length)-current.length,...(status?.error?{error:status.error}:{})}});
  }
  if(path==='/props/status.json')return json(await this.storage.get('props:status')||{status:'WAITING_FOR_FIRST_CRON'});
  if(path==='/props/index.json'){const entries=await this.storage.list({prefix:'props:manifest:',reverse:true,limit:96});return json({captures:[...entries.values()]});}
  const match=path.match(/^\/props\/history\/(\d{13})\.json$/);if(match){const manifest=await this.storage.get('props:manifest:'+match[1]);if(!manifest)return json({error:'Not found'},404);const games=await Promise.all(manifest.game_ids.map(id=>this.storage.get('props:capture:'+match[1]+':'+id)));return json({...manifest,games});}
  return json({error:'Not found'},404);
 }
 async provider(path,params,event,quota){
  const body=JSON.stringify({scheduled_time:event.scheduled_time,nonce:crypto.randomUUID(),path,params});const signature=encode(await crypto.subtle.sign('Ed25519',(await this.keys()).sign,new TextEncoder().encode(body)));
  const response=await fetch(this.env.PROPS_RELAY_URL,{method:'POST',headers:{'content-type':'application/json','x-ctd-signature':signature},body,signal:AbortSignal.timeout(25000)});
  quota.last_cost=0;for(const [header,key] of [['x-requests-remaining','remaining'],['x-requests-last','last_cost']]){const value=response.headers.get(header);if(value!==null)quota[key]=Number(value);}quota.used_this_run+=quota.last_cost||0;
  if(!response.ok){const text=await response.text();let detail;try{detail=JSON.parse(text);}catch{}const reason=detail?.provider_status?' (provider '+detail.provider_status+')':text.includes('Too many subrequests')?' (subrequest limit)':text.includes('1102')?' (runtime resource limit)':'';throw Error('Prop provider relay HTTP '+response.status+reason);}return response.json();
 }
 async collect(event){
  if(!this.env.PROPS_RELAY_URL)return json({status:'DISABLED'});
  const capture_id='cloudflare-props:'+event.scheduled_time,existing=await this.storage.get('props:manifest:'+event.scheduled_time);if(existing)return json({capture_id,duplicate:true});
  const last_checked_at=new Date().toISOString(),quota={remaining:null,last_cost:0,used_this_run:0};
  try{
   const events=await this.provider('/v4/sports/americanfootball_nfl/events',{dateFormat:'iso'},event,quota);if(!Array.isArray(events))throw Error('Invalid prop event schedule');
   const scheduleResponse=await fetch(this.env.PROPS_SCHEDULE_URL||'https://raw.githubusercontent.com/brandonlowery013-glitch/-fantasy-2026-player-comparison-/main/data/calibration/weekly-event-schedule-2026.json',{signal:AbortSignal.timeout(20000)});if(!scheduleResponse.ok)throw Error('NFL schedule HTTP '+scheduleResponse.status);const scope=currentWeekEvents(events,await scheduleResponse.json());const upcoming=scope.events;const games=[],failures=[];
   for(const e of upcoming){
    const previous=await this.storage.get('props:game:'+e.id),minutes=(Date.parse(e.commence_time)-Date.now())/60000,refresh=minutes<=60?15:minutes<=360?30:minutes<=1440?90:120;
    if(previous&&Date.now()-Date.parse(previous.observed_at)<refresh*60000)continue;
    if(quota.used_this_run+MARKETS.length>128||Number.isFinite(quota.remaining)&&(quota.remaining<=1000&&minutes>60||quota.remaining<=2000&&minutes>360||quota.remaining<=4000&&minutes>1440)){failures.push({event_id:e.id,reason:'QUOTA_RESERVE'});continue;}
    try{
     const odds=await this.provider('/v4/sports/americanfootball_nfl/events/'+e.id+'/odds',{regions:'us',markets:MARKETS.join(','),dateFormat:'iso',oddsFormat:'american'},event,quota);
     const observed_at=new Date().toISOString(),quotes=[];
     if(odds.id!==e.id||!Array.isArray(odds.bookmakers))throw Error('Invalid prop response');
     for(const book of odds.bookmakers)for(const market of book.markets||[]){if(!MARKETS.includes(market.key))continue;const pairs=new Map();for(const o of market.outcomes||[]){if(!o.description||!Number.isFinite(Number(o.point))||!['Over','Under'].includes(o.name)||!Number.isInteger(Number(o.price))||Math.abs(Number(o.price))<100)continue;const k=JSON.stringify([o.description,Number(o.point)]);const pair=pairs.get(k)||{player:o.description,line:Number(o.point)};pair[o.name.toLowerCase()]=Number(o.price);pairs.set(k,pair);}for(const pair of pairs.values())if(pair.over!=null&&pair.under!=null)quotes.push({...pair,market:market.key,book:book.key,provider_updated_at:market.last_update||book.last_update||null,observed_at,event_id:e.id,kickoff:e.commence_time,home_team:e.home_team,away_team:e.away_team});}
     const game={event_id:e.id,kickoff:e.commence_time,home_team:e.home_team,away_team:e.away_team,observed_at,quotes};if(JSON.stringify(game).length>1900000)throw Error('Prop event response exceeds storage bound');games.push(game);
    }catch(error){failures.push({event_id:e.id,reason:error.message});}
   }
   await this.storage.transaction(async tx=>{
    const writes={};for(const game of games){writes['props:game:'+game.event_id]=game;writes['props:capture:'+event.scheduled_time+':'+game.event_id]=game;}
    const previous=await tx.get('props:latest'),manifest={capture_id,event:'cloudflare-cron',scheduled_at:new Date(event.scheduled_time).toISOString(),observed_at:new Date().toISOString(),game_ids:games.map(g=>g.event_id),quote_count:games.reduce((n,g)=>n+g.quotes.length,0),failures,credits_used:quota.used_this_run};
    if(games.length){writes['props:manifest:'+event.scheduled_time]=manifest;writes['props:latest']={schema_version:1,source:'The Odds API',capture_id,event:'cloudflare-cron',scheduled_at:manifest.scheduled_at,last_success_at:manifest.observed_at,game_ids:upcoming.map(e=>e.id),week:scope.week,expected_games:scope.expected_games,history:'/api/live/prop-quotes?history=index'};}
    writes['props:status']={status:failures.length?'PARTIAL':'CURRENT',last_checked_at,capture_id,last_success_at:games.length?manifest.observed_at:previous?.last_success_at,refreshed_games:games.length,quotes_captured:manifest.quote_count,credits_used:quota.used_this_run,failures};await tx.put(writes);
   });
   return json(await this.storage.get('props:status'));
  }catch(error){await this.storage.put('props:status',{status:'FAILED',last_checked_at,capture_id,error:error.message});return json({error:error.message},502);}
 }
}
