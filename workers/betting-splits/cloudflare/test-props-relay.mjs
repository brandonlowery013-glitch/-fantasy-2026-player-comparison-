import assert from 'node:assert/strict';
import {PropsRelay} from './props-relay.mjs';
const files=new Map(),storage={get:async k=>structuredClone(files.get(k)),put:async(k,v)=>{for(const [key,value] of typeof k==='string'?[[k,v]]:Object.entries(k))files.set(key,structuredClone(value));},transaction:async fn=>fn(storage),list:async({prefix,reverse,limit})=>new Map([...files].filter(([k])=>k.startsWith(prefix)).sort((a,b)=>reverse?b[0].localeCompare(a[0]):a[0].localeCompare(b[0])).slice(0,limit))};
const relay=new PropsRelay(storage,{PROPS_RELAY_URL:'https://site.test/api/internal/props-refresh'}),keys=await relay.keys();assert(!keys.public.d);let priced=0,line=40.5,offline=false;
globalThis.fetch=async(url,options)=>{
 if(String(url).includes('raw.githubusercontent.com'))return Response.json({games:{current:{week:7,home_team:'BUF',away_team:'NE',event_start:'2099-10-25T17:00:00Z'},later:{week:8,home_team:'BUF',away_team:'NE',event_start:'2099-11-01T17:00:00Z'}}});
 const body=options.body,signature=options.headers['x-ctd-signature'];
 assert(await crypto.subtle.verify('Ed25519',keys.verify,Uint8Array.from(atob(signature),c=>c.charCodeAt(0)),new TextEncoder().encode(body)));
 const claim=await relay.handle(new Request('https://store/props/claim',{method:'POST',body,headers:{'x-ctd-signature':signature}}));assert.equal(claim.status,200);
 const event=JSON.parse(body);if(offline)return new Response('',{status:503});
 if(event.path.endsWith('/events'))return Response.json([{id:'event1',commence_time:'2099-10-25T17:00:00Z',home_team:'Buffalo Bills',away_team:'New England Patriots'},{id:'later',commence_time:'2099-11-01T17:00:00Z',home_team:'Buffalo Bills',away_team:'New England Patriots'}],{headers:{'x-requests-last':'0','x-requests-remaining':'17000'}});
 priced++;const data={id:'event1',bookmakers:[{key:'draftkings',markets:[{key:'player_reception_yds',last_update:'2026-10-21T10:00:00Z',outcomes:[{description:'Player One',point:line,name:'Over',price:-110},{description:'Player One',point:line,name:'Under',price:-110}]}]}]};return Response.json({responses:[{event_id:'event1',status:200,data,last_cost:7,remaining:16993}]});
};
const time=Date.now();let r=await relay.collect({scheduled_time:time});assert.equal(r.status,200);assert.equal(priced,1,'later-week events do not spend prop credits');
const original=structuredClone(files.get('props:capture:'+time+':event1'));assert.equal(original.quotes[0].provider_updated_at,'2026-10-21T10:00:00Z');assert(Date.now()-Date.parse(original.quotes[0].observed_at)<1000,'a current observation is distinct from the source price-change time');
await relay.collect({scheduled_time:time});assert.equal(priced,1,'same scheduled event is idempotent');
await relay.collect({scheduled_time:time+1});assert.equal(priced,1,'quarter-hour heartbeat does not spend credits before two-hour due time');
const game=files.get('props:game:event1');game.observed_at=new Date(Date.now()-121*60000).toISOString();line=41.5;
await relay.collect({scheduled_time:time+2});assert.equal(priced,2);assert.equal(files.get('props:game:event1').quotes[0].line,41.5);assert.deepEqual(files.get('props:capture:'+time+':event1'),original);
files.set('props:qb-invalidation:event1',{revision_id:'qb-change-1'});await relay.collect({scheduled_time:time+20});assert.equal(priced,3,'a QB handoff refreshes affected game quotes before ordinary cadence');await relay.collect({scheduled_time:time+21});assert.equal(priced,3,'the same QB handoff does not repeatedly spend provider credits');assert.equal(files.get('props:game:event1').qb_revision_id,'qb-change-1');
const body=JSON.stringify({scheduled_time:time,nonce:crypto.randomUUID(),path:'/v4/sports/americanfootball_nfl/events',params:{}}),signature=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('Ed25519',keys.sign,new TextEncoder().encode(body)))));
const claim=()=>relay.handle(new Request('https://store/props/claim',{method:'POST',body,headers:{'x-ctd-signature':signature}}));assert.equal((await claim()).status,200);assert.equal((await claim()).status,409);
assert.equal((await relay.handle(new Request('https://store/props/claim',{method:'POST',body:body.replace('events','other'),headers:{'x-ctd-signature':signature}}))).status,401);
offline=true;const before=structuredClone(files.get('props:latest'));assert.equal((await relay.collect({scheduled_time:time+3})).status,502);assert.deepEqual(files.get('props:latest'),before);
console.log('PASS: signed provider requests, replay/tamper rejection, real quote normalization, adaptive credit-saving cadence, durable unchanged history and failed-provider preservation');

