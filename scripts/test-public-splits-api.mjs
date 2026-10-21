import assert from 'node:assert/strict';
import {onRequestGet} from '../functions/api/live/splits.js';
const now=Date.now(),at=new Date(now).toISOString(),start=new Date(now+86400000).toISOString();
const pair=[{side:'NE',bets:40,money:70},{side:'BUF',bets:60,money:30}];
const game={event_id:'one',home:'BUF',away:'NE',start_at:start,observed_at:at,moneyline:pair,spread:pair,total:[{...pair[0],side:'Over'},{...pair[1],side:'Under'}]};
let feed={schema_version:1,status:'CURRENT',observed_at:at,games:[game],collection:{last_success_at:at,event:'schedule'},history:{date:at.slice(0,10)}},status={status:'CURRENT',last_attempt_at:at},offline=false,calls=[];
const originalFetch=globalThis.fetch;
const saved=new Map(),jobs=[];
globalThis.caches={default:{async match(k){return saved.get(k.url)?.clone();},async put(k,r){saved.set(k.url,r.clone());}}};
globalThis.fetch=async url=>{calls.push(url);if(offline)throw Error('offline');return Response.json(url.includes('status.json')?status:url.includes('index.json')?{days:[at.slice(0,10)]}:url.includes('/history/')?{snapshots:[{games:[game]}]}:feed);};
const ctx={request:new Request('https://site.test/api/live/splits'),env:{ASSETS:{fetch:async()=>Response.json({games:[]})}},waitUntil:p=>jobs.push(p)};
try{
 let data=await(await onRequestGet(ctx)).json();await Promise.all(jobs);
 assert.equal(data.health.status,'CURRENT');assert.equal(data.health.collection_event,'schedule');assert.deepEqual(data.games[0].moneyline,pair);assert(calls.every(u=>u.includes('raw.githubusercontent.com')),'read-only endpoint must not collect from provider');
 status={status:'FAILED',error:'provider unavailable',last_attempt_at:at};data=await(await onRequestGet(ctx)).json();await Promise.all(jobs);assert.equal(data.health.status,'STALE');assert.equal(data.games.length,1);assert.equal(data.health.last_success_at,at);
 offline=true;data=await(await onRequestGet(ctx)).json();assert.equal(data.health.status,'STALE');assert.equal(data.games.length,1);assert.equal(data.games[0].observed_at,at);
 offline=false;status={status:'CURRENT'};feed={...feed,collection:{last_success_at:new Date(now-3600000).toISOString()}};data=await(await onRequestGet(ctx)).json();assert.equal(data.health.status,'STALE');
 for(const value of ['../status','2026-02-31','not-a-date']){ctx.request=new Request('https://site.test/api/live/splits?history='+value);assert.equal((await onRequestGet(ctx)).status,400);}
 ctx.request=new Request('https://site.test/api/live/splits?history=index');assert.deepEqual((await(await onRequestGet(ctx)).json()).days,[at.slice(0,10)]);
 ctx.request=new Request('https://site.test/api/live/splits?history='+at.slice(0,10));assert.equal((await(await onRequestGet(ctx)).json()).snapshots.length,1);
}finally{globalThis.fetch=originalFetch;}
console.log('PASS: background publication delivery, failed/stale status, last-good preservation, no request-triggered collection, history access and path validation');
