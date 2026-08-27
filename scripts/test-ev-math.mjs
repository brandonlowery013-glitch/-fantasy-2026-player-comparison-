import assert from 'node:assert/strict';
import {americanToImpliedProbability,americanNetProfitPerUnit,probabilityToFairAmerican,fairTwoWayAmerican,expectedValueAmerican} from '../lib/fair-market-probability.mjs';

{
  const fair=fairTwoWayAmerican(-110,-110);
  assert.ok(Math.abs(fair.fair_side_a_probability-0.5)<1e-12);
  assert.ok(Math.abs(fair.fair_side_b_probability-0.5)<1e-12);
  assert.ok(Math.abs(fair.book_margin-0.04761904761904767)<1e-12);
  assert.equal(probabilityToFairAmerican(0.5),100);
}

{
  const result=expectedValueAmerican(0.57,-110);
  assert.ok(Math.abs(result-0.0881818181818182)<1e-12);
}

{
  const fair=fairTwoWayAmerican(-120,100);
  assert.ok(Math.abs((fair.fair_side_a_probability+fair.fair_side_b_probability)-1)<1e-12);
  assert.ok(fair.fair_side_a_probability>fair.fair_side_b_probability);
  assert.ok(fair.fair_side_a_american<0);
  assert.ok(fair.fair_side_b_american>0);
}

{
  const pOver=0.58,pUnder=0.42;
  assert.ok(Math.abs((pOver+pUnder)-1)<1e-12);
  assert.ok(expectedValueAmerican(pOver,-110)>0);
  assert.ok(americanToImpliedProbability(-110)>0.5);
  assert.ok(americanNetProfitPerUnit(110)>1);
}

assert.throws(()=>americanToImpliedProbability(0));
assert.throws(()=>fairTwoWayAmerican(0,-110));
assert.throws(()=>probabilityToFairAmerican(1));
assert.throws(()=>expectedValueAmerican(1.1,-110));

console.log('EV/de-vig unit tests passed.');
