import fs from 'node:fs';

const p='data/sources/step6-5-football-game-intelligence-2026.json';
const c=JSON.parse(fs.readFileSync(p,'utf8'));
const STEP6='75fe85d862917c332f60d5e127969e28ce3c9d60';
const fail=(m)=>{console.error(`STEP6.5A FAIL: ${m}`);process.exitCode=1;};
const need=(v,m)=>{if(!v) fail(m);};

need(c.schema_version==='STEP6_5_FOOTBALL_GAME_INTELLIGENCE_1.1.0','schema version mismatch');
need(c.status==='STEP6_5A_SOURCE_AND_MODEL_CONTRACT_LOCKED','source/model contract not locked');
need(c.mode==='SHADOW_ONLY' && c.actionable===false,'Step 6.5A must remain shadow-only/non-actionable');
need(c.inherited_step6_sha===STEP6,'validated Step 6 inheritance SHA mismatch');
need(c.live_projection_weight===0 && c.live_rank_weight===0,'new authority must remain zero');
need(c.sportsbook_inputs_allowed_in_football_projection===false,'sportsbook contamination must be prohibited');
need(c.baseline_policy?.preseason_prior?.includes('2025') && c.baseline_policy.preseason_prior.includes('2026'),'2025 prior / 2026 adjustment policy missing');
need(c.baseline_policy?.rolling_2026_update?.includes('2026'),'rolling 2026 update policy missing');
need(c.primary_data_backbone?.source?.includes('nflverse'),'nflverse primary backbone missing');
for (const f of ['play_by_play','team_stats','player_stats','schedules','weekly_rosters','snap_counts','pfr_advanced_stats']) need(c.primary_data_backbone.required_feeds.includes(f),`required feed missing: ${f}`);
for (const f of ['spread_line','total_line']) need(c.primary_data_backbone.historical_market_fields.includes(f),`historical market target missing: ${f}`);
for (const f of ['qtr','game_seconds_remaining','score_differential']) need(c.primary_data_backbone.play_state_fields.includes(f),`play-state field missing: ${f}`);
for (const s of ['MATERIAL','POSSIBLY_MATERIAL','CONTEXT_ONLY','NO_CURRENT_EFFECT']) need(c.evidence_materiality_contract?.statuses?.includes(s),`materiality status missing: ${s}`);
for (const e of ['DST','K','TEAM_OFFENSE','TEAM_DEFENSE','SPREAD','TOTAL','PLAYER_PROPS']) need(c.evidence_materiality_contract?.affected_engines?.includes(e),`affected engine missing: ${e}`);
need(c.evidence_materiality_contract.rules.some(x=>x.includes('silently discarded')),'uncertain-evidence preservation guard missing');
need(c.evidence_materiality_contract.rules.some(x=>x.includes('regular-season production')),'preseason evidence guard missing');
for (const f of ['opponent_adjusted_epa_per_play_allowed','pass_epa_per_dropback_allowed','rush_epa_per_carry_allowed','schedule_strength_normalization','coaching_scheme_continuity_and_change']) need(c.team_defense_feature_families.includes(f),`defensive family missing: ${f}`);
for (const pos of ['QB','RB','WR','TE']) need(Array.isArray(c.player_matchup_feature_families?.[pos]) && c.player_matchup_feature_families[pos].length>0,`player matchup family missing: ${pos}`);
for (const f of ['sacks','interceptions','fumble_recoveries','defensive_or_special_teams_touchdowns','points_allowed_bucket']) need(c.fantasy_dst_contract?.scoring_outputs?.includes(f),`DST scoring output missing: ${f}`);
for (const f of ['field_goals_made_by_scoring_distance_bucket','extra_points_made']) need(c.fantasy_kicker_contract?.scoring_outputs?.includes(f),`kicker scoring output missing: ${f}`);
need(c.shared_information_rule?.includes('canonical shared inputs'),'shared football information rule missing');
need(c.situational_intelligence_families.includes('prior_game_fourth_quarter_comeback_or_collapse'),'fourth-quarter comeback/collapse situational family missing');
need(c.explainability_contract?.required_for_preferred_games===true,'preferred-game explainability must be required');
need(c.explainability_contract?.must_surface_contradicting_evidence===true,'contradicting evidence requirement missing');
need(Array.isArray(c.implementation_sequence) && c.implementation_sequence.length===8,'Step 6.5 A-H sequence incomplete');
need(c.locked_rules.some(x=>x.includes('No guessed defensive')),'no-guessed-weight guard missing');
need(c.locked_rules.some(x=>x.includes('Football forecasts are generated before market comparison')),'football/market separation guard missing');

if (!process.exitCode) console.log('STEP6.5A PASS: shared football/game intelligence, evidence materiality, DST/K and authority contracts are locked.');
