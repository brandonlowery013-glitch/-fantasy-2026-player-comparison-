import {parseScoresSplits,SCORES_SOURCE} from '../../../frontend/cloudflare/lib/scoresandodds-splits.mjs';
import {parseActionPublic,ACTION_SOURCE} from '../../../frontend/cloudflare/lib/action-public-splits.mjs';
import {parseSplits,SOURCE} from '../../../frontend/cloudflare/lib/public-splits.mjs';
import '../../../frontend/cloudflare/runtime-league-refresh-2026.js';
import {preservePublished} from '../../../frontend/cloudflare/lib/splits-history.mjs';
export {preservePublished};
export function publicRefreshSlot(events,now=Date.now()){
 const plan=globalThis.CTD_LEAGUE_REFRESH.plan(events,now);
 const day=date=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date));
 const offDay=!events.some(event=>day(event.date)===day(now));
 // Last night's final must not suppress the next slate's recurring collection.
 const preview=offDay&&events.some(event=>Date.parse(event.date)>now)?`preview:${Math.floor(now/900000)}`:null;
 return preview||plan.keys.at(-1)||null;
}

const headers={'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=300','access-control-allow-origin':'*'};
// Keep published game snapshots when the provider removes a game after kickoff.
// The game's original observed_at remains unchanged.
const response=(data,health)=>new Response(JSON.stringify(health?{...data,health}:data),{headers});
async function read(url){const r=await fetch(url,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Source unavailable');const text=await r.text();if(text.length>3000000)throw Error('Source too large');return text;}
export async function onRequestGet({request,env,waitUntil}){
 const cache=caches.default,key=new Request(new URL('/api/live/splits-cache',request.url)),stored=await cache.match(key);
 let fallback=stored?await stored.json():null;
 {try{const r=await env.ASSETS.fetch(new URL('/cloudflare/market-percentages.json',request.url));if(r.ok){const saved=await r.json();fallback=preservePublished(fallback||saved,saved);}}catch{}}
 try{
  const scheduleKey=new Request(new URL('/api/live/splits-schedule-cache',request.url));let scheduleResponse=await cache.match(scheduleKey),schedule;
  if(scheduleResponse)schedule=await scheduleResponse.json();else{
   const scoreboard='https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
   schedule=JSON.parse(await read(scoreboard));
   // ESPN can keep the completed week as its default until midweek. Move to
   // the upcoming slate only after every default-week game is explicitly final.
   const week=Number(schedule.week?.number),events=schedule.events||[];
   if(events.length&&events.every(event=>event.status?.type?.completed===true)&&Number.isInteger(week)&&week<18){
    schedule=JSON.parse(await read(`${scoreboard}?dates=${schedule.season?.year||2026}&seasontype=2&week=${week+1}&limit=100`));
   }
   waitUntil(cache.put(scheduleKey,response(schedule)));
  }
  const events=schedule.events||[],slot=publicRefreshSlot(events);
  if(!slot||fallback?.refresh_slot===slot){
   const age=Date.now()-Date.parse(fallback?.observed_at);
   const current=slot&&fallback?.refresh_slot===slot&&Number.isFinite(age)&&age>=0&&age<=900000;
   return response(fallback||{schema_version:1,games:[]},{status:current?(fallback?.backup?.games?.length&&!fallback.games.some(g=>Date.parse(g.start_at)>Date.now())?'PARTIAL':'CURRENT'):'SAVED',checked_at:new Date().toISOString(),refresh_slot:slot});
  }
  // Independent public backup: a provider outage must not discard usable ticket data.
  const sources=await Promise.allSettled([read(SOURCE),read(SOURCE.replace('tb_page=1','tb_page=2')),read(ACTION_SOURCE),read(SCORES_SOURCE)]),checked=new Date().toISOString();
  const parsed=sources.slice(0,2).filter(r=>r.status==='fulfilled').map(r=>parseSplits(r.value,events,checked));
  const a=parsed[0]||{schema_version:1,games:[],observed_at:checked};
  for(const p of parsed.slice(1))a.games.push(...p.games.filter(g=>!a.games.some(x=>x.event_id===g.event_id)));
  const action=sources[2].status==='fulfilled'?parseActionPublic(sources[2].value,events,checked):null;
  const scores=sources[3].status==='fulfilled'?parseScoresSplits(sources[3].value,{events,season:schedule.season?.year,week:schedule.week?.number},checked):null;
  const backup=scores?.games.length?scores:action;
  if(!a.games.length&&!backup?.games.length)throw Error('Public providers have no matched pregame percentages');
  const combined=preservePublished(a,fallback);combined.refresh_slot=slot;combined.backup=backup;
  const health={status:a.games.length?'CURRENT':'PARTIAL',checked_at:checked,refresh_slot:slot,...(!a.games.length?{error:'DraftKings unavailable; public backup coverage shown'}:{})};
  waitUntil(cache.put(key,new Response(JSON.stringify(combined),{headers:{...headers,'cache-control':'public, max-age=604800'}})));return response(combined,health);
 }catch(error){return response(fallback||{schema_version:1,games:[]},{status:'STALE',checked_at:new Date().toISOString(),error:String(error?.message||error)});}
}
