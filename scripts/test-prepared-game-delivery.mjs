import assert from 'node:assert/strict';
import {gzipSync,gunzipSync} from 'node:zlib';
import worker from '../frontend/_worker.js';
const original=globalThis.fetch,env={ASSETS:{fetch:async()=>new Response('static untouched')}},ctx={waitUntil:p=>p};
let calls=[],stale=false;
const feed={season:2026,week:8,games:{g:{probability:.51}}};
const request=(path,method='GET')=>worker.fetch(new Request('https://preview.example'+path,{method}),env,ctx);
try{
 globalThis.fetch=async url=>{
  calls.push(String(url));
  if(String(url).endsWith('.manifest.json'))return Response.json({kind:'PRECOMPUTED_SERVER_MODEL',generated_at:new Date(Date.now()-60000).toISOString(),expires_at:new Date(Date.now()+(stale?-1:600000)).toISOString()});
  if(String(url).endsWith('.moneyline.json'))return Response.json({model_version:'ctd-football-moneyline-v1',games:feed.games});
  return new Response(gzipSync(JSON.stringify(feed)));
 };
 let r=await request('/cloudflare/api/game-model/recommendations');
 assert.equal(r.status,200);assert.equal(r.headers.get('x-ctd-model-delivery'),'precomputed');
 assert.deepEqual(JSON.parse(gunzipSync(Buffer.from(await r.arrayBuffer()))),feed);
 assert.equal(calls.length,2,'One small manifest and one streaming result, no model inputs or simulation');
 assert(calls.every(u=>u.includes('/data/prepared-game-model/data/market/')));
 r=await request('/api/live/moneyline-projections');assert.equal(r.status,200);assert.equal((await r.json()).games.g.probability,.51);
 stale=true;const before=calls.length;r=await request('/cloudflare/api/game-model/recommendations');assert.equal(r.status,503);assert.equal(calls.length,before+1,'Expired output must not be fetched or presented as fresh');
 assert.equal((await request('/cloudflare/')).status,200);
 assert.equal((await request('/cloudflare/api/game-model/secret')).status,404);
 assert.equal((await request('/cloudflare/api/game-model/recommendations?ref=../../private')).status,400);
 assert.equal((await request('/cloudflare/api/game-model/recommendations','POST')).status,405);
 assert.equal((await request('/cloudflare/api/game-model/recommendations?ref='+'a'.repeat(40))).status,503,'Never substitute a current model for a requested historical release');
 globalThis.fetch=async()=>new Response('unavailable',{status:503});assert.equal((await request('/cloudflare/api/game-model/lines')).status,502);
 globalThis.fetch=async()=>{throw Error('timeout');};assert.equal((await request('/cloudflare/api/game-model/lines')).status,504);
}finally{globalThis.fetch=original;}
console.log('PASS: exact prepared values, compressed streaming, expiry rejection, moneyline companion, release identity, static forwarding and read-only errors.');
