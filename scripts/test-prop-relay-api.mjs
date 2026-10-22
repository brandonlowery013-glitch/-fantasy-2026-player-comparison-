import fs from 'node:fs';
import assert from 'node:assert/strict';
import {refreshProps,onRequestGet} from '../functions/api/live/prop-quotes.js';
const pair=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']),publicKey=await crypto.subtle.exportKey('jwk',pair.publicKey);
let providerCalls=0,claimed=false,claimResponse;
const env={ODDS_API_KEY:'test-secret-not-a-real-key',SPLITS_SCHEDULER:{fetch:async request=>{if(new URL(request.url).pathname==='/props/claim'){if(claimed)return new Response('',{status:409});claimed=true;claimResponse=Response.json({accepted:true});return claimResponse;}return Response.json({quotes:[],health:{status:'CURRENT'}});}}};
globalThis.fetch=async url=>{assert.equal(claimResponse.bodyUsed,true,'release the claim response before opening a provider request');providerCalls++;assert.equal(new URL(url).origin,'https://api.the-odds-api.com');assert.equal(new URL(url).searchParams.get('apiKey'),env.ODDS_API_KEY);return Response.json([{id:'fixture'}],{headers:{'x-requests-last':'0','x-requests-remaining':'17000'}});};
const body=JSON.stringify({scheduled_time:Date.now(),nonce:crypto.randomUUID(),path:'/v4/sports/americanfootball_nfl/events',params:{dateFormat:'iso'}}),sig=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('Ed25519',pair.privateKey,new TextEncoder().encode(body)))));
const req=(text=body,signature=sig)=>new Request('https://site/api/internal/props-refresh',{method:'POST',headers:{'x-ctd-signature':signature},body:text});
assert.equal((await refreshProps({request:req(body,'bad'),env},publicKey)).status,401);assert.equal(providerCalls,0);
assert.equal((await refreshProps({request:req(body.replace('events','evil')),env},publicKey)).status,401);assert.equal(providerCalls,0);
const response=await refreshProps({request:req(),env},publicKey);assert.equal(response.status,200);assert.deepEqual(await response.json(),[{id:'fixture'}]);assert.equal(response.headers.get('x-requests-remaining'),'17000');assert.equal(providerCalls,1);
assert.equal((await refreshProps({request:req(),env},publicKey)).status,409);assert.equal(providerCalls,1,'replays cannot spend provider credits');
assert.equal((await onRequestGet({request:new Request('https://site/api/live/prop-quotes?history=../key'),env})).status,400);await onRequestGet({request:new Request('https://site/api/live/prop-quotes'),env});assert.equal(providerCalls,1,'reading current quotes never calls paid provider');
console.log('PASS: signature and replay enforcement, credential confinement, provider quota headers, invalid history paths, and read-only public quotes');

const routes=JSON.parse(fs.readFileSync(new URL('../frontend/_routes.json',import.meta.url),'utf8'));assert(routes.include.includes('/api/internal/props-refresh'),'Pages must invoke the Worker for the signed relay path');assert(routes.include.includes('/api/live/*'),'Pages must invoke the Worker for public prop reads');console.log('PASS: deployed Pages route manifest includes the signed relay and public feed');
