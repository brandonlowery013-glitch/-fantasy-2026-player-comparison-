import {onRequestGet as propQuotesRequest,refreshProps} from '../functions/api/live/prop-quotes.js';
import {onRequestGet as availabilityRequest} from '../functions/api/live/availability.js';
import {onRequestGet as qbRequest} from '../functions/api/live/qb-projections.js';
import {onRequest as liveRequest} from '../functions/api/live/[[path]].js';
import {onRequestGet as newsRequest} from '../functions/api/live/news.js';
import {onRequestGet as oddsRequest} from '../functions/api/live/odds.js';
import {onRequestGet as splitsRequest} from '../functions/api/live/splits.js';
import {onRequestGet as historyRequest} from '../functions/api/live/history.js';

const LIVE_HANDLERS={'prop-quotes':propQuotesRequest,availability:availabilityRequest,'qb-projections':qbRequest,news:newsRequest,odds:oddsRequest,splits:splitsRequest,history:historyRequest};
const LIVE_RESOURCES=new Set(['','health','scoreboard','game','bundle','model','betting','injuries','players',...Object.keys(LIVE_HANDLERS)]);

const REPO='brandonlowery013-glitch/-fantasy-2026-player-comparison-';
const PATHS={recommendations:'data/market/game-model-consumer-2026.json',projections:'data/probability/generated/weekly-game-projections-2026.json',schedule:'data/calibration/weekly-event-schedule-2026.json',lines:'data/market/current-game-lines-2026.json'};

export default {
 async fetch(request,env,ctx){
  const url=new URL(request.url),prefix='/cloudflare/api/game-model/';
  if(url.pathname==='/api/internal/props-refresh')return refreshProps({request,env});
  // Advanced-mode Pages ignores the Functions directory. Keep every supported
  // live API resource connected to its existing handler here.
  if(url.pathname==='/api/live'||url.pathname.startsWith('/api/live/')){
   const leaf=url.pathname==='/api/live'?'':url.pathname.slice('/api/live/'.length);
   if(!LIVE_RESOURCES.has(leaf))return new Response('Unknown live resource',{status:404});
   if(request.method!=='GET')return new Response('Read-only endpoint',{status:405,headers:{Allow:'GET'}});
   const context={request,env,waitUntil:ctx.waitUntil.bind(ctx),params:{path:leaf?[leaf]:[]}};
   return (LIVE_HANDLERS[leaf]||liveRequest)(context);
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

