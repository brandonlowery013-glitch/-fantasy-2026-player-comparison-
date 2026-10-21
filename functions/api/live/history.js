import {publishedFeed} from '../../lib/published-feed-stream.mjs';
const source='https://raw.githubusercontent.com/brandonlowery013-glitch/-fantasy-2026-player-comparison-/main/data/market/browser-pick-history-2026.json';
export async function onRequestGet(context){
 const cache=globalThis.caches?.default,key=new Request(new URL('/api/live/history',context.request.url));
 const saved=cache?await cache.match(key):null;if(saved)return saved;
 try{
  const upstream=await publishedFeed(source);
  const response=new Response(upstream.body,{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=60','X-CTD-Source':'main/browser-pick-history-2026'}});
  if(cache)context.waitUntil(cache.put(key,response.clone()));return response;
 }catch{return Response.json({status:'HISTORY_UNAVAILABLE',error:'Recorded history could not be loaded.'},{status:502,headers:{'Cache-Control':'no-store'}});}
}
