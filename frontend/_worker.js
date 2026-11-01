import {FOOTBALL_MONEYLINE_VERSION} from '../workers/betting-splits/lib/football-moneyline.mjs';
import {onRequestGet as previewRequest} from '../functions/api/live/matchup-previews.js';
import historicalSelection from '../workers/betting-splits/model/ne-chi-current-models.json' with {type:'json'};
import {applyHistoricalHistory} from '../workers/betting-splits/lib/historical-model-selection.mjs';
import {onRequestGet as moneylineRequest} from '../functions/api/live/moneyline-projections.js';
import {onRequestGet as spreadRequest} from '../functions/api/live/spread-projections.js';
import {onRequestGet as propQuotesRequest,refreshProps} from '../functions/api/live/prop-quotes.js';
import {onRequestGet as availabilityRequest} from '../functions/api/live/availability.js';
import {onRequestGet as gameProjectionRequest} from '../functions/api/live/game-projections.js';
import {onRequestGet as qbRequest} from '../functions/api/live/qb-projections.js';
import {onRequest as liveRequest} from '../functions/api/live/[[path]].js';
import {onRequestGet as newsRequest} from '../functions/api/live/news.js';
import {onRequestGet as oddsRequest} from '../functions/api/live/odds.js';
import {onRequestGet as splitsRequest} from '../functions/api/live/splits.js';
import {onRequestGet as historyRequest} from '../functions/api/live/history.js';

const LIVE_HANDLERS={'matchup-previews':previewRequest,'moneyline-projections':moneylineRequest,'spread-projections':spreadRequest,'game-projections':gameProjectionRequest,'prop-quotes':propQuotesRequest,availability:availabilityRequest,'qb-projections':qbRequest,news:newsRequest,odds:oddsRequest,splits:splitsRequest,history:historyRequest};
const LIVE_RESOURCES=new Set(['','health','scoreboard','game','bundle','model','betting','injuries','players',...Object.keys(LIVE_HANDLERS)]);

const REPO='brandonlowery013-glitch/-fantasy-2026-player-comparison-';
const PATHS={recommendations:'data/market/game-model-consumer-2026.json',projections:'data/probability/generated/weekly-game-projections-2026.json',schedule:'data/calibration/weekly-event-schedule-2026.json',lines:'data/market/current-game-lines-2026.json'};


// Model evaluation and explanatory simulations run in the scheduled publisher.
// The request path reads only a small freshness manifest and streams the result.
async function preparedResponse(ref,kind='recommendations'){
 if(ref!=='main')throw Error('Prepared historical release unavailable');
 const root=`https://raw.githubusercontent.com/${REPO}/data/prepared-game-model/data/market/prepared-game-model-2026`;
 const manifestResponse=await fetch(root+'.manifest.json?refresh='+Math.floor(Date.now()/30000),{signal:AbortSignal.timeout(10000),cf:{cacheTtl:30,cacheEverything:true}});
 if(!manifestResponse.ok)throw Error('Prepared model manifest unavailable');
 const manifest=await manifestResponse.json(),now=Date.now(),generated=Date.parse(manifest.generated_at),expires=Date.parse(manifest.expires_at);
 if(manifest.kind!=='PRECOMPUTED_SERVER_MODEL'||!Number.isFinite(generated)||!Number.isFinite(expires)||generated>now+60000||expires<=now||expires-generated>20*60000)throw Error('Prepared model is awaiting a fresh publication');
 const response=await fetch(root+(kind==='moneyline'?'.moneyline.json':kind==='recommendations'?'.json.gz':'.'+kind+'.json.gz')+'?publication='+encodeURIComponent(manifest.generated_at),{signal:AbortSignal.timeout(20000),cf:{cacheTtl:30,cacheEverything:true}});
 if(!response.ok)throw Error('Prepared model result unavailable');
 return new Response(response.body,{encodeBody:kind==='moneyline'?'automatic':'manual',headers:{'content-type':'application/json','cache-control':'no-store',...(kind==='moneyline'?{}:{'content-encoding':'gzip'}),'x-ctd-model-delivery':'precomputed','x-ctd-model-generated-at':manifest.generated_at,'x-ctd-spread-model':'sportsbook-calibration-learning-v1'}});
}
async function preparedFeed(kind){const response=await preparedResponse('main',kind);return new Response(response.body.pipeThrough(new DecompressionStream('gzip')),{headers:{'content-type':'application/json'}});}


