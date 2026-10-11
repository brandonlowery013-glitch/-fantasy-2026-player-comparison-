import assert from 'node:assert/strict';
import {marginProbabilities as probs,probabilityMetrics as metrics} from '../lib/quarterback-probability-validation.mjs';
assert.deepEqual(probs(0,[-1,0,1]),[1/3,1/3,1/3]);
assert.deepEqual(probs(10,[-1,0,1]),[1,0,0]);
assert.equal(metrics([{predictedMargin:10,ym:7}],[-1,0,1]).brier,0);
assert.equal(metrics([{predictedMargin:10,ym:-7}],[-1,0,1]).brier,2);
assert.equal(metrics([],[-1,0,1]).brier,null);
assert.throws(()=>probs(0,[]));assert.throws(()=>probs(null,[0]));
console.log('PASS: probability sums, ties, perfect/wrong predictions and missing-sample handling.');
