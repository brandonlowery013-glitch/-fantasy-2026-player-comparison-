import assert from 'node:assert/strict';
import {propEventLimit} from '../lib/market-ingestion-settings.mjs';
for(const value of [undefined,'','   '])assert.equal(propEventLimit(value,16),16);
assert.equal(propEventLimit('0',16),0);assert.equal(propEventLimit('2',16),2);
for(const value of ['invalid','-1','1.5','Infinity'])assert.throws(()=>propEventLimit(value,16));
console.log('PASS: empty settings use the declared limit; explicit zero disables prop capture; invalid limits fail clearly');
