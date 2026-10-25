import {withModelDrivers} from '../workers/betting-splits/lib/model-driver-preview.mjs';
import {onRequestGet as previewRequest} from '../functions/api/live/matchup-previews.js';
import historicalSelection from '../workers/betting-splits/model/ne-chi-current-models.json' with {type:'json'};
import {applyHistoricalSelection,applyHistoricalFinal,applyHistoricalHistory} from '../workers/betting-splits/lib/historical-model-selection.mjs';
import {onRequestGet as moneylineRequest} from '../functions/api/live/moneyline-projections.js';
import {overlayMoneylineFeed,replaceMoneylineOutputs} from '../workers/betting-splits/lib/moneyline-feed.mjs';
import {onRequestGet as spreadRequest} from '../functions/api/live/spread-projections.js';
import {overlaySpreadFeed,replaceSpreadOutputs} from '../workers/betting-splits/lib/spread-feed.mjs';
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


// Coalesce concurrent requests and reuse the serialized response briefly. This
// avoids repeating the score simulations and parsing the full feed per viewer.
let recommendationCache=new Map();
let recommendationTail=Promise.resolve();
async function recommendationBody(ref,env,url){
 const now=Date.now();for(const [key,cached] of recommendationCache)if(cached.until<=now)recommendationCache.delete(key);
 const cached=recommendationCache.get(ref);if(cached)return cached.promise;
 const entry={key:ref,until:Infinity,promise:null};
 entry.promise=recommendationTail.catch(()=>{}).then(async()=>{const upstream=`https://raw.githubusercontent.com/${REPO}/${ref}/${PATHS.recommendations}`;
 const [baseResponse,modelResponse,moneylineResponse,projectionsResponse]=await Promise.all([fetch(upstream,{signal:AbortSignal.timeout(20000)}),spreadRequest({request:new Request(url.origin+'/api/live/spread-projections'),env}),moneylineRequest({request:new Request(url.origin+'/api/live/moneyline-projections'),env}),fetch(`https://raw.githubusercontent.com/${REPO}/${ref}/${PATHS.projections}`,{signal:AbortSignal.timeout(20000)})]);if(!baseResponse.ok)throw Error('Recommendation source '+baseResponse.status);const base=await baseResponse.json();for(const game of Object.values(base.games||{}))delete game.behavior_learning_context;const live=modelResponse.ok?await modelResponse.json():null,moneyline=moneylineResponse.ok?await moneylineResponse.json():null;const evaluated=applyHistoricalSelection(overlayMoneylineFeed(overlaySpreadFeed(base,live),moneyline),historicalSelection),projections=projectionsResponse.ok?await projectionsResponse.json():null;return JSON.stringify(await withModelDrivers(evaluated,live,moneyline,projections));
 }).then(body=>{entry.until=Date.now()+15000;return body;}).catch(e=>{if(recommendationCache.get(ref)===entry)recommendationCache.delete(ref);throw e;});
 recommendationTail=entry.promise.then(()=>undefined,()=>undefined);recommendationCache.set(ref,entry);return entry.promise;
}


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
   const context={request,env,waitUntil:ctx.waitUntil.bind(ctx),params:{path:leaf?[leaf]:[]}};
   const response=await (LIVE_HANDLERS[leaf]||liveRequest)(context);
   if(leaf==='history'&&response.ok)return Response.json(applyHistoricalHistory(await response.json(),historicalSelection),{headers:{'cache-control':'no-store'}});
   if(!response.ok||!['betting','model','bundle'].includes(leaf))return response;
   const body=await response.json();try{const [a,b,c]=await Promise.all([fetch(`https://raw.githubusercontent.com/${REPO}/main/${PATHS.recommendations}`,{signal:AbortSignal.timeout(20000)}),spreadRequest({request:new Request(url.origin+'/api/live/spread-projections'),env}),moneylineRequest({request:new Request(url.origin+'/api/live/moneyline-projections'),env})]);if(!a.ok)throw Error('Spread recommendation source unavailable');const consumer=await a.json(),live=b.ok?await b.json():null,moneyline=c.ok?await c.json():null,replace=d=>applyHistoricalFinal(replaceMoneylineOutputs(replaceSpreadOutputs(d,consumer,live),consumer,moneyline),historicalSelection);if(leaf==='bundle'){if(body.betting)body.betting=replace(body.betting);if(body.model)body.model=replace(body.model);}else if(body.data)body.data=replace(body.data);return Response.json(body,{headers:{'cache-control':'no-store'}});}catch(e){return Response.json({status:'SPREAD_DELIVERY_UNAVAILABLE',error:e.message},{status:502});}

  }
  if(!url.pathname.startsWith(prefix))return env.ASSETS.fetch(request);
  if(!['GET','HEAD'].includes(request.method))return new Response('Read-only endpoint',{status:405,headers:{Allow:'GET, HEAD'}});
  const kind=url.pathname.slice(prefix.length),ref=url.searchParams.get('ref')||'main';
  if(kind!=='release'&&!Object.hasOwn(PATHS,kind))return new Response('Unknown model resource',{status:404});
  if(!/^(main|[a-f0-9]{40})$/.test(ref))return new Response('Invalid producer reference',{status:400});
  // Spread authority is evaluated on the server, independently of browser state.
  if(kind==='recommendations'){
   try{const begin=performance.now(),body=await recommendationBody(ref,env,url);return new Response(body,{headers:{'content-type':'application/json','cache-control':'no-store','x-ctd-spread-model':'sportsbook-calibration-learning-v1','server-timing':'recommendations;dur='+(performance.now()-begin).toFixed(1)}});}catch(e){return Response.json({status:'MODEL_SOURCE_UNAVAILABLE',error:e.message},{status:502});}
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


