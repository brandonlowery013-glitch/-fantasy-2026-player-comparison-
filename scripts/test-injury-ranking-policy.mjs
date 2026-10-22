import assert from 'node:assert/strict';
import {numericInjuryAdjustmentAllowed} from '../lib/injury-ranking-policy.mjs';
import {fantasyInjuryStatus} from '../lib/weekly-ranking-availability.mjs';
for(const status of ['Q','Questionable','Doubtful','Active']){
 const signal={evidence:{status,display_status:'Questionable'}};
 assert.equal(fantasyInjuryStatus({signals:{injury:signal}}).tag,'Q');
 assert.equal(numericInjuryAdjustmentAllowed(signal),false);
}
assert.equal(numericInjuryAdjustmentAllowed({game_status:'Q'}),false);
assert.equal(numericInjuryAdjustmentAllowed({evidence:{status:'Out',display_status:'Questionable'}}),true);
assert.equal(numericInjuryAdjustmentAllowed({evidence:{status:'Doubtful'}}),true);
console.log('PASS: resolved Questionable status has no numeric injury adjustment; Out and Doubtful rules preserved');
