import assert from 'node:assert/strict';
import worker,{SplitsStore} from './worker.mjs';
const files=new Map();
const storage={get:async k=>structuredClone(files.get(k)),put:async(k,v)=>{for(const [key,value] of typeof k==='string'?[[k,v]]:Object.entries(k))files.set(key,structuredClone(value));},list:async({prefix})=>new Map([...files].filter(([k])=>k.startsWith(prefix)).sort()),transaction:async fn=>{const saved=structuredClone(files);try{return await fn(storage);}catch(e){files.clear();for(const [k,v]of saved)files.set(k,v);throw e;}}};
const object=new SplitsStore({storage},{}),env={SPLITS_STORE:{idFromName:()=>0,get:()=>({fetch:(...a)=>object.fetch(new Request(...a))})}};
const row=(name,m,b)=>`<div class="tb-sodd"><div>${name}</div><div>-110</div><div>${m}%</div><div>${b}%</div></div>`;
const market=(name,a,b)=>`<div><div class="tb-se-head"><div>${name}</div><div>Odds</div><div>% Handle</div><div>% Bets</div></div>${row(a,70,40)}${row(b,30,60)}</div>`;
const html=`<div class="tb-se"><div class="tb-se-title"><img src="https://x/teams/nfl/NE.png"><img src="https://x/teams/nfl/BUF.png">10/25, 01:00PM</div><div class="tb-market-wrap">${market('Moneyline','NE Patriots','BUF Bills')}${market('Spread','NE +3','BUF -3')}${market('Total','Over 40','Under 40')}</div></div>`;
const event={id:'next',date:'2099-10-25T17:00:00Z',status:{type:{completed:false}},competitions:[{competitors:[{homeAway:'away',team:{abbreviation:'NE'}},{homeAway:'home',team:{abbreviation:'BUF'}}]}]};
let calls=0,offline=false;globalThis.fetch=async u=>{calls++;if(offline)throw Error('provider offline');return new Response(u.includes('espn.com')?JSON.stringify({events:[event]}):html);};
const get=async path=>(await worker.fetch(new Request('https://public'+path),env));
assert.equal((await get('/latest.json')).status,404);
assert.equal((await worker.fetch(new Request('https://public/collect',{method:'POST'}),env)).status,405);
assert.equal(calls,0,'public requests cannot collect');
const time=Date.parse('2026-10-21T22:30:00Z');
await worker.scheduled({scheduledTime:time,cron:'*/15 * * * *'},env);
const latest=await(await get('/latest.json')).json();assert.equal(latest.collection.event,'cloudflare-cron');assert.equal(latest.games[0].moneyline[0].money,70);assert.equal(calls,3);
const baseline=await(await get('/history/2026-10-21.json')).json();assert.equal(baseline.snapshots.length,1);
await worker.scheduled({scheduledTime:time,cron:'*/15 * * * *'},env);assert.equal(calls,3,'duplicate schedule does not refetch or rewrite');
await worker.scheduled({scheduledTime:time+900000,cron:'*/15 * * * *'},env);
const history=await(await get('/history/2026-10-21.json')).json();assert.equal(history.snapshots.length,2);assert.deepEqual(history.snapshots[0],baseline.snapshots[0]);
offline=true;await assert.rejects(worker.scheduled({scheduledTime:time+1800000,cron:'*/15 * * * *'},env),/provider offline/);
assert.deepEqual(await(await get('/history/2026-10-21.json')).json(),history);assert.equal((await(await get('/status.json')).json()).status,'FAILED');assert.equal((await(await get('/latest.json')).json()).collection.capture_id,'cloudflare:'+(time+900000));
assert.equal((await get('/history/../../secret')).status,404);
console.log('PASS: Cloudflare scheduled handler, private collection, immutable history, idempotency, failed-provider preservation, public reads never collect');

for(const failed of ['/collect','/props/collect']){
 const attempted=[];const isolated={PROPS_RELAY_URL:'https://site.test/relay',SPLITS_STORE:{idFromName:()=>0,get:()=>({fetch:async url=>{const path=new URL(url).pathname;attempted.push(path);return Response.json({status:path===failed?'FAILED':'CURRENT'},{status:path===failed?502:200});}})}};
 await assert.rejects(worker.scheduled({scheduledTime:Date.now(),cron:'*/15 * * * *'},isolated),/collection failed/);
 assert.deepEqual(attempted.sort(),['/collect','/props/collect'],'one provider failure must not prevent the other scheduled collection');
}
console.log('PASS: split and prop collections run independently when either provider fails');
for(const failed of ['/collect','/moneyline-projections/collect']){
 const attempted=[];let splitsSettled=false;const isolated={MONEYLINE_MODEL_ENABLED:'true',SPLITS_STORE:{idFromName:()=>0,get:()=>({fetch:async url=>{const path=new URL(url).pathname;if(path==='/collect'){await Promise.resolve();splitsSettled=true;}if(path==='/moneyline-projections/collect')assert(splitsSettled,'moneyline must read the completed split collection or its retained last-good snapshot');attempted.push(path);return Response.json({status:path===failed?'FAILED':'CURRENT'},{status:path===failed?502:200});}})}};
 await assert.rejects(worker.scheduled({scheduledTime:Date.now(),cron:'*/15 * * * *'},isolated),/collection failed/);assert.deepEqual(attempted,['/collect','/moneyline-projections/collect']);
}
console.log('PASS: moneyline reads freshly saved sportsbook prices and still runs after split-provider failure');
