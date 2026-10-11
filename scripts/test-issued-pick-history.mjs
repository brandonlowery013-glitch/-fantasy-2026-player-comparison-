import assert from 'node:assert/strict';
import {captureHistory} from '../lib/issued-pick-history.mjs';
const now='2026-09-17T12:00:00Z';
const source={schedule:{season:2026,week:2,games:{g:{week:2,event_start:'2026-09-18T00:00:00Z'}}},gameRecs:{week:2,generated_at:now,games:{g:{week:2,home_team:'H',model_version:'v1',current_recommendations:{snapshot_id:'q',total:{decision:'PICK',selection:'OVER 40.5',model_conditional_win_probability:.6}},snapshot_evaluations:[{snapshot_id:'q',captured_at:now,book:'B',market:{total:40.5},markets:{total:{side_a:{offered_odds:-110,win_probability:.6,push_probability:0}}}}]}}},propRecs:{week:2,players:{}},propSnapshots:{snapshots:[]},now};
const first=captureHistory(source);assert.equal(first.added,1);assert.equal(first.ledger.records[0].odds,-110);
const repeat=captureHistory({...source,ledger:first.ledger});assert.equal(repeat.added,0);
const changed=structuredClone(source);changed.gameRecs.games.g.current_recommendations.total={decision:'PASS',reason:'Edge lost'};
const second=captureHistory({...changed,ledger:first.ledger});assert.equal(second.added,1);assert.equal(second.ledger.records[0].decision,'PICK');assert.equal(second.ledger.records[1].previous_record_id,first.ledger.records[0].record_id);
const withdrawn=captureHistory({...source,gameRecs:{week:2,games:{}},ledger:first.ledger});assert.equal(withdrawn.ledger.records.at(-1).decision,'WITHDRAWN');
assert.equal(captureHistory({...source,now:'2026-09-18T00:00:00Z'}).added,0);
const wrong=structuredClone(source);wrong.gameRecs.games.g.week=1;assert.equal(captureHistory(wrong).added,0);
const missing=structuredClone(source);delete missing.gameRecs.games.g.snapshot_evaluations[0].markets.total.side_a.offered_odds;assert.equal(captureHistory(missing).added,0);
const future=structuredClone(source);future.gameRecs.generated_at='2026-09-18T01:00:00Z';assert.equal(captureHistory(future).added,0);
assert.throws(()=>captureHistory({...source,ledger:{records:[]}}));
console.log('PASS: immutable revisions, deduplication, withdrawal, week isolation, kickoff cutoff, missing price, future timestamp, invalid ledger');

const prop=structuredClone(source);prop.gameRecs.games={};prop.propSnapshots.snapshots=[{snapshot_id:'p1',game_id:'g'}];prop.propRecs={week:2,generated_at:now,players:{Player:{weekly:{current_by_stat:{yards:{week:2,snapshot_id:'p1',captured_at:now,line:50.5,book:'B',eligibility:{expected_active:true},recommendation:{decision:'PICK',side:'OVER'},sides:[{side:'OVER',offered_odds:100,model_win_probability:.6,model_conditional_win_probability:.6,model_push_probability:0}]}}}}}};
const p1=captureHistory(prop);assert.equal(p1.added,1);assert.equal(p1.ledger.records[0].game_id,'g');
prop.propRecs.players.Player.weekly.current_by_stat.yards.recommendation={decision:'WAIT',reason:'REPORTED_UNAVAILABLE'};
const p2=captureHistory({...prop,ledger:p1.ledger});assert.equal(p2.added,1);assert.equal(p2.ledger.records[0].odds,100);assert.equal(p2.ledger.records[1].decision,'WAIT');
console.log('PASS: prop event identity, original price preservation and PICK to WAIT revision');


// The code checkout can predate the generated artifact. Preserve content independently.
const evidenceSource=structuredClone(source);
evidenceSource.sourceCommit='older-code-checkout';
evidenceSource.gameRecs.games.g.football_projection={model_total:44};
evidenceSource.gameRecs.games.g.scoring_evidence={teams:{H:{current_games:1}}};
const captured=captureHistory(evidenceSource);
const frozen=captured.ledger.records[0].source_provenance;
assert.equal(frozen.source_code_commit,'older-code-checkout');
assert.equal(frozen.evidence.football_projection.model_total,44);
assert.match(frozen.artifact_json_sha256,/^[a-f0-9]{64}$/);
evidenceSource.gameRecs.games.g.football_projection.model_total=99;
assert.equal(frozen.evidence.football_projection.model_total,44);
const other=captureHistory(evidenceSource);
assert.notEqual(other.ledger.records[0].source_provenance.artifact_json_sha256,frozen.artifact_json_sha256);
assert.equal(captureHistory({...evidenceSource,ledger:captured.ledger}).added,0,'evidence changes alone do not invent a new issued pick');
const legacy=structuredClone(captured.ledger);delete legacy.records[0].source_provenance;
assert.equal(captureHistory({...source,ledger:legacy}).added,0,'legacy records are not rewritten');
assert.equal(legacy.records[0].source_provenance,undefined);
const removed=captureHistory({...source,gameRecs:{week:2,games:{}},ledger:captured.ledger});
assert.equal(removed.ledger.records.at(-1).source_provenance,null,'withdrawals must not inherit obsolete pick evidence');
assert.deepEqual(p1.ledger.records[0].source_provenance.evidence.evaluation.model,prop.propRecs.players.Player.weekly.current_by_stat.yards.model);
assert.equal(p1.ledger.records[0].source_provenance.evidence.evaluation.recommendation.side,'OVER');
assert.equal(p1.ledger.records[0].source_provenance.evidence.quote_snapshot.game_id,'g');
console.log('PASS: source content identity, detached evidence, legacy compatibility, decision deduplication and withdrawal provenance');
