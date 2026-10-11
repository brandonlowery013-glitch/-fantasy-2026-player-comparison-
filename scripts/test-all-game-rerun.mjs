import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const files=['data/probability/generated/weekly-game-projections-2026.json','data/probability/generated/current-game-scoring-2026.json','data/market/weekly-game-market-recommendations-2026.json','data/market/issued-pick-history-2026.json','data/market/issued-pick-results-2026.json'];
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const before=files.map(hash);
for(const script of ['build-weekly-game-projections','build-game-market-recommendations'])execFileSync(process.execPath,[`scripts/${script}.mjs`,'--all-game-rerun']);
assert.deepEqual(files.map(hash),before,'A rerun must never alter the original scoring, recommendations, history or results');
const read=p=>JSON.parse(fs.readFileSync(p));
const p=read('data/probability/generated/all-game-rerun-projections-2026.json'),r=read('data/market/all-game-model-rerun-2026.json'),s=read('data/calibration/weekly-event-schedule-2026.json');
assert.deepEqual(Object.keys(p.games).sort(),Object.keys(s.games).sort());
assert.deepEqual(Object.keys(r.games).sort(),Object.keys(s.games).sort());
for(const [id,g]of Object.entries(p.games)){
 assert.equal(g.model_version,'scoring-decay-no-rest-2026-v2');assert.equal(g.scoring_evidence.rest_adjustment_applied,false);
 assert.equal(g.actionable,false);assert.equal(g.sportsbook_inputs_used,false);
 assert.ok(Math.abs(g.model.home_win_probability+g.model.away_win_probability+g.model.tie_probability-1)<.00001);
 for(const q of r.games[id].snapshot_evaluations){assert.ok(Date.parse(q.captured_at)<=Date.parse(g.event_start));for(const v of Object.values(q.markets))assert.ok(v.show_work);}
}
assert.equal(r.rerun,true);assert.equal(r.actionable,false);assert.ok(r.source_generated_at);
console.log(`PASS: ${Object.keys(r.games).length} games recalculated; original files unchanged; saved pregame odds only; every market has an explanation.`);
