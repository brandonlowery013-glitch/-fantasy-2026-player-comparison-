import assert from 'node:assert/strict';
import {updateNormalPrior,footballValue} from '../lib/football-foundation.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
const posterior=updateNormalPrior({mean:20,variance:4},[{id:'new-evidence',mean:24,variance:4}]);
close(posterior.mean,22);close(posterior.variance,2);
close(updateNormalPrior({mean:20,variance:4}).mean,20);
// The existing pseudo-game backtest is a precision-weighted normal update.
const updated=updateNormalPrior({mean:20,variance:1/50},[{id:'current',mean:24,variance:1/8},{id:'cohort',mean:18,variance:1/4}]);
close(updated.mean,(50*20+8*24+4*18)/62);
assert.throws(()=>updateNormalPrior({mean:20,variance:0}));
assert.throws(()=>updateNormalPrior({mean:20,variance:4},[{id:'same',mean:1,variance:1},{id:'same',mean:1,variance:1}]));
const value=footballValue({expected:20,q10:10,q50:18,q90:30,scarcity:2},{lambda:.5,rho:.25,gamma:1});
close(value.score,26);close(value.upside,6);close(value.downside,2);
assert.throws(()=>footballValue({expected:20,q10:10,q50:18,q90:30,scarcity:2},{lambda:null,rho:.25,gamma:1}));
assert.throws(()=>footballValue({expected:20,q10:19,q50:18,q90:30,scarcity:2},{lambda:.5,rho:.25,gamma:1}));
console.log('PASS: Bayesian posterior, duplicate evidence rejection, existing weight equivalence, Football Value decomposition, and missing coefficient rejection');
