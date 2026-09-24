import assert from 'node:assert/strict';
import {modelPropPick} from '../lib/model-prop-pick.mjs';
assert.equal(modelPropPick({over:.6,under:.3,push:.1}).side,'OVER');
assert.equal(modelPropPick({over:.2,under:.8,push:0}).side,'UNDER');
assert.equal(modelPropPick({over:.5,under:.5,push:0}).status,'EVEN');
for(const q of [{},{over:null,under:.6,push:0},{over:NaN,under:.6,push:0},{over:.7,under:.6,push:0}])assert.equal(modelPropPick(q).status,'UNAVAILABLE');
console.log('PASS: direction, ties, pushes, and missing/invalid inputs');
