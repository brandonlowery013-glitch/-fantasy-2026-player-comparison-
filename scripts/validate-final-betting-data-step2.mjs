import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const exists = p => fs.existsSync(path.join(root, p));
const blocked = [];

const contractPath = 'data/sources/betting-data-source-price-contract-2026.json';
if (!exists(contractPath)) blocked.push('Missing Step 2 betting-data source/price contract');
const c = exists(contractPath) ? read(contractPath) : {};
const live = read('data/sources/live-market-ingestion-2026.json');
const game = read('data/sources/game-market-recommendation-layer-2026.json');
const prop = read('data/sources/player-prop-recommendation-layer-2026.json');

if (c.season !== 2026 || c.step !== 'FINAL_INTERFACE_STEP_2' || c.status !== 'LOCKED') blocked.push('Step 2 identity/status mismatch');
if (c.authority !== 'DOWNSTREAM_MARKET_DECISION_ONLY') blocked.push('Step 2 authority must remain downstream-only');

const primary = c.source_hierarchy?.primary_live_aggregator || {};
if (primary.name !== live.provider?.name || primary.api_version !== live.provider?.api_version) blocked.push('Primary feed must match locked Step 23 provider');
if (primary.credential_env !== live.provider?.api_key_env) blocked.push('Credential environment contract mismatch');
if (primary.odds_format !== 'american' || live.provider?.odds_format !== 'american') blocked.push('Raw sportsbook odds must remain American format');
if (c.source_hierarchy?.legacy_archival?.eligible_as_current_weekly_price !== false) blocked.push('Legacy season seed cannot become current weekly price');
if (c.source_hierarchy?.legacy_archival?.eligible_as_live_price !== false) blocked.push('Legacy season seed cannot become live price');

const prohibited = new Set(c.source_hierarchy?.prohibited_fallbacks || []);
for (const x of ['UNSOURCED_WEB_SCRAPE','INFERRED_OR_SYNTHETIC_ODDS','STALE_PRICE_RELABELED_CURRENT','MISSING_PRICE_TREATED_AS_ZERO','CONSENSUS_LINE_WITHOUT_BOOK_LEVEL_PROVENANCE']) {
  if (!prohibited.has(x)) blocked.push(`Missing prohibited fallback: ${x}`);
}

const gameMarkets = c.market_scope?.game_markets || [];
if (JSON.stringify(gameMarkets) !== JSON.stringify(['moneyline','spread','total'])) blocked.push('Game market scope mismatch');
if (JSON.stringify(gameMarkets) !== JSON.stringify(game.supported_markets || [])) blocked.push('Step 2 game markets must match Step 15');
const propStats = c.market_scope?.weekly_player_prop_stats || [];
if (JSON.stringify(propStats) !== JSON.stringify(prop.supported_stats || [])) blocked.push('Weekly prop stats must match Step 16');
if (c.market_scope?.team_win_totals !== false) blocked.push('Team win totals must remain out of scope');
if (c.market_scope?.in_game_live_betting_recommendations !== false) blocked.push('Live betting recommendations require a separate reviewed contract');

const id = c.market_identity || {};
for (const field of ['event_id','market_type','sportsbook','observed_at','commence_time']) if (!(id.required_fields || []).includes(field)) blocked.push(`Missing market identity field: ${field}`);
if (id.same_market_requires_same_threshold !== true || id.different_thresholds_are_distinct_markets !== true || id.different_books_are_distinct_quotes !== true) blocked.push('Market identity integrity rules missing');

const price = c.price_contract || {};
if (price.stored_odds_format !== 'AMERICAN' || price.raw_price_is_immutable !== true || price.retain_book_level_quote !== true) blocked.push('Raw price/provenance contract invalid');
if (price.best_execution_price?.may_splice_two_sided_market_across_books_for_devig !== false) blocked.push('Cross-book de-vig splicing must be prohibited');
if (price.reference_market_price?.different_thresholds_may_be_averaged !== false || price.reference_market_price?.synthetic_consensus_odds_allowed !== false) blocked.push('Reference market may not average thresholds or synthesize odds');
if (price.probability_conversion?.fair_probability_method !== game.fair_market_method || price.probability_conversion?.fair_probability_method !== prop.fair_market_method) blocked.push('Fair-market method must remain shared with Steps 15/16');
if (price.probability_conversion?.devig_requires_complete_same_book_two_sided_price !== true) blocked.push('De-vig must require a complete same-book two-sided quote');
if (price.probability_conversion?.raw_odds_never_overwritten_by_fair_probability !== true) blocked.push('Fair probability must not overwrite raw odds');

