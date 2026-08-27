import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {FAIR_MARKET_METHOD,americanToImpliedProbability,probabilityToFairAmerican,fairTwoWayAmerican} from '../lib/fair-market-probability.mjs';

const root=process.cwd();
const contract=JSON.parse(fs.readFileSync(path.join(root,'data/sources/fair-market-probability-2026.json'),'utf8'));
const blocked=[];
const rule=contract.locked_rules||{};

if(contract.status!=='STEP_13_FAIR_MARKET_PROBABILITY_LOCKED')blocked.push('Step 13 contract status is not locked');
if(contract.mode!=='SHADOW_ONLY'||contract.actionable!==false)blocked.push('Step 13 must remain shadow-only and non-actionable');
if(contract.method?.id!==FAIR_MARKET_METHOD)blocked.push('Canonical fair-market method mismatch');
if(contract.method?.supported_market_shape!=='TWO_WAY')blocked.push('Step 13 must be limited to two-way markets');
if(rule.two_sided_prices_required!==true)blocked.push('Two-sided prices must be required');
if(rule.fair_probabilities_must_sum_to_one!==true)blocked.push('Fair probabilities must sum to one');
if(rule.book_margin_must_be_recorded!==true)blocked.push('Book margin must be recorded');
if(rule.raw_implied_probabilities_must_be_preserved!==true)blocked.push('Raw implied probabilities must be preserved');
if(rule.sportsbook_inputs_are_downstream_context_only!==true)blocked.push('Sportsbook data must remain downstream context only');
if(rule.market_data_may_create_or_overwrite_football_projection!==false)blocked.push('Market data must not create/overwrite football projections');
if(rule.market_data_may_mutate_comparison_winner!==false)blocked.push('Market data must not mutate comparison winner');
if(rule.market_data_may_mutate_true_value!==false)blocked.push('Market data must not mutate True Value');
if(rule.market_data_may_mutate_frozen_forecast!==false)blocked.push('Market data must not mutate frozen forecasts');
if(rule.no_automatic_wager_action!==true)blocked.push('Automatic wager action must remain prohibited');
if(rule.three_way_markets_supported!==false)blocked.push('Three-way market support must remain blocked until separately specified');
if(contract.consensus_rules?.different_lines_are_not_averaged!==true)blocked.push('Different lines must never be averaged into consensus');

try{
  const even=fairTwoWayAmerican(-110,-110);
  assert.ok(Math.abs(even.fair_side_a_probability-0.5)<1e-12);
  assert.ok(Math.abs(even.fair_side_b_probability-0.5)<1e-12);
  assert.ok(Math.abs(even.book_margin-0.04761904761904767)<1e-12);
  const shaded=fairTwoWayAmerican(-120,100);
  assert.ok(Math.abs((shaded.fair_side_a_probability+shaded.fair_side_b_probability)-1)<1e-12);
  assert.ok(shaded.fair_side_a_probability>shaded.fair_side_b_probability);
  assert.equal(probabilityToFairAmerican(0.5),100);
  assert.ok(americanToImpliedProbability(-110)>0.5);
  assert.throws(()=>fairTwoWayAmerican(0,-110));
}catch(error){blocked.push(`Math invariant failed: ${error.message}`);}

const report={
  generated_at:new Date().toISOString(),
  result:blocked.length?'BLOCKED':'PASS',
  status:contract.status,
  mode:contract.mode,
  actionable:contract.actionable,
  method:contract.method?.id,
  blocked
};
fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});
fs.writeFileSync(path.join(root,'guardrails/fair-market-probability-contract-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);
