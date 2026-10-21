import {parseSplits,SOURCE} from '../../../frontend/cloudflare/lib/public-splits.mjs';
import '../../../frontend/cloudflare/runtime-league-refresh-2026.js';
import {preservePublished} from '../../../frontend/cloudflare/lib/splits-history.mjs';
export {preservePublished};
const headers={'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=300','access-control-allow-origin':'*'};
// Keep published game snapshots when the provider removes a game after kickoff.
// The game's original observed_at remains unchanged.
const response=(data,health)=>new Response(JSON.stringify(health?{...data,health}:data),{headers});
async function read(url){const r=await fetch(url,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Source unavailable');const text=await r.text();if(text.length>1500000)throw Error('Source too large');return text;}
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
  const events=schedule.events||[],plan=globalThis.CTD_LEAGUE_REFRESH.plan(events);
  const centralDay=date=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date));
  const today=centralDay(Date.now()),offDay=!events.some(event=>centralDay(event.date)===today);
  // Upcoming markets are published before game day. Refresh them on off days
  // too, while retaining the game-day kickoff cutoff and saved-game history.
  const previewSlot=offDay&&events.some(event=>Date.parse(event.date)>Date.now())?`preview:${Math.floor(Date.now()/900000)}`:null;
  const slot=plan.keys.at(-1)||previewSlot;
  if(!slot||fallback?.refresh_slot===slot){
   const age=Date.now()-Date.parse(fallback?.observed_at);
   const current=slot&&fallback?.refresh_slot===slot&&Number.isFinite(age)&&age>=0&&age<=900000;
   return response(fallback||{schema_version:1,games:[]},{status:current?'CURRENT':'SAVED',checked_at:new Date().toISOString(),refresh_slot:slot});
  }
  // At most two public pages per scheduled slot; no paid collectors or model jobs.
  const first=await read(SOURCE),firstAt=new Date().toISOString(),second=await read(SOURCE.replace('tb_page=1','tb_page=2')),secondAt=new Date().toISOString();
  const a=parseSplits(first,schedule.events||[],firstAt),b=parseSplits(second,schedule.events||[],secondAt);
  a.games.push(...b.games.filter(g=>!a.games.some(x=>x.event_id===g.event_id)));if(!a.games.length)throw Error('No matched public splits');
  const combined=preservePublished(a,fallback);combined.refresh_slot=slot;waitUntil(cache.put(key,new Response(JSON.stringify(combined),{headers:{...headers,'cache-control':'public, max-age=604800'}})));return response(combined,{status:'CURRENT',checked_at:secondAt,refresh_slot:slot});
 }catch(error){return response(fallback||{schema_version:1,games:[]},{status:'STALE',checked_at:new Date().toISOString(),error:String(error?.message||error)});}
}
