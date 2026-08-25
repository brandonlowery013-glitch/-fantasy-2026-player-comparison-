import fs from 'node:fs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const schema=read('data/probability/historical-game-log-schema.json');
const manifest=read('data/probability/historical-uncertainty-manifest.json');
const policy=read('data/probability/stat-distribution-policy.json');

const requiredSchemaFields=[
  'player','position','season','week','team','opponent','played','started','inactive',
  'partial_game','injury_limited','role_regime_id','starting_qb','head_coach',
  'offensive_coordinator','primary_play_caller','pass_attempts','pass_yards','pass_tds',
  'rush_attempts','rush_yards','rush_tds','targets','receptions','receiving_yards',
  'receiving_tds','offensive_snaps','snap_share','routes_run','route_share','team_dropbacks',
  'target_share','air_yards','air_yards_share','carry_share','red_zone_targets',
  'inside_10_targets','inside_5_targets','end_zone_targets','red_zone_receptions',
  'inside_10_receptions','inside_5_receptions','red_zone_receiving_tds','inside_10_receiving_tds',
  'inside_5_receiving_tds','red_zone_carries','goal_line_carries','red_zone_rush_attempts',
  'inside_10_rush_attempts','inside_5_rush_attempts','red_zone_rush_tds','inside_10_rush_tds',
  'inside_5_rush_tds','red_zone_pass_attempts','inside_10_pass_attempts','inside_5_pass_attempts',
  'red_zone_pass_tds','inside_10_pass_tds','inside_5_pass_tds','team_offensive_plays','team_pass_rate',
  'neutral_pass_rate','seconds_per_play','final_point_differential','roof','surface',
  'temperature_f','wind_mph','precipitation','opponent_defense_bucket','data_quality_flags',
  'source','source_url','usage_source','usage_source_url','context_source','context_source_url',
  'high_value_usage_source','high_value_usage_source_date'
];

const missing=requiredSchemaFields.filter(k=>!Object.hasOwn(schema.properties||{},k));
if(missing.length) throw new Error('Historical schema missing required fields: '+missing.join(', '));

for(const f of ['player','season','week','team','opponent','played','role_regime_id','source']){
  if(!(schema.required||[]).includes(f)) throw new Error(`Historical schema must require ${f}`);
}

const bannedTokens=['sportsbook','bookmaker','offered_odds','market_probability','pregame_spread','pregame_total'];
const schemaText=JSON.stringify(schema).toLowerCase();
for(const token of bannedTokens){
  if(schemaText.includes(`\"${token}\"`)) throw new Error(`Market contamination field found in historical row schema: ${token}`);
}

if(JSON.stringify(manifest.history_window)!==JSON.stringify([2021,2022,2023,2024,2025])) throw new Error('History window must remain 2021-2025.');
if(manifest.actionable!==false) throw new Error('Historical uncertainty dataset must remain non-actionable during calibration.');
if(manifest.exclusions?.sportsbook_odds_as_probability_input!==true) throw new Error('Sportsbook odds prohibition missing.');
if(manifest.exclusions?.pregame_spread_as_probability_input!==true||manifest.exclusions?.pregame_total_as_probability_input!==true) throw new Error('Pregame market context prohibition missing.');
if(manifest.regime_policy?.required_role_regime_id!==true) throw new Error('Role-regime tracking must be mandatory.');
if(manifest.context_policy?.opponent_strength_rule?.toLowerCase().includes('leak')!==true) throw new Error('Opponent-strength leakage safeguard missing.');

const expectedStats=['pass_attempts','pass_yards','pass_tds','rush_attempts','rush_yards','rush_tds','targets','receptions','receiving_yards','receiving_tds'];
for(const stat of expectedStats){
  const entry=policy.stat_families?.[stat];
  if(!entry||!Array.isArray(entry.candidate_families)||entry.candidate_families.length<2) throw new Error(`Distribution candidates incomplete for ${stat}`);
}
if(policy.market_price_prohibited_as_fit_input!==true) throw new Error('Distribution-fit market-price prohibition missing.');
if(policy.actionable!==false) throw new Error('Distribution policy must remain shadow-only.');

console.log(JSON.stringify({
  result:'PASS',
  history_window:manifest.history_window,
  schema_fields:Object.keys(schema.properties||{}).length,
  role_regime_required:true,
  high_value_usage_fields:24,
  stat_families:Object.keys(policy.stat_families||{}).length,
  market_contamination:'BLOCKED_BY_POLICY'
},null,2));
