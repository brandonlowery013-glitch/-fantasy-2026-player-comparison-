import fs from 'node:fs';
const p='data/sources/step6-5e-historical-situational-intelligence-2026.json';
const c=JSON.parse(fs.readFileSync(p,'utf8'));
const errors=[];
if(c.schema_version!=='STEP6_5E_HISTORICAL_SITUATIONAL_INTELLIGENCE_1.0.0')errors.push('schema');
if(c.status!=='SHADOW_ONLY'||c.production_numeric_authority!==0||c.automatic_promotion!==false)errors.push('authority');
if(c.sportsbook_inputs_allowed!==false)errors.push('sportsbook');
if(!Array.isArray(c.held_out_test_seasons)||c.held_out_test_seasons.join(',')!=='2024,2025')errors.push('holdouts');
for(const k of ['rest_difference_days','same_season_rematch','division_game'])if(!c.candidate_features.includes(k))errors.push(`missing ${k}`);
if(!c.quarantined_until_source_resolved.includes('international_travel_recovery'))errors.push('international quarantine');
if(!c.locked_rules.some(x=>/before kickoff/i.test(x)))errors.push('pregame rule');
if(!c.locked_rules.some(x=>/Sportsbook spread/i.test(x)))errors.push('market prohibition');
if(errors.length){console.error(JSON.stringify({result:'BLOCKED',errors},null,2));process.exit(1)}
console.log(JSON.stringify({result:'PASS',schema:c.schema_version,authority:c.production_numeric_authority,features:c.candidate_features.length,quarantined:c.quarantined_until_source_resolved.length,sportsbook_inputs_allowed:c.sportsbook_inputs_allowed}));
