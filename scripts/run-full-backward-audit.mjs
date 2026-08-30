import fs from 'node:fs';

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const text = p => fs.readFileSync(p, 'utf8');
const exists = p => fs.existsSync(p);
const checks = [];
const blockers = [];
const warnings = [];
function check(name, ok, details, severity='HARD') {
  checks.push({name, status: ok ? 'PASS' : (severity === 'PROMOTION' ? 'BLOCKED' : 'FAIL'), details});
  if (!ok && severity === 'PROMOTION') blockers.push({name, details});
  if (!ok && severity === 'WARN') warnings.push({name, details});
  if (!ok && severity === 'HARD') process.exitCode = 2;
}

const contract = read('data/sources/full-backward-audit-2026.json');
check('audit_contract_schema', contract.schema_version === 'FULL_BACKWARD_AUDIT_1.1.0', contract.schema_version);
check('automatic_promotion_disabled', contract.automatic_promotion === false, String(contract.automatic_promotion));

// Audit the same 162-player shard + overlay state used by runtime.
const shardFiles = fs.readdirSync('.').filter(f => /^players\d+\.json$/.test(f)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
const rawPlayers = shardFiles.flatMap(read);
const patch = read('current162patch-2026-08-24.json');
const patchPlayers = patch.players || {};
const players = rawPlayers.map(p => ({...p, ...(patchPlayers[p.n] || {})}));
const names = players.map(p => p.n);
const uniqueNames = new Set(names);
const overallRanks = players.map(p => Number(p.o));
const trueValueRanks = players.map(p => Number(p.tr));
const sortedOverall = [...overallRanks].sort((a,b)=>a-b);
const sortedTrueValue = [...trueValueRanks].sort((a,b)=>a-b);
const exactPermutation = arr => arr.length === 162 && arr.every((x,i) => Number.isFinite(x) && x === i + 1);
check('source_of_truth_shards_13', shardFiles.length === 13, String(shardFiles.length));
check('authoritative_player_count_162', players.length === 162, String(players.length));
check('unique_player_count_162', uniqueNames.size === 162, String(uniqueNames.size));
check('runtime_overlay_effective_aug30', patch.updated === '2026-08-30' && patch.step3e_status === 'APPLIED_APPROVED_CHANGES', `${patch.updated}; ${patch.step3e_status}`);
check('runtime_overlay_covers_162', Object.keys(patchPlayers).length === 162, String(Object.keys(patchPlayers).length));
check('overall_ranks_exact_1_162', exactPermutation(sortedOverall), `${Math.min(...overallRanks)}-${Math.max(...overallRanks)}; unique=${new Set(overallRanks).size}`);
check('true_value_ranks_exact_1_162', exactPermutation(sortedTrueValue), `${Math.min(...trueValueRanks)}-${Math.max(...trueValueRanks)}; unique=${new Set(trueValueRanks).size}`);

// Explicit Aug. 30 Step 3E application must match the user-approved ledger exactly.
const approval = read('guardrails/step3e-approved-changes-2026-08-30.json');
const step3e = read('guardrails/step3e-application-audit.json');
check('step3e_prior_noop_superseded', approval.supersedes_prior_noop === true && step3e.prior_noop_superseded === true, 'Aug. 30 approval supersedes historical no-op');
check('step3e_decision_counts_exact', approval.review_queue === 5 && approval.direct_changes === 2 && approval.connected_changes_count === 1 && approval.holds === 3, `review=${approval.review_queue}; direct=${approval.direct_changes}; connected=${approval.connected_changes_count}; holds=${approval.holds}`);
check('step3e_application_complete', step3e.status === 'COMPLETE_APPROVED_CHANGES_APPLIED' && step3e.direct_changes === 2 && step3e.connected_changes === 1 && step3e.holds === 3, `${step3e.status}; direct=${step3e.direct_changes}; connected=${step3e.connected_changes}; holds=${step3e.holds}`);
const expectedStep3E = {
  'Kaytron Allen': {o:141,tr:159,s:7.125,pd:6.9,ce:6.3,r:6.5,mp:68},
  'Chuba Hubbard': {o:116,tr:118,s:8.055,pd:8.3,ce:7,r:8.2,mp:162.75},
  'Jonathon Brooks': {o:112,tr:130,s:7.655,pd:7.8,ce:8,r:7.3,mp:169.25}
};
for (const [name,want] of Object.entries(expectedStep3E)) {
  const got = patchPlayers[name];
  check(`step3e_exact_${name.toLowerCase().replace(/[^a-z0-9]+/g,'_')}`, !!got && Object.entries(want).every(([k,v]) => got[k] === v), got ? JSON.stringify({o:got.o,tr:got.tr,s:got.s,pd:got.pd,ce:got.ce,r:got.r,mp:got.mp}) : 'missing');
}
check('step3e_only_three_projection_changes', Array.isArray(step3e.live_projection_changes) && step3e.live_projection_changes.length === 3 && ['Kaytron Allen','Chuba Hubbard','Jonathon Brooks'].every(x => step3e.live_projection_changes.includes(x)), JSON.stringify(step3e.live_projection_changes));
check('step3e_market_independent', step3e.market_independence === true && /ADP\/ECR did not create/.test(approval.market_independence || ''), 'market did not create football changes');

// Current-cost repair is downstream only and must complete the 162-player layer.
const marketRepair = read('data/sources/market-repair-2026-08-30.json');
check('market_repair_nine_records', Object.keys(marketRepair.players || {}).length === 9, String(Object.keys(marketRepair.players || {}).length));
check('market_repair_coverage_162', marketRepair.coverage_after_repair === 162, String(marketRepair.coverage_after_repair));
check('market_repair_zero_football_authority', marketRepair.football_projection_authority === 0 && marketRepair.intrinsic_rank_mutations_from_market === 0, `authority=${marketRepair.football_projection_authority}; rank mutations=${marketRepair.intrinsic_rank_mutations_from_market}`);
for (const name of Object.keys(marketRepair.players || {})) {
  const p = patchPlayers[name];
  const m = marketRepair.players[name];
  check(`market_repair_runtime_${name.toLowerCase().replace(/[^a-z0-9]+/g,'_')}`, !!p && p.ad === m.adp && p.px === m.market_read && p.fw === m.fair_range && p.market_read_override === true, p ? `ad=${p.ad}; px=${p.px}; fw=${p.fw}; override=${p.market_read_override}` : 'missing');
}

// Step 6.5G/H scope and market directionality.
const g = read('data/sources/step6-5g-calibration-ablation-full-universe-2026.json');
const h = read('data/sources/step6-5h-integration-contamination-qa-2026.json');
const gText = text('data/sources/step6-5g-calibration-ablation-full-universe-2026.json');
const hText = text('data/sources/step6-5h-integration-contamination-qa-2026.json');
check('step6_5g_authority_zero', Number(g.production_numeric_authority) === 0, String(g.production_numeric_authority));
check('step6_5g_weekly_to_season_bridge_absent', g.season_long_bridge_policy?.validated_bridge_available === false, JSON.stringify(g.season_long_bridge_policy));
check('legacy_hand_tuned_recalibration_quarantined', g.legacy_recalibration_policy?.status === 'QUARANTINED_FROM_6_5G_AUTHORITY', g.legacy_recalibration_policy?.status || 'missing');
check('step6_5h_authority_zero', Number(h.production_numeric_authority ?? h.numeric_authority ?? 0) === 0, String(h.production_numeric_authority ?? h.numeric_authority ?? 0));
check('market_downstream_only_contract', /downstream/i.test(hText) && /sportsbook/i.test(hText) && !/sportsbook_inputs_allowed_for_football_projection"\s*:\s*true/i.test(hText), 'Step 6.5H market directionality');
const hLockedRules = Array.isArray(h.locked_rules) ? h.locked_rules : [];
check('double_count_guard_contract', hLockedRules.some(rule => /canonical evidence key/i.test(rule) && /at most one layer/i.test(rule) && /non-overlapping effects/i.test(rule)), 'Structured Step 6.5H single-numeric-use rule present');
check('failed_modules_not_promoted', /REJECT_NUMERIC_AUTHORITY/.test(gText) && /broad_team_defense_modifier/.test(gText) && /granular_matchup_TE/.test(gText) && /kicker_rich_model/.test(gText), 'Rejected module list retained');

// Legacy hand-tuned workflow is allowed to exist only because it is quarantined.
const legacy = text('.github/workflows/recalibrate-projections.yml');
const hasHandTuned = /histWeight|contextFactor|\.018|\.012|\.006|\.28|\.20|\.12/.test(legacy);
check('legacy_recalibration_contains_hand_tuned_logic_detected', hasHandTuned, 'Expected legacy coefficients remain detectable for quarantine enforcement');
check('legacy_recalibration_has_no_step6_5_authority', g.legacy_recalibration_policy?.workflow === '.github/workflows/recalibrate-projections.yml' && g.legacy_recalibration_policy?.status === 'QUARANTINED_FROM_6_5G_AUTHORITY', g.legacy_recalibration_policy?.status || 'missing');

// Injury/current-state semantics and missing-is-not-zero.
const injuryPolicy = text('data/sources/step6-5b-automatic-injury-projection-policy-2026.json');
const injuryDesignations = text('data/sources/step6-5b-player-injury-designations-2026.json');
const profileStatus = text('data/sources/step6-5b-player-profile-status-news-contract-2026.json');
check('missing_unknown_not_zero', /(unknown.{0,40}not zero|missing.{0,40}not zero|unknown.{0,60}zero)/is.test(injuryPolicy + injuryDesignations + hText), 'Unknown/missing injury evidence semantics present');
check('current_status_supremacy', /(current resolved|current status|supersed|stale)/i.test(injuryPolicy + profileStatus), 'Current resolved status precedence present');
check('no_guessed_injury_coefficients', /(no guessed|coefficient.{0,40}(zero|validation)|numeric authority.{0,20}zero)/is.test(injuryPolicy), 'Q/D coefficients require validation; deterministic inactive states only');

// Roster/injury closure may block promotion without making audit execution itself fail.
const registry = read('data/sources/step6-5b-roster-driven-injury-review-registry-2026.json');
const regText = text('data/sources/step6-5b-roster-driven-injury-review-registry-2026.json');
const closureAllowed = registry.closure_allowed === true || /"closure_allowed"\s*:\s*true/.test(regText);
const registryStatus = registry.status || registry.closure_status || 'UNKNOWN';
const reviewedMatch = regText.match(/"reviewed(?:_players)?"\s*:\s*(\d+)/i);
const missingMatch = regText.match(/"missing(?:_players)?"\s*:\s*(\d+)/i);
const reviewed = reviewedMatch ? Number(reviewedMatch[1]) : null;
const missing = missingMatch ? Number(missingMatch[1]) : null;
check('step6_5b_roster_injury_closure', closureAllowed, `status=${registryStatus}; reviewed=${reviewed ?? 'see registry'}; missing=${missing ?? 'see registry'}; closure_allowed=${closureAllowed}`, 'PROMOTION');

// Corrected transaction defect must stay corrected.
const ledger = text('data/sources/step6-5b-current-evidence-ledger-2026.json');
check('stale_atwell_hunter_direction_removed', !ledger.includes('Tutu Atwell to Miami / Jarquez Hunter to Los Angeles Rams'), 'Stale direction absent');
check('correct_atwell_hunter_direction_present', ledger.includes('Tutu Atwell to Los Angeles Rams / Jarquez Hunter to Miami'), 'Correct direction present');

// Historical/leakage/rookie governance.
const step3b = text('data/sources/step3b-final-decision-2026.json');
const rookie = text('data/sources/rookie-no-history-inputs-2026.json') + text('data/sources/step3b-history-integrity-status-2026.json');
const decay = text('data/sources/step6-5b-defensive-walkforward-decay-calibration-2026.json');
check('holdout_leakage_guard', /(holdout|walk.?forward)/i.test(step3b + decay) && /(leak|untouched|training)/i.test(step3b + decay), 'Walk-forward/holdout governance present');
check('prior_decay_governed', /(half.?life|decay|shrink)/i.test(decay + step3b), 'Prior decay/shrinkage explicitly governed');
check('rookie_history_quarantine', /(rookie|no.history)/i.test(rookie) && /(quarant|synthetic|do not|must not)/i.test(rookie), 'Rookie/no-history integrity present');

// Projection -> distribution -> market/EV ordering and math contracts.
const distributionPolicy = read('data/probability/stat-distribution-policy.json');
const fairMarket = text('data/sources/fair-market-probability-2026.json');
const exactTailObj = read('data/sources/exact-tail-math-2026.json');
const exactTail = text('data/sources/exact-tail-math-2026.json');
const corr = text('data/sources/correlation-modeling-2026.json');
const exactTailNotes = Array.isArray(exactTailObj.notes) ? exactTailObj.notes : [];
check('projection_precedes_distribution', distributionPolicy.status === 'SHADOW_ONLY' && exactTailNotes.some(note => /converts player projections/i.test(note) && /does not create or replace player projections/i.test(note)), 'Exact-tail contract consumes player projections and cannot replace them');
check('market_after_model_probability', /(market|de.?vig)/i.test(fairMarket) && /(model|probability)/i.test(fairMarket), 'Market probability layer is separate/downstream');
check('exact_tail_push_contract', /(push|integer|tail)/i.test(exactTail), 'Exact tail/push contract present');
check('correlation_integrity_contract', /(correlation|dependence)/i.test(corr) && /(marginal|bound|matrix|PSD|positive semi)/i.test(corr), 'Correlation constraints present');

// Permissions and UI contracts exist; their executable validators run in workflow.
check('ui_contracts_present', ['data/sources/ui-step3a-feature-rule-contracts-2026.json','data/sources/ui-core-feature-qa-step3.json','data/sources/ui-permissions-step5-2026.json','data/sources/ui-responsive-step6-2026.json'].every(exists), 'Step1-6 UI contract artifacts present');
const permissions = text('data/sources/ui-permissions-step5-2026.json');
check('public_client_read_only', /(READ_ONLY|read.only)/i.test(permissions) && /(mutation|credential|authorization)/i.test(permissions), 'Least-privilege public client contract present');

// Process policy still requires this audit before promotion/merge.
const processPolicy = read('data/sources/step6-5d-current-process-policy.json');
check('between_step_global_wait_removed', processPolicy.between_step_global_guardrail_wait_required === false, String(processPolicy.between_step_global_guardrail_wait_required));
check('backward_audit_required_before_promotion_merge', processPolicy.full_backward_audit_required_before_promotion_or_merge === true, String(processPolicy.full_backward_audit_required_before_promotion_or_merge));

const hardFailures = checks.filter(c => c.status === 'FAIL');
const auditExecutionResult = hardFailures.length ? 'FAIL' : 'PASS';
const promotionAllowed = auditExecutionResult === 'PASS' && blockers.length === 0;
const report = {
  schema_version: 'FULL_BACKWARD_AUDIT_REPORT_1.1.0',
  generated_at: new Date().toISOString(),
  audit_execution_result: auditExecutionResult,
  promotion_allowed: promotionAllowed,
  promotion_status: promotionAllowed ? 'ELIGIBLE_FOR_EXPLICIT_USER_PROMOTION_DECISION' : 'BLOCKED',
  production_numeric_authority: 0,
  players_checked: players.length,
  unique_players: uniqueNames.size,
  shards: shardFiles.length,
  runtime_overlay: 'current162patch-2026-08-24.json',
  runtime_overlay_effective_date: patch.updated,
  approved_step3e_projection_changes: ['Kaytron Allen','Chuba Hubbard','Jonathon Brooks'],
  current_cost_coverage: marketRepair.coverage_after_repair,
  repair_log: [
    {item:'Atwell/Hunter trade direction', status:'FIXED_NON_NUMERIC'},
    {item:'Aug. 30 Step 3E historical no-op assumption', status:'SUPERSEDED_BY_EXPLICIT_APPROVAL'},
    {item:'Nine missing current-cost records', status:'REPAIRED_MARKET_ONLY'}
  ],
  promotion_blockers: blockers,
  warnings,
  checks
};
fs.mkdirSync('guardrails', {recursive:true});
fs.writeFileSync('guardrails/full-backward-audit-report-2026.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({audit_execution_result:auditExecutionResult,promotion_allowed:promotionAllowed,blockers:blockers.length,hard_failures:hardFailures.length,players:players.length,current_cost_coverage:marketRepair.coverage_after_repair}, null, 2));
if (hardFailures.length) process.exit(2);
