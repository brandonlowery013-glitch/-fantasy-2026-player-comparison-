const ESPN_SCOREBOARD='https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
const ESPN_SUMMARY='https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary';
const RAW_BASE='https://raw.githubusercontent.com/brandonlowery013-glitch/-fantasy-2026-player-comparison-/frontend/ctd-cloudflare-work';
const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const now=()=>new Date().toISOString();
async function jsonFetch(url,ttl=0){
  const key=new Request(url,{method:'GET'}),cache=caches.default;
  if(ttl>0){const hit=await cache.match(key);if(hit)return hit.json()}
  const r=await fetch(url,{headers:{'accept':'application/json','user-agent':'ChuckTheDuke/2026'},cf:ttl>0?{cacheTtl:ttl,cacheEverything:true}:undefined});
  if(!r.ok)throw new Error(`${r.status} ${url}`);
  const j=await r.json();
  if(ttl>0)await cache.put(key,new Response(JSON.stringify(j),{headers:{'content-type':'application/json','cache-control':`public,max-age=${ttl}`}}));
  return j;
}
function normalizeScoreboard(j){
  return (j.events||[]).map(e=>{const c=e.competitions?.[0]||{},teams=c.competitors||[],home=teams.find(x=>x.homeAway==='home'),away=teams.find(x=>x.homeAway==='away'),s=e.status||{};return{event_id:String(e.id),start_at:e.date,away:{team:away?.team?.abbreviation||away?.team?.shortDisplayName,score:Number(away?.score||0),logo:away?.team?.logo||null},home:{team:home?.team?.abbreviation||home?.team?.shortDisplayName,score:Number(home?.score||0),logo:home?.team?.logo||null},state:s.type?.state||null,status:s.type?.shortDetail||s.type?.detail||'Scheduled',clock:s.displayClock||null,period:s.period||null,venue:c.venue?.fullName||null}})
}
function normalizeSummary(j){
  const c=j.header?.competitions?.[0]||{},teams=c.competitors||[],home=teams.find(x=>x.homeAway==='home'),away=teams.find(x=>x.homeAway==='away');
  const player_stats=[];for(const t of j.boxscore?.players||[])for(const g of t.statistics||[])for(const a of g.athletes||[])player_stats.push({team:t.team?.abbreviation||null,category:g.name||g.displayName||null,player:a.athlete?.displayName||null,player_id:a.athlete?.id||null,stats:Object.fromEntries((g.labels||[]).map((x,i)=>[x,a.stats?.[i]??null]))});
  const injuries=[];for(const t of j.injuries||[])for(const x of t.injuries||[])injuries.push({team:t.team?.abbreviation||null,player:x.athlete?.displayName||null,player_id:x.athlete?.id||null,status:x.status||x.details?.type||'UNKNOWN',detail:x.details?.detail||null});
  return{event_id:String(c.id||''),away:{team:away?.team?.abbreviation,score:Number(away?.score||0)},home:{team:home?.team?.abbreviation,score:Number(home?.score||0)},status:c.status?.type?.shortDetail||null,state:c.status?.type?.state||null,clock:c.status?.displayClock||null,period:c.status?.period||null,team_stats:(j.boxscore?.teams||[]).map(t=>({team:t.team?.abbreviation,stats:Object.fromEntries((t.statistics||[]).map(s=>[s.name||s.displayName,s.displayValue??s.value]))})),player_stats,injuries,scoring_plays:(j.scoringPlays||[]).map(x=>({period:x.period?.number,clock:x.clock?.displayValue,team:x.team?.abbreviation,text:x.text,away_score:x.awayScore,home_score:x.homeScore})),drives:(j.drives?.previous||[]).slice(-15).reverse().map(d=>({team:d.team?.abbreviation,description:d.description||d.result,result:d.result,plays:d.plays?.length,yards:d.yards,time:d.timeElapsed?.displayValue}))};
}
async function repoJson(path,ttl=20){return jsonFetch(`${RAW_BASE}/${path}?v=${Date.now()}`,ttl)}
async function getBundle(eventId){
  const [scoreboard,model,betting,injury,outlook]=await Promise.allSettled([
    jsonFetch(`${ESPN_SCOREBOARD}?limit=100&dates=2026&ts=${Date.now()}`,8),
    repoJson('data/market/unified-opportunities-2026.json',20),
    repoJson('data/market/final-betting-ui-feed-2026.json',20),
    repoJson('data/ingestion/live-injury-poll-2026.json',30),
    repoJson('data/weekly/weekly-player-outlook-2026.json',30)
  ]);
  let game=null;if(eventId){try{game=normalizeSummary(await jsonFetch(`${ESPN_SUMMARY}?event=${encodeURIComponent(eventId)}&ts=${Date.now()}`,8))}catch{}}
  return{generated_at:now(),scoreboard:scoreboard.status==='fulfilled'?normalizeScoreboard(scoreboard.value):[],game,model:model.status==='fulfilled'?model.value:null,betting:betting.status==='fulfilled'?betting.value:null,injuries:injury.status==='fulfilled'?injury.value:null,player_outlook:outlook.status==='fulfilled'?outlook.value:null,sources:{scoreboard:scoreboard.status,model:model.status,betting:betting.status,injuries:injury.status,player_outlook:outlook.status}};
}
function response(v,status=200){return new Response(JSON.stringify(v),{status,headers:JSON_HEADERS})}
async function stream(request){
  const url=new URL(request.url),eventId=url.searchParams.get('event');
  const ts=new TransformStream(),w=ts.writable.getWriter(),enc=new TextEncoder();let closed=false;
  request.signal?.addEventListener('abort',()=>{closed=true;try{w.close()}catch{}});
  (async()=>{while(!closed){try{const b=await getBundle(eventId);await w.write(enc.encode(`event: update\ndata: ${JSON.stringify(b)}\n\n`))}catch(e){await w.write(enc.encode(`event: error\ndata: ${JSON.stringify({generated_at:now(),error:e.message})}\n\n`))}await sleep(15000)}try{await w.close()}catch{}})();
  return new Response(ts.readable,{headers:{'content-type':'text/event-stream','cache-control':'no-cache, no-transform','connection':'keep-alive','access-control-allow-origin':'*'}})
}
export default{async fetch(request){
  if(request.method==='OPTIONS')return new Response(null,{headers:{...JSON_HEADERS,'access-control-allow-methods':'GET,OPTIONS'}});
  const u=new URL(request.url);try{
    if(u.pathname==='/api/live/stream')return stream(request);
    if(u.pathname==='/api/live/bundle')return response(await getBundle(u.searchParams.get('event')));
    if(u.pathname==='/api/live/scoreboard')return response({generated_at:now(),games:normalizeScoreboard(await jsonFetch(`${ESPN_SCOREBOARD}?limit=100&dates=2026&ts=${Date.now()}`,8))});
    if(u.pathname==='/api/live/game'){const id=u.searchParams.get('event');if(!id)return response({error:'event required'},400);return response({generated_at:now(),game:normalizeSummary(await jsonFetch(`${ESPN_SUMMARY}?event=${encodeURIComponent(id)}&ts=${Date.now()}`,8))});}
    if(u.pathname==='/api/live/model')return response({generated_at:now(),data:await repoJson('data/market/unified-opportunities-2026.json',20)});
    if(u.pathname==='/api/live/betting')return response({generated_at:now(),data:await repoJson('data/market/final-betting-ui-feed-2026.json',20)});
    if(u.pathname==='/api/live/injuries')return response({generated_at:now(),data:await repoJson('data/ingestion/live-injury-poll-2026.json',30)});
    if(u.pathname==='/api/live/players')return response({generated_at:now(),data:await repoJson('data/weekly/weekly-player-outlook-2026.json',30)});
    if(u.pathname==='/api/live/health')return response({status:'READY',generated_at:now(),cadence_seconds:{scoreboard:8,stream:15,model:20,injuries:30,players:30}});
    return response({service:'Chuck the Duke live update backend',status:'READY',generated_at:now()},200);
  }catch(e){return response({status:'DEGRADED',generated_at:now(),error:e.message},502)}
}};