assert.equal(files.get('props:latest').expected_games,1);assert.equal(files.get('props:latest').game_ids.length,1);console.log('PASS: official schedule scopes paid captures to the current NFL week');

const missingHeaders={remaining:null,last_cost:5,used_this_run:0};await assert.rejects(relay.provider('/v4/sports/americanfootball_nfl/events',{}, {scheduled_time:Date.now()},missingHeaders),/HTTP 503/);assert.equal(missingHeaders.used_this_run,0,'a failed request without quota headers must not reuse the previous successful cost');console.log('PASS: missing quota headers never invent provider spend');

const {TEAMS}=await import('./props-week.mjs'),teams=Object.entries(TEAMS),batchSizes=[],schedule={games:{}},providerEvents=[];
for(let i=0;i<8;i++){const id=String(i+1).padStart(32,'0'),home=teams[i*2],away=teams[i*2+1],commence_time='2099-10-25T17:00:00Z';providerEvents.push({id,home_team:home[0],away_team:away[0],commence_time});schedule.games[id]={week:7,home_team:home[1],away_team:away[1],event_start:commence_time};}
let relayRequests=0;
globalThis.fetch=async(url,options)=>{
 if(String(url).includes('raw.githubusercontent.com'))return Response.json(schedule);
 relayRequests++;assert(relayRequests<=6,'collection must remain below the repeated relay call limit');
 const body=options.body,signature=options.headers['x-ctd-signature'];assert.equal((await relay.handle(new Request('https://store/props/claim',{method:'POST',body,headers:{'x-ctd-signature':signature}}))).status,200);
 const request=JSON.parse(body);if(request.path.endsWith('/events'))return Response.json(providerEvents,{headers:{'x-requests-last':'0','x-requests-remaining':'17000'}});
 batchSizes.push(request.event_ids.length);return Response.json({responses:request.event_ids.map(id=>({event_id:id,status:200,last_cost:5,remaining:16900,data:{id,bookmakers:[{key:'draftkings',markets:[{key:'player_pass_yds',last_update:'2026-10-21T10:00:00Z',outcomes:[{description:'Player One',point:200.5,name:'Over',price:-110},{description:'Player One',point:200.5,name:'Under',price:-110}]}]}]}}))});
};
await relay.collect({scheduled_time:Date.now()+40});assert.deepEqual(batchSizes,[4,4]);assert.equal(relayRequests,3);const complete=await(await relay.handle(new Request('https://store/props/latest.json'))).json();assert.equal(complete.health.status,'CURRENT');assert.equal(complete.quotes.length,8);assert.deepEqual(files.get('props:capture:'+time+':event1'),original);
console.log('PASS: eight games collect in two bounded batches, below six relay calls, while original saved history stays unchanged');
