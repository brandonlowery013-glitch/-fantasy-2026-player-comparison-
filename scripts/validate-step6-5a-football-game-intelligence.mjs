import fs from 'node:fs';

const p='data/sources/step6-5-football-game-intelligence-2026.json';
const c=JSON.parse(fs.readFileSync(p,'utf8'));
const fail=(m)=>{console.error(`STEP6.5A FAIL: ${m}`);process.exitCode=1;};
const need=(v,m)=>{if(!v) fail(m);};

need(c.status==='STEP6_5A_SOURCE_AND_MODEL_CONTRACT_LOCKED','source/model contract not locked');
need(c.mode==='SHADOW_ONLY' && c.actionable===false,'Step 6.5A must remain shadow-only/non-actionable');
need(c.live_projection_weight===0 && c.live_rank_weight===0,'new authority must remain zero');
need(c.sportsbook_inputs_allowed_in_football_projection===false,'sportsbook contamination must be prohibited');
need(c.baseline_policy?.preseason_prior?.includes('2025'),'2025 preseason prior policy missing');
need(c.baseline_policy?.rolling_2026_update?.includes('2026'),'rolling 2026 update policy missing');
need(c.primary_data_backbone?.source?.includes('nflverse'),'nflverse primary backbone missing');
for (const f of ['play_by_play','team_stats','player_stats','schedules','weekly_rosters','snap_counts','pfr_advanced_stats']) need(c.primary_data_backbone.required_feeds.includes(f),`required feed missing: ${f}`);
for (const f of ['spread_line','total_line']) need(c.primary_data_backbone.historical_market_fields.includes(f),`historical market target missing: ${f}`);
for (const f of ['qtr','game_seconds_remaining','score_differential']) need(c.primary_data_backbone.play_state_fields.includes(f),`play-state field missing: ${f}`);
for (const f of ['opponent_adjusted_epa_per_play_allowed','pass_epa_per_dropback_allowed','rush_epa_per_carry_allowed','schedule_strength_normalization']) need(c.team_defense_feature_families.includes(f),`defensive family missing: ${f}`);
for (const pos of ['QB','RB','WR','TE']) need(Array.isArray(c.player_matchup_feature_families?.[pos]) && c.player_matchup_feature_families[pos].length>0,`player matchup family missing: ${pos}`);
need(c.situational_intelligence_families.includes('prior_game_fourth_quarter_comeback_or_collapse'),'fourth-quarter comeback/collapse situational family missing');
need(c.explainability_contract?.required_for_preferred_games===true,'preferred-game explainability must be required');
need(c.explainability_contract?.must_surface_contradicting_evidence===true,'contradicting evidence requirement missing');
need(Array.isArray(c.implementation_sequence) && c.implementation_sequence.length===8,'Step 6.5 A-H sequence incomplete');
need(c.locked_rules.some(x=>x.includes('No guessed defensive')),'no-guessed-weight guard missing');
need(c.locked_rules.some(x=>x.includes('Football forecasts are generated before market comparison')),'football/market separation guard missing');

if (!process.exitCode) console.log('STEP6.5A PASS: football/game intelligence source and authority contract is locked.');
