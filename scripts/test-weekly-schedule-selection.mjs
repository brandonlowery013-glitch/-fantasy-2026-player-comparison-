import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {chooseWeek,providerGameFinal} from '../lib/weekly-schedule-selection.mjs';

const now=Date.parse('2026-10-06T03:30:00Z');
const game=(week,event_start,completed)=>({week,event_start,completed});
const live=game(4,'2026-10-06T00:15:00Z',false);
const next=game(5,'2026-10-09T00:15:00Z',false);
assert.equal(chooseWeek([live,next],now),4,'Monday kickoff must not advance a live week');
assert.equal(chooseWeek([{...live,completed:undefined},next],now),4,'unknown/postponed state must retain current week');
assert.equal(chooseWeek([{...live,completed:true},next],now),5,'explicit finals permit rollover');
assert.equal(chooseWeek([game(3,'2026-09-29T00:15:00Z'),live,next],now,null,4),4,'deployed anchor excludes old unknown rows');
assert.equal(chooseWeek([live],now),4);
assert.equal(chooseWeek([game(18,'2027-01-10T20:00:00Z',true)],Date.parse('2027-01-11')),18);
assert.equal(chooseWeek([],now),null);
assert.equal(chooseWeek([live,next],now,'5'),5);
assert.throws(()=>chooseWeek([live],now,'19'),/Invalid NFL_WEEK/);
assert.equal(providerGameFinal({completed:true}),true);
assert.equal(providerGameFinal({state:'post'}),true);
for(const status of [undefined,{state:'in'},{state:'pre'},{name:'STATUS_POSTPONED'}])assert.equal(providerGameFinal(status),false);

// Run the real ingestion entry point offline in a disposable repository fixture.
// Its output is what the deployed page consumes; no static baseline may change.
const root=process.cwd(),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'weekly-selection-'));
try{
  const copy=file=>{const target=path.join(tmp,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,file),target);};
  for(const file of ['scripts/ingest-weekly-football-data.mjs','lib/complete-week-schedule.mjs','lib/weekly-schedule-selection.mjs','lib/injury-evidence.mjs','MODEL_SOURCE_OF_TRUTH.json','data/sources/weekly-football-ingestion-2026.json','data/ingestion/weekly-football-source-snapshots-2026.json'])copy(file);
  const fixtureLedger=path.join(tmp,'data/ingestion/weekly-football-source-snapshots-2026.json');const evidence=JSON.parse(fs.readFileSync(fixtureLedger));evidence.snapshots=(evidence.snapshots||[]).filter(x=>Date.parse(x.captured_at)<=now);fs.writeFileSync(fixtureLedger,JSON.stringify(evidence));
  const truth=JSON.parse(fs.readFileSync(path.join(root,'MODEL_SOURCE_OF_TRUTH.json')));
  for(let i=0;i<Number(truth.runtime_player_shards);i++)copy(`players${i}.json`);
  const baseline=new Map(['MODEL_SOURCE_OF_TRUTH.json',...Array.from({length:Number(truth.runtime_player_shards)},(_,i)=>`players${i}.json`)].map(file=>[file,fs.readFileSync(path.join(tmp,file))]));
  fs.mkdirSync(path.join(tmp,'data/calibration'),{recursive:true});
  const schedule=path.join(tmp,'data/calibration/weekly-event-schedule-2026.json');
  const mock=path.join(tmp,'mock-feed.mjs');
  fs.writeFileSync(mock,`
    const event=(id,week,date,away,home,completed)=>({id,week:{number:week},season:{year:2026,type:2},date,status:{type:{state:completed?'post':'in',completed}},competitions:[{competitors:[{homeAway:'away',team:{abbreviation:away}},{homeAway:'home',team:{abbreviation:home}}]}]});
    const current=[event('401',4,'2026-10-02T00:15:00Z','PIT','CLE',true),event('402',4,'2026-10-06T00:15:00Z','KC','BUF',process.env.MOCK_FINAL==='true')];
    const next=[event('501',5,'2026-10-09T00:15:00Z','DAL','NYG',false)];
    globalThis.fetch=async url=>{const week=new URL(url).searchParams.get('week');
      if(process.env.MOCK_FAIL==='true'&&week==='4')return {ok:false,status:503};
      // Deliberately capped discovery omits the unfinished current-week game.
      return {ok:true,json:async()=>({events:week==='4'?current:next})};};
  `);
  const reset=()=>fs.writeFileSync(schedule,JSON.stringify({season:2026,week:4,games:{}}));
  // Remove the inherited forced-week override for automatic selection.
  const run=env=>{const overrides={...env};const saved=process.env.NFL_WEEK;delete process.env.NFL_WEEK;try{
    return execFileSync(process.execPath,['--import',mock,path.join(tmp,'scripts/ingest-weekly-football-data.mjs')],{cwd:tmp,env:{...process.env,INGEST_NOW:new Date(now).toISOString(),...overrides},stdio:'pipe'});
  }finally{if(saved!==undefined)process.env.NFL_WEEK=saved;}};
  reset();run();
  let deployed=JSON.parse(fs.readFileSync(schedule));
  assert.equal(deployed.week,4);assert.equal(Object.keys(deployed.games).length,2);
  assert.equal(deployed.games['2026-W4-KC-BUF'].completed,false);
  assert.equal(deployed.games['2026-W4-PIT-CLE'].completed,true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(tmp,'data/probability/weekly-football-context-raw-2026.json'))).week,4);
  reset();run({MOCK_FINAL:'true'});assert.equal(JSON.parse(fs.readFileSync(schedule)).week,5);
  reset();const before=fs.readFileSync(schedule);assert.throws(()=>run({MOCK_FAIL:'true'}));assert.deepEqual(fs.readFileSync(schedule),before,'unverified current week must fail before writes');
  reset();run({NFL_WEEK:'5',MOCK_FAIL:'true'});assert.equal(JSON.parse(fs.readFileSync(schedule)).week,5,'explicit gated rollover bypasses discovery');
  const player=JSON.parse(fs.readFileSync(path.join(tmp,'players0.json')))[0].n;
  fs.writeFileSync(path.join(tmp,'data/ingestion/weekly-football-source-snapshots-2026.json'),JSON.stringify({snapshots:[{week:1,player,signal_type:'role',source:'TEST_SOURCE',captured_at:'2026-10-01T12:00:00Z'}]}));
  const selfEnv={...process.env,INGEST_NOW:'2026-08-27T12:00:00Z',NFL_WEEK:'1'};
  execFileSync(process.execPath,[path.join(tmp,'scripts/ingest-weekly-football-data.mjs'),'--self-test'],{cwd:tmp,env:selfEnv,stdio:'pipe'});
  assert.equal(JSON.parse(fs.readFileSync(path.join(tmp,'guardrails/weekly-football-ingestion-report.json'))).result,'PASS','fixed-date self-test is isolated from production evidence');
  assert.throws(()=>run({INGEST_NOW:'2026-08-27T12:00:00Z',NFL_WEEK:'1'}),'production must still reject future evidence');
  for(const [file,bytes] of baseline)assert.deepEqual(fs.readFileSync(path.join(tmp,file)),bytes,`${file} static baseline changed`);
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
console.log('PASS: live/unknown weeks retained, final-only rollover, capped discovery/deployed output, fail-closed verification, forced week and static baseline separation');
