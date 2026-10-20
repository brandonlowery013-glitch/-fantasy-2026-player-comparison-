import {onRequest as liveRequest} from '../functions/api/live/[[path]].js';

const REPO='brandonlowery013-glitch/-fantasy-2026-player-comparison-';
const PATHS={recommendations:'data/market/game-model-consumer-2026.json',projections:'data/probability/generated/weekly-game-projections-2026.json',schedule:'data/calibration/weekly-event-schedule-2026.json',lines:'data/market/current-game-lines-2026.json'};

export default {
 async fetch(request,env,ctx){
  const url=new URL(request.url),prefix='/cloudflare/api/game-model/';
  // Advanced-mode Pages ignores the Functions directory. Dispatch the existing
  // scoreboard/game handlers here instead of forwarding these URLs to assets.
  if(['/api/live/scoreboard','/api/live/game'].includes(url.pathname)){
   if(request.method!=='GET')return new Response('Read-only endpoint',{status:405,headers:{Allow:'GET'}});
   return liveRequest({request,env,waitUntil:ctx.waitUntil.bind(ctx),params:{path:[url.pathname.split('/').pop()]}});
  }
  if(!url.pathname.startsWith(prefix))return env.ASSETS.fetch(request);
  if(!['GET','HEAD'].includes(request.method))return new Response('Read-only endpoint',{status:405,headers:{Allow:'GET, HEAD'}});
  const kind=url.pathname.slice(prefix.length),ref=url.searchParams.get('ref')||'main';
  if(kind!=='release'&&!Object.hasOwn(PATHS,kind))return new Response('Unknown model resource',{status:404});
  if(!/^(main|[a-f0-9]{40})$/.test(ref))return new Response('Invalid producer reference',{status:400});
  const key=new Request(url.origin+prefix+kind+(kind==='release'?'':'?ref='+ref));
  const cache=globalThis.caches?.default,cached=cache?await cache.match(key):null;
  if(cached)return request.method==='HEAD'?new Response(null,{status:cached.status,headers:cached.headers}):cached;
  const upstream=kind==='release'?`https://api.github.com/repos/${REPO}/git/ref/heads/main`:`https://raw.githubusercontent.com/${REPO}/${ref}/${PATHS[kind]}`;
  try{
   const fetched=await fetch(upstream,{headers:{Accept:'application/json','Accept-Encoding':'identity','User-Agent':'ctd-preview-model-delivery/1.0'},signal:AbortSignal.timeout(10000)});
   if(!fetched.ok)return new Response(JSON.stringify({status:'MODEL_SOURCE_UNAVAILABLE',upstream_status:fetched.status}),{status:502,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
   const headers=new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':`public, max-age=${kind==='release'?300:ref==='main'?60:3600}`,'X-CTD-Producer-Ref':kind==='release'?'main':ref});
   if(fetched.headers.get('etag'))headers.set('ETag',fetched.headers.get('etag'));
   const response=new Response(fetched.body,{status:200,headers});
   if(cache)ctx.waitUntil(cache.put(key,response.clone()));
   return request.method==='HEAD'?new Response(null,{status:200,headers}):response;
  }catch{return new Response(JSON.stringify({status:'MODEL_SOURCE_TIMEOUT'}),{status:504,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
 }
};
