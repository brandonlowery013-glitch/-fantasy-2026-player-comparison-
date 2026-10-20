import fs from 'node:fs';import assert from 'node:assert/strict';
const worker=(await import('../frontend/_worker.js')).default;
const original=globalThis.fetch;let calls=[];
globalThis.fetch=async(url)=>{calls.push(url);return new Response('{"games":{"g":{"probability":0.51}}}',{headers:{etag:'fixture'}});};
const env={ASSETS:{fetch:async()=>new Response('static untouched')}},ctx={waitUntil:p=>p};
try{
 const response=await worker.fetch(new Request('https://preview.example/cloudflare/api/game-model/recommendations?ref='+'a'.repeat(40)),env,ctx);
 assert.equal(response.status,200);assert.equal((await response.json()).games.g.probability,.51);assert(calls[0].endsWith('/'+'a'.repeat(40)+'/data/market/game-model-consumer-2026.json'));
 assert.equal((await worker.fetch(new Request('https://preview.example/cloudflare/'),env,ctx)).status,200);
 assert.equal((await worker.fetch(new Request('https://preview.example/cloudflare/api/game-model/secret'),env,ctx)).status,404);
 assert.equal((await worker.fetch(new Request('https://preview.example/cloudflare/api/game-model/recommendations?ref=../../private'),env,ctx)).status,400);
 assert.equal((await worker.fetch(new Request('https://preview.example/cloudflare/api/game-model/recommendations',{method:'POST'}),env,ctx)).status,405);
 globalThis.fetch=async()=>new Response('unavailable',{status:503});assert.equal((await worker.fetch(new Request('https://preview.example/cloudflare/api/game-model/lines'),env,ctx)).status,502);
 globalThis.fetch=async()=>{throw Error('timeout');};assert.equal((await worker.fetch(new Request('https://preview.example/cloudflare/api/game-model/lines'),env,ctx)).status,504);
}finally{globalThis.fetch=original;}
console.log('PASS: same-release data relay, unchanged JSON, static forwarding, read-only allowlist, reference validation and fail-closed errors');
