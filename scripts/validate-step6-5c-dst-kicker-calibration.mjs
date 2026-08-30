import fs from 'node:fs';

const p='data/sources/step6-5c-dst-kicker-calibration-2026.json';
const x=JSON.parse(fs.readFileSync(p,'utf8'));
const fail=m=>{throw new Error(m)};
if(x.schema_version!=='STEP6_5C_DST_KICKER_CALIBRATION_1.0.0')fail('schema');
if(x.season!==2026||x.status!=='SHADOW_ONLY')fail('season/status');
if(x.production_numeric_authority!==0)fail('authority must remain zero');
if(x.sportsbook_inputs_allowed!==false)fail('sportsbook contamination');
for(const y of [2021,2022,2023,2024,2025])if(!x.historical_seasons.includes(y))fail(`missing historical ${y}`);
for(const y of [2024,2025])if(!x.held_out_test_seasons.includes(y))fail(`missing holdout ${y}`);
for(const k of ['sacks','interceptions','fumble_recoveries','defensive_or_special_teams_touchdowns','points_allowed_bucket'])if(!x.dst.scoring_outputs.includes(k))fail(`dst ${k}`);
for(const k of ['field_goals_made_by_distance_bucket','extra_points_made'])if(!x.kicker.scoring_outputs.includes(k))fail(`kicker ${k}`);
if(!/team kicker slot/i.test(x.kicker.identity_rule))fail('team-kicker identity guard missing');
if(!/unknown/i.test(x.missing_data_rule)||!/silently/i.test(x.missing_data_rule))fail('missing-data guard');
if(x.walk_forward.target_week_leakage_allowed!==false)fail('leakage allowed');
if(x.promotion_gate.automatic_promotion!==false)fail('automatic promotion');
if(!/double-count/i.test(x.shared_state_rule))fail('double-count guard');
console.log(JSON.stringify({result:'PASS',schema:x.schema_version,authority:x.production_numeric_authority,dst_outputs:x.dst.scoring_outputs.length,kicker_outputs:x.kicker.scoring_outputs.length,sportsbook_inputs_allowed:x.sportsbook_inputs_allowed}));
