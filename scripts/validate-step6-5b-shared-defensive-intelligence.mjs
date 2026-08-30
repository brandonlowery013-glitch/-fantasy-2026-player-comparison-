import fs from 'node:fs';

const contract=JSON.parse(fs.readFileSync('data/sources/step6-5b-shared-defensive-intelligence-contract-2026.json','utf8'));
const fail=m=>{console.error(`FAIL: ${m}`);process.exitCode=1;};
const expected=['overall_epa_allowed_per_play','pass_epa_allowed_per_dropback','rush_epa_allowed_per_carry','pass_yards_allowed_per_attempt','rush_yards_allowed_per_carry','sack_rate','interception_rate','explosive_pass_20_rate_allowed','explosive_rush_10_rate_allowed'];

if(contract.schema_version!=='STEP6_5B_SHARED_DEFENSIVE_INTELLIGENCE_1.0.0')fail('schema version');
if(contract.season!==2026||contract.source_season!==2025)fail('season contract');
if(contract.sportsbook_inputs_used!==false)fail('sportsbook contamination');
if(contract.composite_policy?.composite_rating_authority!==0)fail('composite authority must remain zero');
if(!/Compartmentalize calculations, not information/i.test(contract.compartmentalization_rule||''))fail('shared-system architecture phrase missing');
if(!/may not be applied again/i.test(contract.anti_double_count_rule||''))fail('anti-double-count rule missing');
for(const k of expected)if(!contract.components?.[k])fail(`missing component ${k}`);
for(const e of ['TEAM_DEFENSE','DST','QB','RB','WR','TE','SPREAD','TOTAL','PLAYER_PROPS'])if(!(contract.engine_consumers||[]).includes(e))fail(`missing consumer ${e}`);
for(const gate of ['historical walk-forward calibration','out-of-sample improvement over points-allowed-only baseline','ablation by component family','stability check across seasons','no-market-contamination verification'])if(!(contract.composite_policy?.promotion_requires||[]).includes(gate))fail(`missing promotion gate ${gate}`);
if(contract['2026_adjustment_policy']?.unknown_is_not_zero!==true)fail('unknown-is-not-zero policy missing');
if(process.exitCode)process.exit(process.exitCode);
console.log(JSON.stringify({result:'PASS',schema:contract.schema_version,components:expected.length,composite_authority:contract.composite_policy.composite_rating_authority,sportsbook_inputs_used:contract.sportsbook_inputs_used},null,2));
