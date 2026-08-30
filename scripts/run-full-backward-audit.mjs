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
check('audit_contract_schema', contract.schema_version === 'FULL_BACKWARD_AUDIT_1.0.0', contract.schema_version);
check('automatic_promotion_disabled', contract.automatic_promotion === false, String(contract.automatic_promotion));

// 162-player source of truth and rank integrity.
const shardFiles = fs.readdirSync('.').filter(f => /^players\d+\.json$/.test(f)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
const players = shardFiles.flatMap(read);
const names = players.map(p => p.n);
const uniqueNames = new Set(names);
const ranks = players.map(p => Number(p.o));
const finiteRanks = ranks.filter(Number.isFinite);
const uniqueRanks = new Set(finiteRanks);
check('source_of_truth_shards_13', shardFiles.length === 13, String(shardFiles.length));
check('authoritative_player_count_162', players.length === 162, String(players.length));
check('unique_player_count_162', uniqueNames.size === 162, String(uniqueNames.size));
check('overall_rank_count_162', finiteRanks.length === 162, String(finiteRanks.length));
check('overall_ranks_unique', uniqueRanks.size === 162, String(uniqueRanks.size));
check('overall_ranks_cover_1_162', Math.min(...finiteRanks) === 1 && Math.max(...finiteRanks) === 162, `${Math.min(...finiteRanks)}-${Math.max(...finiteRanks)}`);

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

// Roster/injury closure: expected to block promotion without making audit execution itself fail.
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

// The process policy must still require this audit before promotion/merge and must not restore the removed between-step wait rule.
const processPolicy = read('data/sources/step6-5d-current-process-policy.json');
check('between_step_global_wait_removed', processPolicy.between_step_global_guardrail_wait_required === false, String(processPolicy.between_step_global_guardrail_wait_required));
check('backward_audit_required_before_promotion_merge', processPolicy.full_backward_audit_required_before_promotion_or_merge === true, String(processPolicy.full_backward_audit_required_before_promotion_or_merge));

const hardFailures = checks.filter(c => c.status === 'FAIL');
const auditExecutionResult = hardFailures.length ? 'FAIL' : 'PASS';
const promotionAllowed = auditExecutionResult === 'PASS' && blockers.length === 0;
const report = {
  schema_version: 'FULL_BACKWARD_AUDIT_REPORT_1.0.0',
  generated_at: new Date().toISOString(),
  audit_execution_result: auditExecutionResult,
  promotion_allowed: promotionAllowed,
  promotion_status: promotionAllowed ? 'ELIGIBLE_FOR_EXPLICIT_USER_PROMOTION_DECISION' : 'BLOCKED',
  production_numeric_authority: 0,
  players_checked: players.length,
  unique_players: uniqueNames.size,
  shards: shardFiles.length,
  repair_log: [{item:'Atwell/Hunter trade direction', status:'FIXED_NON_NUMERIC'}],
  promotion_blockers: blockers,
  warnings,
  checks
};
fs.mkdirSync('guardrails', {recursive:true});
fs.writeFileSync('guardrails/full-backward-audit-report-2026.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({audit_execution_result:auditExecutionResult,promotion_allowed:promotionAllowed,blockers:blockers.length,hard_failures:hardFailures.length,players:players.length}, null, 2));
if (hardFailures.length) process.exit(2);
