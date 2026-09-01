import fs from 'node:fs';
const C='data/sources/historical-trend-category-backtest-2026.json';
const O='data/probability/generated/historical-trend-category-backtest-2021-2025.json';
const c=JSON.parse(fs.readFileSync(C,'utf8')), errors=[];
if(c.schema_version!=='1.0.0')errors.push('schema');
if(c.status!=='STEP_5_HISTORICAL_TREND_CATEGORY_BACKTEST_SHADOW'||c.production_numeric_authority!==0||c.actionable!==false||c.automatic_promotion!==false)errors.push('authority');
if(c.held_out_test_seasons.join(',')!=='2024,2025')errors.push('holdouts');
if(c.signal_rule.minimum_training_market_games!==8||c.signal_rule.upper_rate_threshold!==0.58||c.signal_rule.lower_rate_threshold!==0.42)errors.push('locked signal rule');
for(const d of ['HOME_ROAD','FAVORITE_DOG_PICKEM','OPPONENT_PREGAME_WINNING_500_PLUS_OR_BELOW','REST_BUCKET','DIVISION_OR_NON_DIVISION','SURFACE','SAME_SEASON_REMATCH'])if(!c.dimensions.includes(d))errors.push(`missing ${d}`);
for(const m of ['ATS','OU'])if(!c.markets.includes(m))errors.push(`missing ${m}`);
if(!c.guardrails.some(x=>/held-out result may select/i.test(x)))errors.push('leakage guardrail');
if(!c.guardrails.some(x=>/production authority/i.test(x)))errors.push('production guardrail');
if(process.argv.includes('--require-output')){
  if(!fs.existsSync(O))errors.push('missing output');else{
    const o=JSON.parse(fs.readFileSync(O,'utf8'));
    if(o.status!=='SHADOW_OUT_OF_SAMPLE_RESEARCH_ONLY'||o.production_numeric_authority!==0||o.actionable!==false||o.automatic_promotion!==false)errors.push('output authority');
    if(!Array.isArray(o.results)||o.results.length!==c.dimensions.length*c.markets.length)errors.push('result coverage');
    for(const r of o.results||[]){if(!Array.isArray(r.folds)||r.folds.map(x=>x.test_season).join(',')!=='2024,2025')errors.push(`bad folds ${r.dimension}:${r.market}`);if(!['ROBUST_RESEARCH_CANDIDATE','RESEARCH_CANDIDATE','NO_STABLE_SIGNAL','NO_TESTABLE_SAMPLE'].includes(r.classification))errors.push(`bad class ${r.dimension}:${r.market}`)}
  }
}
if(errors.length){console.error(JSON.stringify({result:'BLOCKED',errors},null,2));process.exit(1)}
console.log(JSON.stringify({result:'PASS',schema:c.schema_version,dimensions:c.dimensions.length,markets:c.markets,held_out_test_seasons:c.held_out_test_seasons,production_numeric_authority:c.production_numeric_authority}));
