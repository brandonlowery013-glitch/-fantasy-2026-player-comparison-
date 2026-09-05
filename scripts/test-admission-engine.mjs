import assert from 'node:assert/strict';
import {validateQueueEntry,validatePackageShape} from './process-admissions.mjs';

const entry={candidate_id:'example-player-chi-rb',player_name:'Example Player',team:'CHI',position:'RB',decision:'ADMIT',status:'AWAITING_CALIBRATED_PACKAGE',package_path:'admissions/packages/example-player-chi-rb.json',evidence:[{source:'test',observed_at:'2026-09-04T00:00:00Z',summary:'material role'}]};
assert.deepEqual(validateQueueEntry(entry),[]);
assert(validateQueueEntry({...entry,candidate_id:'Bad ID'}).some(x=>x.includes('kebab-case')));
assert(validateQueueEntry({...entry,evidence:[]}).some(x=>x.includes('evidence')));

const pkg={version:1,candidate_id:entry.candidate_id,player_name:entry.player_name,calibration:{reviewed:true,method:'fixture',generated_at:'2026-09-04T00:00:00Z',source_run:'fixture-run'},integration:{expected_before_count:166,expected_after_count:167,expected_before_shards:14,expected_after_shards:14,canonical_files:{'players13.json':[],'MODEL_SOURCE_OF_TRUTH.json':{},'guardrails/universe-change-manifest.json':{changes:[]}}}};
assert.deepEqual(validatePackageShape(pkg,entry),[]);
assert(validatePackageShape({...pkg,calibration:{...pkg.calibration,reviewed:false}},entry).some(x=>x.includes('reviewed')));
assert(validatePackageShape({...pkg,integration:{...pkg.integration,expected_after_count:168}},entry).some(x=>x.includes('+ 1')));
assert(validatePackageShape({...pkg,integration:{...pkg.integration,canonical_files:{'players13.json':[]}}},entry).some(x=>x.includes('MODEL_SOURCE_OF_TRUTH')));
console.log(JSON.stringify({result:'PASS',tests:7},null,2));