const fresh = c.freshness_contract || {};
if (fresh.pregame_weekly_stale_after_minutes !== live.freshness?.weekly_market_stale_after_minutes) blocked.push('Weekly freshness must match Step 23');
if (fresh.season_market_stale_after_minutes !== live.freshness?.season_market_stale_after_minutes) blocked.push('Season freshness must match Step 23');
if (fresh.stale_quote_recommendation_eligibility !== false || fresh.price_must_predate_kickoff_for_pregame_recommendation !== true) blocked.push('Stale/post-kickoff recommendation safeguards invalid');
if (fresh.close_price_usage !== 'CLV_AND_BACKTEST_ONLY') blocked.push('Close prices must remain CLV/backtest only');

const gate = c.recommendation_gate || {};
if (gate.football_distribution_must_exist_first !== true || gate.market_quote_must_be_fresh !== true || gate.required_price_provenance !== true) blocked.push('Recommendation gate missing prediction-first/fresh/provenance requirements');
if (gate.required_same_book_two_sided_price_for_market_probability !== true || gate.never_fabricate_replacement_price !== true) blocked.push('Recommendation gate permits invalid market probability or fabricated price');
if (gate.game_recommendation_contract !== 'data/sources/game-market-recommendation-layer-2026.json' || gate.player_prop_recommendation_contract !== 'data/sources/player-prop-recommendation-layer-2026.json') blocked.push('Downstream recommendation contract linkage mismatch');

const parlay = c.parlay_contract || {};
if (parlay.market_feed_may_create_parlay_leg !== false || parlay.eligible_leg_source !== 'ALREADY_APPROVED_DOWNSTREAM_RECOMMENDATION') blocked.push('Parlays must consume approved recommendation legs, not raw feed quotes');
if (parlay.cross_book_prices_may_not_be_presented_as_one_executable_parlay !== true || parlay.automatic_wagering !== false || parlay.stake_sizing !== false) blocked.push('Parlay execution guardrails invalid');

const sep = c.separation_guardrails || {};
for (const key of ['sportsbook_data_may_mutate_season_projection','sportsbook_data_may_mutate_weekly_football_projection','sportsbook_data_may_mutate_true_value','sportsbook_data_may_mutate_overall_rank','sportsbook_data_may_mutate_market_value_label','sportsbook_data_may_mutate_season_opportunity_label','sportsbook_data_may_mutate_comparison_better_player']) {
  if (sep[key] !== false) blocked.push(`Contamination guardrail invalid: ${key}`);
}
if (sep.calibration_requires_explicit_reviewed_contract !== true) blocked.push('Any market-informed calibration must require a separately reviewed contract');

const ui = c.ui_failure_states || {};
if (ui.no_feed !== 'MARKET UNAVAILABLE' || ui.partial_two_sided_price !== 'PRICE INCOMPLETE' || ui.stale_price !== 'STALE' || ui.no_model_distribution !== 'MODEL WAITING' || ui.never_show_placeholder_as_real_price !== true) blocked.push('UI failure-state contract invalid');

const report = {
  generated_at: new Date().toISOString(),
  result: blocked.length ? 'BLOCKED' : 'PASS',
  step: 'FINAL_INTERFACE_STEP_2',
  authority: c.authority,
  primary_provider: primary.name,
  game_markets: gameMarkets,
  weekly_player_prop_stats: propStats,
  freshness_minutes: {
    weekly: fresh.pregame_weekly_stale_after_minutes,
    season: fresh.season_market_stale_after_minutes
  },
  blocked,
  safeguards: [
    'Football distributions exist before sportsbook comparison.',
    'Raw book-level American prices and provenance are retained.',
    'Different thresholds are distinct markets and are never averaged.',
    'De-vigging requires a complete same-book two-sided quote.',
    'Stale, partial, or unavailable markets cannot silently become recommendations.',
    'Sportsbook data cannot mutate fantasy ranks, projections, Opportunity labels, or Better Player decisions.',
    'Parlays consume approved recommendation legs rather than raw feed quotes.'
  ]
};

fs.mkdirSync(path.join(root, 'guardrails'), {recursive: true});
fs.writeFileSync(path.join(root, 'guardrails/final-betting-data-step2-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (blocked.length) process.exit(1);
