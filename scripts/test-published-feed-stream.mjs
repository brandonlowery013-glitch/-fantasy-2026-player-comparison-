import assert from 'node:assert/strict';
import {publishedFeed,streamPublishedObject} from '../functions/lib/published-feed-stream.mjs';
const payload={week:5,games:[{id:'test',probability:.58}],large:'x'.repeat(3000000)};
let options;
globalThis.fetch=async(url,opts)=>{options=opts;const r=new Response(JSON.stringify(payload));r.json=()=>{throw Error('Worker must not parse published feed');};return r;};
const source=await publishedFeed('https://example.test/validated-feed.json');
const response=streamPublishedObject({generated_at:'test',model:source,health:{model:'LIVE'},missing:null},{'content-type':'application/json','cache-control':'no-store'});
const result=JSON.parse(await response.text());
assert.deepEqual(result.model,payload);assert.equal(result.health.model,'LIVE');assert.equal(result.missing,null);assert.equal(options.cf.cacheTtl,20);assert.equal(response.headers.get('cache-control'),'no-store');
globalThis.fetch=async()=>new Response('upstream failure',{status:503});
await assert.rejects(()=>publishedFeed('https://example.test/failed-feed.json'));
console.log('PASS: 3 MB published feed forwarded without parsing, exact envelope parity, source failure and cache headers');
const {onRequest}=await import('../functions/api/live/[[path]].js');
globalThis.fetch=async url=>{
 if(String(url).includes('/scoreboard'))return new Response(JSON.stringify({events:[{id:'401',competitions:[{competitors:[{homeAway:'away',team:{abbreviation:'A'},score:'0'},{homeAway:'home',team:{abbreviation:'B'},score:'0'}]}]}]}));
 const r=new Response(JSON.stringify(payload));r.json=()=>{throw Error('Published JSON parsed on request');};return r;
};
for(const leaf of ['betting','bundle']){
 const response=await onRequest({request:new Request('https://ctd.test/api/live/'+leaf),params:{path:[leaf]}});
 assert.equal(response.status,200);const x=JSON.parse(await response.text());
 assert.deepEqual(leaf==='bundle'?x.betting:x.data,payload);
 if(leaf==='bundle'){assert.equal(x.health.betting,'LIVE');assert.equal(x.scoreboard[0].event_id,'401');}
}
console.log('PASS: actual betting and bundle handlers preserve published payload and live scoreboard without feed parsing');
