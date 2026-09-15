import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ctd-bridge-test-'));
const write=(p,v)=>{fs.mkdirSync(path.dirname(path.join(dir,p)),{recursive:true});fs.writeFileSync(path.join(dir,p),JSON.stringify(v));};
try {
  const cases=['timestamp-only','wrong-event','applied','missing-score','missing-total','zero-spread','old-projection'];
  const games={},markets={};
  for(const id of cases){
    games[id]={home_team:'DET',away_team:'NO',model:{home_score_mean:26,away_score_mean:21,model_home_spread:-5,model_total:47},applied_source_event_ids:id==='timestamp-only'?[]:id==='wrong-event'?['other']:['event-'+id]};
    markets[id]={snapshots:[{captured_at:'2026-09-12T13:00:00Z',home_spread:id==='zero-spread'?0:-5,total:id==='missing-total'?null:47}]};
  }
  games['missing-score'].model.home_score_mean=null;
  write('data/sources/team-scoring-market-impact-bridge-2026.json',{inputs:{connected_impacts:'impacts.json',football_game_projections:'football.json',market_snapshots:'markets.json',schedule:'schedule.json'},required_football_fields:['home_score_mean','away_score_mean','model_home_spread','model_total'],output:'result.json'});
  write('football.json',{generated_at:'2026-09-12T12:00:00Z',games});
  write('markets.json',{games:markets});write('schedule.json',{games:{}});
  write('impacts.json',{cases:cases.map(id=>({case_id:id,source_event_id:'event-'+id,team:'DET',game_context:{game_id:id},captured_at:id==='old-projection'?'2026-09-12T14:00:00Z':'2026-09-12T11:00:00Z',recalculation_targets:{team_scoring:true}}))});
  execFileSync(process.execPath,[fileURLToPath(new URL('./build-team-scoring-market-impact-bridge.mjs',import.meta.url))],{cwd:dir});
  const results=Object.fromEntries(JSON.parse(fs.readFileSync(path.join(dir,'result.json'),'utf8')).cases.map(c=>[c.case_id,c]));
  for(const id of ['timestamp-only','wrong-event','missing-score','old-projection'])assert.equal(results[id].state,'PENDING_FOOTBALL_RECALCULATION',id);
  assert.equal(results['missing-total'].state,'INSUFFICIENT_MARKET_DATA');
  for(const id of ['applied','zero-spread'])assert.equal(results[id].state,'READY_FOR_MARKET_COMPARISON',id);
  assert.equal(results['zero-spread'].comparison.market_home_spread,0);
  console.log('PASS: explicit event provenance, chronological ordering, missing scores/lines, and valid zero spread');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
