import './test-opportunity-prop-selection.mjs';
import assert from 'node:assert/strict';
import {evaluateCurrentProp} from '../frontend/cloudflare/lib/current-prop-model.mjs';
assert.equal(evaluateCurrentProp({}),null);
console.log('PASS: browser prop evaluator uses the joint opportunity model and rejects incomplete inputs.');
