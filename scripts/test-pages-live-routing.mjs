import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gzipSync} from 'node:zlib';
import worker from '../frontend/_worker.js';

const routes=JSON.parse(fs.readFileSync('frontend/_routes.json','utf8'));
const env={ASSETS:{fetch:async()=>new Response('static',{status:404})}};
const ctx={waitUntil:()=>{}};
const request=(path,method='GET')=>worker.fetch(new Request('https://ctd.test'+path,{method}),env,ctx);
const original=globalThis.fetch;
const competitors=[{homeAway:'away',team:{id:'1',abbreviation:'WSH'},score:'17'},{homeAway:'home',team:{id:'2',abbreviation:'SF'},score:'24'}];
let calls=[];
try {
 globalThis.fetch=async url=>{
  calls.push(String(url));
  if(String(url).includes('/scoreboard'))return Response.json({events:[{id:'401873008',status:{type:{state:'post',completed:true,shortDetail:'Final'}},competitions:[{competitors}]}]});
  return Response.json({header:{id:'401873008',competitions:[{id:'401873008',competitors,status:{type:{state:'post',completed:true,shortDetail:'Final'}}}]},boxscore:{players:[{team:{abbreviation:'SF'},statistics:[{name:'passing',labels:['YDS'],athletes:[{athlete:{id:'12345',displayName:'Test Player'},stats:['250']}]}]}]}});
 };
 assert(routes.include.includes('/api/live/*'));
 assert(routes.include.includes('/api/live'));
 let response=await request('/api/live/scoreboard?week=6');
 assert.equal(response.status,200);
 let body=await response.json();
 assert.equal(body.games[0].event_id,'401873008');
 assert.equal(body.games[0].completed,true);
 assert(calls[0].includes('year=2026&seasontype=2&week=6'));
 response=await request('/api/live/game?event=401873008');
 assert.equal(response.status,200);
 body=await response.json();
 assert.equal(body.game.provider_event_id,'401873008');
 assert.equal(body.game.home_score,24);
 assert.equal(body.game.player_stats[0].player_id,'12345');
 assert.equal(body.game.player_stats[0].stats.YDS,'250');
 const before=calls.length;
 assert.equal((await request('/api/live/scoreboard?week=invalid')).status,400);
 assert.equal((await request('/api/live/game')).status,400);
 assert.equal((await request('/api/live/scoreboard','POST')).status,405);
 assert.equal(calls.length,before);
 assert.equal((await request('/cloudflare/')).status,404);
 globalThis.fetch=async()=>new Response('failure',{status:503});
 assert.equal((await request('/api/live/scoreboard?week=6')).status,502);
} finally {globalThis.fetch=original;}
console.log('PASS: Pages route inclusion, Worker dispatch, historical-week forwarding, final score/player IDs, invalid inputs, static forwarding and upstream failure');

// Exercise every existing backend resource through the actual Pages Worker.
const originalCaches=globalThis.caches;
const savedAssets={schema_version:1,games:[],observed_at:new Date().toISOString()};
const records=new Map();
globalThis.caches={default:{match:async key=>records.get(key.url)?.clone(),put:async(key,response)=>{records.set(key.url,response.clone());}}};
const waits=[];
const context={waitUntil:promise=>waits.push(promise)};
const assets={ASSETS:{fetch:async()=>Response.json(savedAssets)}};
try {
 globalThis.fetch=async url=>{
  const value=String(url).split('?')[0];calls.push(value);
  if(value.endsWith('.manifest.json'))return Response.json({kind:'PRECOMPUTED_SERVER_MODEL',generated_at:new Date().toISOString(),expires_at:new Date(Date.now()+600000).toISOString()});
  if(value.includes('prepared-game-model-2026.')&&value.endsWith('.json.gz'))return new Response(gzipSync(JSON.stringify(value.includes('-envelope')?{data:{published:true,games:[]}}:{published:true,games:[]})));  
  if(value.includes('/scoreboard'))return Response.json({events:[]});
  if(value.includes('/live-news.json'))return Response.json({fetched_at:new Date().toISOString(),articles:[]});
  if(value.includes('current-game-lines'))return Response.json({quote_type:'pregame',games:[]});
  return Response.json({published:true,games:[]});
 };
 // Health and bundle require a real provider mapping, even with published feeds mocked.
 const sourceFetch=globalThis.fetch;
 globalThis.fetch=async(url,...args)=>String(url).includes('/scoreboard')?Response.json({events:[{id:'401873008',date:'2026-10-19T00:00Z',status:{type:{state:'post',completed:true}},competitions:[{competitors}]}]}):sourceFetch(url,...args);
 for(const leaf of ['', 'health','news','odds','splits','bundle','model','betting','injuries','players','history']){
  const response=await worker.fetch(new Request('https://ctd.test/api/live'+(leaf?'/'+leaf:'')),assets,context);
  assert.equal(response.status,200,leaf||'root health');
  const data=response.headers.get('content-encoding')==='gzip'?JSON.parse((await import('node:zlib')).gunzipSync(Buffer.from(await response.arrayBuffer()))):await response.json();
  if(leaf==='news')assert.equal(data.status,'CURRENT');
  if(leaf==='odds')assert.equal(data.quote_type,'pregame');
  if(leaf==='splits')assert.equal(data.schema_version,1);
  if(['model','betting','injuries','players'].includes(leaf))assert.equal(data.data.published,true);
  if(leaf==='bundle')assert.equal(data.betting.published,true);
  if(leaf==='history')assert.equal(data.published,true);
  if(leaf==='players')assert(calls.some(url=>url.includes('/frontend/ctd-cloudflare-work/data/weekly/weekly-player-outlook-2026.json')),'outlook must use the branch that publishes it');
 }
 assert.equal((await request('/api/live/not-a-resource')).status,404);
 assert.equal((await request('/api/live/news','POST')).status,405);
 await Promise.all(waits);
} finally {globalThis.fetch=original;globalThis.caches=originalCaches;}
console.log('PASS: complete live API inventory including news, odds, splits, health, bundle and published feeds dispatches through Pages');
