import assert from 'node:assert/strict';
import {buildPreview,previewKey} from '../lib/matchup-preview.mjs';
import {MatchupPreviewStore} from './matchup-previews.mjs';
const now=Date.parse('2026-10-24T23:00Z'),game={away_team:'NE',home_team:'CHI',kickoff:'2026-10-25T17:00Z'},observations=[];
for(let i=1;i<=3;i++)for(const team of ['NE','CHI','BUF','DET'])observations.push({season:2026,entity_type:'team',team,event_id:(['NE','BUF'].includes(team)?'n':'c')+i,event_start:`2026-10-${String(4+i).padStart(2,'0')}T17:00Z`,observed_at:'2026-10-10T18:00Z',verified_final:true,metrics:{rush_yards:110,rush_attempts:25,net_passing_yards:210,sacks_allowed:2,turnovers:1,third_down_conversions:5,third_down_attempts:12}});
const ledger={observations},availability={observed_at:new Date(now).toISOString(),injuries:[{team:'NE',name:'Test QB',status:'Questionable',source_updated_at:new Date(now-60000).toISOString(),source_url:'https://www.espn.com/nfl/injuries'}]};
const original=JSON.stringify({game,ledger,availability}),p=buildPreview(game,ledger,availability,now);assert(p.sections.length>=5);assert(p.sections.find(s=>s.title==='NE availability').text.includes('questionable'));assert(p.evidence.every(e=>e.n===3));assert.equal(JSON.stringify({game,ledger,availability}),original);
const polluted=structuredClone(ledger);polluted.observations.push({...observations[0],event_start:game.kickoff,event_id:'current',metrics:{rush_yards:999999,rush_attempts:1}});assert.deepEqual(buildPreview(game,polluted,availability,now),p);
const stale={...availability,observed_at:new Date(now-3600000).toISOString()};assert(!buildPreview(game,ledger,stale,now).sections.some(s=>s.title==='NE availability'));
assert.notEqual(previewKey(game),previewKey({...game,kickoff:'2026-11-01T17:00Z'}));
const mem=new Map([['availability:latest',availability]]),storage={get:async k=>mem.get(k),put:async(k,v)=>typeof k==='string'?mem.set(k,v):Object.entries(k).forEach(([a,b])=>mem.set(a,b))};
let week=7,fail=false;const read=async url=>{if(fail)throw Error('offline');if(url.includes('api.github.com'))return Response.json({object:{sha:'a'.repeat(40)}});return Response.json(url.includes('postgame-model')?ledger:url.includes('weekly-event-schedule')?{season:2026,week,games:{g:{...game,event_start:game.kickoff}}}:{season:2026,week,games:{g:game}});};
const store=new MatchupPreviewStore(storage,read,()=>now),event={scheduled_time:now,cron:'*/15 * * * *'};assert.equal((await store.collect(event)).status,200);assert((await (await store.collect(event)).json()).duplicate);week=8;assert.equal((await store.collect({...event,scheduled_time:now+1})).status,200);assert.equal(mem.get('preview:latest').week,8);fail=true;assert.equal((await store.collect({...event,scheduled_time:now+2})).status,502);assert.equal(mem.get('preview:latest').week,8);assert.equal((await store.handle(new Request('https://store/matchup-previews/latest.json'))).status,200);
console.log('PASS: written football previews, no future games, availability freshness, weekly identity, model inputs unchanged, scheduled rollover, idempotence, last-good preservation.');
const {default:worker}=await import('./worker.mjs');
for(const failed of ['/collect','/availability/collect','/matchup-previews/collect']){
 const attempted=[];let availabilityDone=false;
 const env={MATCHUP_PREVIEWS_ENABLED:'true',AVAILABILITY_ENABLED:'true',SPLITS_STORE:{idFromName:()=>0,get:()=>({fetch:async url=>{const path=new URL(url).pathname;if(path==='/availability/collect'){await Promise.resolve();availabilityDone=true;}if(path==='/matchup-previews/collect')assert(availabilityDone,'Preview waits for availability attempt');attempted.push(path);return Response.json({status:path===failed?'FAILED':'CURRENT'},{status:path===failed?502:200});}})}};
 await assert.rejects(worker.scheduled({scheduledTime:now,cron:'*/15 * * * *'},env));assert(attempted.includes('/matchup-previews/collect'));assert(attempted.includes('/collect'));assert(attempted.includes('/availability/collect'));
}
console.log('PASS: deployed cron path schedules previews after availability; preview and market-provider failures are isolated.');

const tough=structuredClone(ledger);for(const r of tough.observations)if(r.team==='DET')r.metrics.rush_yards=50;assert(buildPreview(game,tough,availability,now).sections[0].text.includes('held opponents below'));const soft=structuredClone(ledger);for(const r of soft.observations)if(r.team==='DET')r.metrics.rush_yards=200;assert(buildPreview(game,soft,availability,now).sections[0].text.includes('possible opening'));
