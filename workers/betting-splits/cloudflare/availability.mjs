import {TEAMS} from './props-week.mjs';
const json=(x,status=200)=>Response.json(x,{status,headers:{'cache-control':'no-store','access-control-allow-origin':'*'}});
const aliases=Object.fromEntries(Object.entries(TEAMS).flatMap(([name,code])=>[[name.toUpperCase(),code],[name.split(' ').at(-1).toUpperCase(),code]]));
Object.assign(aliases,{NINERS:'SF','49ERS':'SF'});
export function officialArticles(html){return [...new Set([...html.matchAll(/href=["']((?:https:\/\/www\.nfl\.com)?\/news\/[^"'#?]*inactiv[^"'#?]*)["']/gi)].map(m=>new URL(m[1],'https://www.nfl.com').href))];}
export function parseOfficialInactives(html,url,events,observed_at){
 if(new URL(url).hostname!=='www.nfl.com')throw Error('Official NFL source required');
 const articles=[];
 for(const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  let d;try{d=JSON.parse(m[1]);}catch{continue;}for(const a of Array.isArray(d)?d:[d])if(a['@type']==='NewsArticle'&&/inactiv/i.test(a.headline||'')&&typeof a.articleBody==='string')articles.push(a);
 }
 const found=[];
 for(const a of articles){
  const published=Date.parse(a.dateModified||a.datePublished),week=Number(a.headline.match(/week\s+(\d+)/i)?.[1]);
  if(!Number.isFinite(published)||published>Date.parse(observed_at)+300000)continue;
  let team=null;const lists=new Map();
  for(const raw of a.articleBody.split(/\r?\n/)){
   const line=raw.replace(/^\s*[-•]\s*/,'').trim();if(!line)continue;
   const code=aliases[line.toUpperCase()];if(code){team=code;if(!lists.has(team))lists.set(team,[]);continue;}
   const player=line.match(/^(?:QB|RB|FB|WR|TE|OL|OT|OG|C|G|T|DL|DT|DE|NT|LB|ILB|OLB|DB|CB|S|FS|SS|K|P|LS)\s+([\p{L}][\p{L} .’'\-]+?)(?:\s*\([^)]*\))?$/u);
   if(team&&player)lists.get(team).push(player[1].trim());else team=null;
  }
  for(const e of events){
   const teams=e.competitions?.[0]?.competitors?.map(c=>({team:({LAR:'LA',WSH:'WAS',JAC:'JAX'}[c.team?.abbreviation]||c.team?.abbreviation),side:c.homeAway}))||[];
   const kickoff=Date.parse(e.date),eventWeek=Number(e.week?.number);
   if(teams.length!==2||!teams.every(t=>lists.get(t.team)?.length>=3)||Number.isInteger(eventWeek)&&week!==eventWeek||Math.abs(kickoff-published)>36*3600000)continue;
   for(const t of teams)found.push({event_id:String(e.id),kickoff:e.date,team:t.team,complete:true,inactive_names:lists.get(t.team),source:'NFL.com official inactive report',source_url:url,published_at:new Date(published).toISOString(),observed_at});
  }
 }
 return found;
}
export function parseLiveInjuries(data,observed_at){
 return (data.injuries||[]).flatMap(t=>(t.injuries||[]).filter(x=>x.athlete?.displayName&&typeof x.status==='string').map(x=>({name:x.athlete.displayName,athlete_id:String(x.athlete.id||''),team:TEAMS[t.displayName]||({LAR:'LA',WSH:'WAS',JAC:'JAX'}[t.abbreviation]||t.abbreviation||t.team?.abbreviation),status:x.status,source_updated_at:x.date||null,practice_status:x.details?.practiceStatus||null,observed_at,source_url:'https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries'})));
}
export class AvailabilityStore{
 constructor(storage){this.storage=storage;this.pending=null;}
 async handle(request){const p=new URL(request.url).pathname;
  if(p==='/availability/collect'&&request.method==='POST'){const event=await request.json();const job=(this.pending||Promise.resolve()).catch(()=>{}).then(()=>this.collect(event));this.pending=job;try{return await job;}finally{if(this.pending===job)this.pending=null;}}
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  if(p==='/availability/latest.json')return json(await this.storage.get('availability:latest')||{status:'WAITING_FOR_FIRST_CRON',games:[],injuries:[]});
  if(p==='/availability/status.json')return json(await this.storage.get('availability:status')||{status:'WAITING_FOR_FIRST_CRON'});
  if(p==='/availability/index.json')return json({captures:[...(await this.storage.list({prefix:'availability:capture:',reverse:true,limit:96})).values()].map(x=>({capture_id:x.capture_id,observed_at:x.observed_at,status:x.status,official_team_reports:x.games.length,injuries:x.injuries.length}))});
  return json({error:'Not found'},404);
 }
 async collect({scheduled_time,cron}){
  if(!Number.isFinite(scheduled_time)||cron!=='*/15 * * * *')return json({error:'Invalid schedule'},400);
  const key='availability:capture:'+scheduled_time;if(await this.storage.get(key))return json({duplicate:true});
  const observed_at=new Date().toISOString();
  const read=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{accept:'application/json,text/html','user-agent':'CTD-availability/1.0'}});if(!r.ok)throw Error('Availability source HTTP '+r.status);const text=await r.text();if(text.length>12000000)throw Error('Availability source too large');return text;};
  try{
   const [scheduleText,injuryText,index]=await Promise.all([read('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=100'),read('https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries'),read('https://www.nfl.com/inactives/')]);
   const schedule=JSON.parse(scheduleText),events=schedule.events;if(!Array.isArray(events)||!events.length)throw Error('Invalid availability schedule');
   const injuries=parseLiveInjuries(JSON.parse(injuryText),observed_at),previous=await this.storage.get('availability:latest');
   if(!injuries.length||injuries.some(x=>!x.team))throw Error('Invalid public injury feed');
   const links=officialArticles(index),near=events.some(e=>Date.parse(e.date)-Date.now()<=2*3600000&&Date.parse(e.date)>Date.now()-6*3600000);
   if(near){try{links.push(...officialArticles(await read('https://www.nfl.com/news/series/around-the-nfl-news')));}catch{}}
   const week=Number(schedule.week?.number),candidates=[...new Set(links)].filter(u=>new RegExp('week[-/ ]?'+week+'(?:-|/)','i').test(u)).slice(0,8);
   const games=(previous?.games||[]).filter(g=>events.some(e=>String(e.id)===g.event_id&&Date.parse(e.date)===Date.parse(g.kickoff)));
   const errors=[];
   for(const url of candidates){try{for(const game of parseOfficialInactives(await read(url),url,events,observed_at)){const i=games.findIndex(g=>g.event_id===game.event_id&&g.team===game.team);if(i>=0)games[i]=game;else games.push(game);}}catch(e){errors.push({source_url:url,error:e.message});}}
   const data={schema_version:1,capture_id:'cloudflare-availability:'+scheduled_time,event:'cloudflare-cron',scheduled_at:new Date(scheduled_time).toISOString(),observed_at,week,status:errors.length?'PARTIAL':'CURRENT',games,injuries,errors,official_reports_status:games.length?'PUBLISHED':'NOT_YET_PUBLISHED',paid_provider_requests:0,cadence_minutes:15};
   await this.storage.put({[key]:data,'availability:latest':data,'availability:status':{capture_id:data.capture_id,status:data.status,last_success_at:observed_at,official_team_reports:games.length,injuries:injuries.length,paid_provider_requests:0}});
   return json({capture_id:data.capture_id,status:data.status,official_team_reports:games.length,injuries:injuries.length,paid_provider_requests:0});
  }catch(e){await this.storage.put('availability:status',{status:'FAILED',last_attempt_at:observed_at,error:e.message});return json({error:e.message},502);}
 }
}