async function publishedData(request,env,ctx,url){
 const path=url.pathname.slice('/cloudflare/api/published/'.length);
 if(request.method!=='GET'||! /^(main|frontend\/ctd-cloudflare-work|[a-f0-9]{40})\/(?:data\/[a-zA-Z0-9_./-]+|[a-zA-Z0-9_-]+)\.json$/.test(path)||path.includes('..'))return new Response('Unknown published resource',{status:404});
 const key=new Request(url.origin+'/cloudflare/api/published/'+path),cache=caches.default;
 const saved=await cache.match(key);if(saved)return saved;
 try{
  const response=await fetch('https://raw.githubusercontent.com/'+REPO+'/'+path,{signal:AbortSignal.timeout(8000),cf:{cacheTtl:60,cacheEverything:true}});
  if(!response.ok)return Response.json({status:'PUBLISHED_DATA_UNAVAILABLE',upstream_status:response.status},{status:502});
  const result=new Response(response.body,{headers:{'content-type':'application/json','cache-control':'public, max-age=30','x-ctd-data-transport':'cloudflare'}});
  ctx.waitUntil(cache.put(key,result.clone()));return result;
 }catch{return Response.json({status:'PUBLISHED_DATA_TIMEOUT'},{status:504});}
}

export default {
 async fetch(request,env,ctx){
  const url=new URL(request.url),prefix='/cloudflare/api/game-model/';
  if(url.pathname.startsWith('/cloudflare/api/published/'))return publishedData(request,env,ctx,url);
  if(url.pathname==='/api/internal/props-refresh')return refreshProps({request,env});
  // Advanced-mode Pages ignores the Functions directory. Keep every supported
  // live API resource connected to its existing handler here.
  if(url.pathname==='/api/live'||url.pathname.startsWith('/api/live/')){
   const leaf=url.pathname==='/api/live'?'':url.pathname.slice('/api/live/'.length);
   if(!LIVE_RESOURCES.has(leaf))return new Response('Unknown live resource',{status:404});
   if(request.method!=='GET')return new Response('Read-only endpoint',{status:405,headers:{Allow:'GET'}});
   if(leaf==='moneyline-projections'){
    const h=url.searchParams.get('history');if(h){const archived=await moneylineRequest({request,env});if(!archived.ok)return archived;return Response.json({...await archived.json(),archived_model:true,current_model_version:FOOTBALL_MONEYLINE_VERSION,note:'Historical captures retain their original formula. Current predictions use CTD football probabilities.'},{headers:{'cache-control':'no-store'}});}
    try{return await preparedResponse('main','moneyline');}catch(e){return Response.json({status:'UNAVAILABLE',error:e.message},{status:503});}
   }
   if(['model','betting'].includes(leaf)){try{return await preparedResponse('main',leaf+'-envelope');}catch(e){return Response.json({status:'MODEL_SOURCE_UNAVAILABLE',error:e.message},{status:503});}}
   const context={request,env,preparedFeeds:preparedFeed,waitUntil:ctx.waitUntil.bind(ctx),params:{path:leaf?[leaf]:[]}};
   const response=await (LIVE_HANDLERS[leaf]||liveRequest)(context);
   if(leaf==='history'&&response.ok)return Response.json(applyHistoricalHistory(await response.json(),historicalSelection),{headers:{'cache-control':'no-store'}});
   return response;

  }
  if(!url.pathname.startsWith(prefix))return env.ASSETS.fetch(request);
  if(!['GET','HEAD'].includes(request.method))return new Response('Read-only endpoint',{status:405,headers:{Allow:'GET, HEAD'}});
  const kind=url.pathname.slice(prefix.length),ref=url.searchParams.get('ref')||'main';
  if(kind!=='release'&&!Object.hasOwn(PATHS,kind))return new Response('Unknown model resource',{status:404});
  if(!/^(main|[a-f0-9]{40})$/.test(ref))return new Response('Invalid producer reference',{status:400});
  // Spread authority is evaluated on the server, independently of browser state.
  if(kind==='recommendations'){
   try{return await preparedResponse(ref);}catch(e){return Response.json({status:'MODEL_SOURCE_UNAVAILABLE',error:e.message},{status:503});}
  }
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


