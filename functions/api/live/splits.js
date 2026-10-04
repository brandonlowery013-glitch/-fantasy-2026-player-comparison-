import {parseSplits,SOURCE} from '../../../frontend/cloudflare/lib/public-splits.mjs';
import '../../../frontend/cloudflare/runtime-league-refresh-2026.js';
import {preservePublished} from '../../../frontend/cloudflare/lib/splits-history.mjs';
export {preservePublished};
const headers={'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=300','access-control-allow-origin':'*'};
// Keep published game snapshots when the provider removes a game after kickoff.
// The game's original observed_at remains unchanged.
const response=data=>new Response(JSON.stringify(data),{headers});
async function read(url){const r=await fetch(url,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Source unavailable');const text=await r.text();if(text.length>1500000)throw Error('Source too large');return text;}
export async function onRequestGet({request,env,waitUntil}){
 const cache=caches.default,key=new Request(new URL('/api/live/splits-cache',request.url)),stored=await cache.match(key);
 let fallback=stored?await stored.json():null;
 {try{const r=await env.ASSETS.fetch(new URL('/cloudflare/market-percentages.json',request.url));if(r.ok){const saved=await r.json();fallback=preservePublished(fallback||saved,saved);}}catch{}}
 try{
  const scheduleKey=new Request(new URL('/api/live/splits-schedule-cache',request.url));let scheduleResponse=await cache.match(scheduleKey),schedule;
  if(scheduleResponse)schedule=await scheduleResponse.json();else{schedule=JSON.parse(await read('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'));waitUntil(cache.put(scheduleKey,response(schedule)));}
  const plan=globalThis.CTD_LEAGUE_REFRESH.plan(schedule.events||[]),slot=plan.keys.at(-1);
  if(!slot||fallback?.refresh_slot===slot)return response(fallback||{schema_version:1,games:[]});
  // At most two public pages per scheduled slot; no paid collectors or model jobs.
  const first=await read(SOURCE),firstAt=new Date().toISOString(),second=await read(SOURCE.replace('tb_page=1','tb_page=2')),secondAt=new Date().toISOString();
  const a=parseSplits(first,schedule.events||[],firstAt),b=parseSplits(second,schedule.events||[],secondAt);
  a.games.push(...b.games.filter(g=>!a.games.some(x=>x.event_id===g.event_id)));if(!a.games.length)throw Error('No matched public splits');
  const combined=preservePublished(a,fallback);combined.refresh_slot=slot;waitUntil(cache.put(key,new Response(JSON.stringify(combined),{headers:{...headers,'cache-control':'public, max-age=604800'}})));return response(combined);
 }catch{return response(fallback||{schema_version:1,games:[]});}
}
