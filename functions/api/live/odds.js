import {onRequestGet as publicSplits} from './splits.js';
const SOURCE='https://raw.githubusercontent.com/brandonlowery013-glitch/-fantasy-2026-player-comparison-/main/data/market/current-game-lines-2026.json';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=60'}});
const american=value=>{const n=Number(String(value||'').replace(/−/g,'-').replace(/,/g,''));return Number.isInteger(n)&&Math.abs(n)>=100?n:null;};
const point=label=>{const m=String(label||'').match(/([+-]?\d+(?:\.\d+)?)\s*$/);return m?Number(m[1]):null;};
export function publicQuotes(feed,now=Date.now()){
 if(feed.health?.status!=='CURRENT')return [];
 return (feed.games||[]).flatMap(game=>{
  const start=Date.parse(game.start_at),observed=Date.parse(game.observed_at);
  if(!Number.isFinite(start)||!Number.isFinite(observed)||start<=now||now-observed>900000||observed>now+300000)return [];
  const markets=[];
  for(const [field,key] of [['moneyline','h2h'],['spread','spreads'],['total','totals']]){
   const at=game.market_observed_at?.[field]||game.observed_at;
   if(!Number.isFinite(Date.parse(at))||now-Date.parse(at)>900000||Date.parse(at)>now+300000)continue;
   const rows=game[field]||[];
   if(rows.length!==2)continue;
   const outcomes=rows.map(row=>({name:row.side,price:american(row.odds),...(key==='h2h'?{}:{point:point(row.label)})}));
   if(outcomes.some(row=>row.price===null||(key!=='h2h'&&row.point===null)))continue;
   const sides=key==='totals'?['Over','Under']:[game.away,game.home];
   if(!sides.every(side=>outcomes.filter(row=>row.name===side).length===1))continue;
   if(key==='spreads'&&Math.abs(outcomes[0].point+outcomes[1].point)>0.001)continue;
   if(key==='totals'&&outcomes[0].point!==outcomes[1].point)continue;
   markets.push({key,last_update:at,outcomes});
  }
  if(!markets.length)return [];
  return [{id:game.event_id,home_team:game.home,away_team:game.away,start_at:game.start_at,bookmakers:[{key:'draftkings-public',title:'DraftKings public table',last_update:game.observed_at,markets}],source:'DraftKings publicly rendered betting table'}];
 });
}
export async function onRequestGet(context){
 let published=null;
 try{
  const response=await fetch(SOURCE,{signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Published lines unavailable');
  const reader=response.body.getReader(),chunks=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2000000){await reader.cancel();throw Error('Feed too large');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  published=JSON.parse(new TextDecoder().decode(bytes));
  if(!Array.isArray(published.games)||published.games.length>300||published.quote_type!=='pregame')throw Error('Invalid feed');
  const recent=Date.now()-Date.parse(published.fetched_at)<900000&&Date.parse(published.fetched_at)<=Date.now()+300000;
  if(recent&&published.games.some(game=>Date.parse(game.start_at)>Date.now()))return json({...published,health:{status:'CURRENT',source:'published-provider-feed'}});
 }catch{published=null;}
 try{
  const splits=await(await publicSplits(context)).json(),fresh=publicQuotes(splits);
  if(fresh.length){
   const prior=(published?.games||[]).filter(game=>!fresh.some(next=>next.id===game.id||(next.home_team===game.home_team&&next.away_team===game.away_team&&next.start_at===game.start_at)));
   return json({schema_version:'1.0.0',status:'ok',quote_type:'pregame',source:'DraftKings public table with saved provider history',fetched_at:splits.health.checked_at,games:[...prior,...fresh].slice(-300),health:{status:'CURRENT',source:'draftkings-public',fresh_games:fresh.length}});
  }
 }catch{}
 if(published)return json({...published,status:'stale',health:{status:'STALE'},message:'Current odds refresh is unavailable. Saved quotes retain their original collection times.'});
 return json({status:'unavailable',games:[],health:{status:'UNAVAILABLE'},message:'Published sportsbook lines are temporarily unavailable.'},503);
}
