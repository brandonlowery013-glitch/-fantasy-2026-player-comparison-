import fs from 'node:fs';

const read = p => JSON.parse(fs.readFileSync(p,'utf8'));
const countArr = (x,...keys) => { for (const k of keys) if (Array.isArray(x?.[k])) return x[k].length; return 0; };
const countObj = (x,...keys) => { for (const k of keys) if (x?.[k] && typeof x[k] === 'object' && !Array.isArray(x[k])) return Object.keys(x[k]).length; return 0; };
const fail = m => { throw new Error(m); };

const contract = read('data/sources/real-season-validation-2026.json');
const schedule = read('data/calibration/weekly-event-schedule-2026.json');
const context = read('data/probability/weekly-football-context-raw-2026.json');
const forecasts = read('data/calibration/weekly-forecast-capture-2026.json');
const gameProj = read('data/probability/generated/weekly-game-projections-2026.json');
const gameMarkets = read('data/market/weekly-matchup-market-snapshots-2026.json');
const propMarkets = read('data/market/player-prop-market-snapshots-2026.json');
const gameRecs = read('data/market/weekly-game-market-recommendations-2026.json');
const propRecs = read('data/market/player-prop-recommendations-2026.json');
const results = read('data/calibration/weekly-forecast-results-2026.json');
const footballCal = read('data/calibration/weekly-forecast-calibration-2026.json');
const marketCal = read('weeklyCalibration2026.json');
const health = read('data/calibration/weekly-pipeline-status-2026.json');
const governance = read('data/calibration/calibration-governance-status-2026.json');

if (contract.mode !== 'OBSERVATIONAL_ONLY' || contract.actionable !== false) fail('Step 22 must remain observational only');
if (contract.guardrails?.sportsbook_inputs_may_mutate_football_projection !== false) fail('Market contamination guardrail missing');
if (contract.guardrails?.automatic_challenger_promotion !== false) fail('Automatic promotion must remain prohibited');
if (propRecs.player_universe_count !== 162) fail('Player recommendation universe must remain 162');
if (health.actionable !== false || governance.actionable !== false || marketCal.actionable !== false) fail('Live governance/calibration artifacts must remain non-actionable');

const scheduleCount = countObj(schedule,'games','events');
const contextCount = countObj(context,'players');
const forecastCount = countArr(forecasts,'forecasts','records');
const gameProjectionCount = countObj(gameProj,'games','events');
const gameMarketCount = countObj(gameMarkets,'games');
const propMarketCount = countArr(propMarkets,'snapshots') || countObj(propMarkets,'players');
const gameRecCount = countObj(gameRecs,'games');
const propRecCount = countObj(propRecs,'players');
const settlementCount = countArr(results,'settlements','results');

let overall = 'WAITING_FOR_SOURCE';
let reason = 'Verified 2026 regular-season event starts and live weekly football context are not available yet.';
if (health.overall_status === 'BLOCKED') { overall='BLOCKED'; reason='Weekly pipeline health is BLOCKED.'; }
else if (health.overall_status === 'STALE') { overall='STALE'; reason='Weekly football inputs are stale.'; }
else if (scheduleCount && contextCount && !forecastCount) { overall='WAITING_FOR_FORECAST'; reason='Verified schedule/context exist but no frozen forecasts are captured.'; }
else if (forecastCount && !(gameMarketCount || propMarketCount)) { overall='WAITING_FOR_MARKET'; reason='Forecasts exist but market snapshots have not been captured.'; }
else if (forecastCount && (gameMarketCount || propMarketCount) && !(gameRecCount || propRecCount)) { overall='WAITING_FOR_MARKET'; reason='Market snapshots exist but recommendation ledgers have not been built.'; }
else if (forecastCount && (gameRecCount || propRecCount) && !settlementCount) { overall='WAITING_FOR_FINAL'; reason='Forecasts and recommendations exist; awaiting final results and settlement.'; }
else if (settlementCount && Number(footballCal.settled_forecasts||0) < settlementCount) { overall='WAITING_FOR_CALIBRATION'; reason='Settlements exist but football calibration has not caught up.'; }
else if (settlementCount) { overall='READY_FOR_REVIEW'; reason='Settled live evidence and calibration are available for review.'; }

const output = {
  schema_version:'1.0.0', season:2026, mode:'OBSERVATIONAL_ONLY', actionable:false,
  overall_status:overall, current_week:health.current_week ?? forecasts.week ?? null,
  stage_status:{
    verified_event_schedule:scheduleCount?'PRESENT':'WAITING', weekly_football_context:contextCount?'PRESENT':'WAITING',
    frozen_player_forecasts:forecastCount?'PRESENT':'WAITING', weekly_game_projections:gameProjectionCount?'PRESENT':'WAITING',
    market_snapshots:(gameMarketCount||propMarketCount)?'PRESENT':'WAITING', recommendations:(gameRecCount||propRecCount)?'PRESENT':'WAITING',
    final_results:settlementCount?'PRESENT':'WAITING', forecast_settlement:settlementCount?'PRESENT':'WAITING',
    football_calibration:Number(footballCal.settled_forecasts||0)?'PRESENT':'WAITING',
    market_holdout_calibration:Number(marketCal.holdout_bets||0)?'PRESENT':'WAITING',
    pipeline_health:health.overall_status, calibration_governance:governance.decision
  },
  live_evidence:{
    frozen_forecasts:forecastCount, settled_forecasts:settlementCount, market_holdout_bets:Number(marketCal.holdout_bets||0),
    football_error_metrics_available:Boolean(footballCal.metrics), clv_available:marketCal.closing_line_value != null
  },
  blocked_reasons:[...(health.blocked_reasons||[])], reason, generated_at:null
};

if (!scheduleCount && overall !== 'WAITING_FOR_SOURCE' && overall !== 'BLOCKED' && overall !== 'STALE') fail('Preseason state must wait for source');
if (!settlementCount && (footballCal.metrics != null || Number(footballCal.settled_forecasts||0) !== 0)) fail('Calibration cannot exist without settlements');
if (!Number(marketCal.holdout_bets||0) && marketCal.closing_line_value != null) fail('CLV cannot exist with zero holdout bets');

if (process.argv.includes('--self-test')) {
  const states = ['WAITING_FOR_SOURCE','WAITING_FOR_FORECAST','WAITING_FOR_MARKET','WAITING_FOR_FINAL','WAITING_FOR_SETTLEMENT','WAITING_FOR_CALIBRATION','READY_FOR_REVIEW','STALE','BLOCKED'];
  for (const s of contract.allowed_statuses) if (!states.includes(s)) fail(`Unsupported contract status ${s}`);
  if (contract.tracking?.missing_closing_snapshot_is_null_not_zero !== true) fail('Missing closing snapshots must remain null');
  console.log(JSON.stringify({step:22,status:'PASS',chronology:true,preseason_state:overall,clv_guard:true,market_mutation_blocked:true}));
  process.exit(0);
}

fs.writeFileSync('data/calibration/real-season-validation-status-2026.json', JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({step:22,status:'PASS',overall_status:overall,forecastCount,settlementCount,holdout_bets:output.live_evidence.market_holdout_bets}));
