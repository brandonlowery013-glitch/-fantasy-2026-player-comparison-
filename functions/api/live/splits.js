import {preservePublished} from '../../../frontend/cloudflare/lib/splits-history.mjs';
export {preservePublished};
const RAW='https://raw.githubusercontent.com/brandonlowery013-glitch/-fantasy-2026-player-comparison-/data/betting-splits/data/betting-splits/';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=60','access-control-allow-origin':'*'};
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
async function read(path){
 const r=await fetch(`${RAW}${path}?v=${Math.floor(Date.now()/60000)}`,{signal:AbortSignal.timeout(12000),headers:{accept:'application/json'},cf:{cacheTtl:60,cacheEverything:true}});
 if(!r.ok)throw Error('Background publication HTTP '+r.status);
 const text=await r.text();if(text.length>12000000)throw Error('Background publication too large');return JSON.parse(text);
}
export async function onRequestGet({request,env,waitUntil}){
 const url=new URL(request.url),history=url.searchParams.get('history');
 if(history!==null){
  if(history!=='index'&&(!/^\d{4}-\d{2}-\d{2}$/.test(history)||!Number.isFinite(Date.parse(history))||new Date(history).toISOString().slice(0,10)!==history))return response({error:'history must be index or a valid YYYY-MM-DD date'},400);
  try{return response(await read(history==='index'?'index.json':`history/${history}.json`));}catch{return response({status:'UNAVAILABLE',error:'Saved splits history unavailable'},502);}
 }
 const cache=globalThis.caches?.default,key=new Request(new URL('/api/live/background-splits-last-good',request.url));
 let previous=null;
 try{const r=await cache?.match(key);if(r)previous=await r.json();}catch{}
 try{const r=await env.ASSETS.fetch(new URL('/cloudflare/market-percentages.json',request.url));if(r.ok)previous=preservePublished(previous||{games:[]},await r.json());}catch{}
 try{
  const [published,status]=await Promise.all([read('latest.json'),read('status.json').catch(()=>null)]);
  if(published.schema_version!==1||!Array.isArray(published.games)||!published.collection?.last_success_at)throw Error('Invalid background publication');
  const combined=preservePublished(published,previous),now=Date.now();
  const pending=combined.games.filter(g=>Date.parse(g.start_at)>now);
  const at=published.collection.last_success_at,age=now-Date.parse(at);
  const allFresh=pending.length>0&&pending.every(g=>['moneyline','spread','total'].every(m=>g[m]?.length===2&&now-Date.parse(g.market_observed_at?.[m]||g.observed_at)<=35*60000));
  const state=status?.status==='FAILED'?'STALE':published.status==='IDLE'?'IDLE':Number.isFinite(age)&&age>=-300000&&age<=35*60000&&allFresh&&published.status==='CURRENT'?'CURRENT':Number.isFinite(age)&&age<=35*60000&&published.status==='PARTIAL'?'PARTIAL':'STALE';
  const result={...combined,health:{status:state,source:'background-scheduler',checked_at:new Date().toISOString(),last_success_at:at,last_attempt_at:status?.last_attempt_at||at,collection_event:published.collection.event,run_url:status?.run_url||published.collection.run_url,cadence_minutes:15,upcoming_games:pending.length,...(status?.error?{error:status.error}:{})}};
  if(cache)waitUntil(cache.put(key,new Response(JSON.stringify(result),{headers:{...headers,'cache-control':'public, max-age=604800'}})));
  return response(result);
 }catch(error){return response({...previous,schema_version:1,games:previous?.games||[],health:{status:'STALE',source:'saved-fallback',checked_at:new Date().toISOString(),last_success_at:previous?.collection?.last_success_at||previous?.observed_at||null,error:error.message}});}
}
