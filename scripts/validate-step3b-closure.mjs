import fs from 'node:fs';
const p='data/sources/step3b-final-decision-2026.json';
const d=JSON.parse(fs.readFileSync(p,'utf8'));
const rbReportPath='guardrails/step3b-rb-q50-2019-2025-decision.json';
const rbReport=fs.existsSync(rbReportPath)?JSON.parse(fs.readFileSync(rbReportPath,'utf8')):null;
const checks=[];
const add=(name,ok,details)=>checks.push({name,status:ok?'PASS':'FAIL',details});
add('status_locked',d.status==='STEP3B_FOUNDATION_LOCKED_AWAITING_USER_APPROVAL_FOR_3C',d.status);
add('zero_live_authority',d.live_weight===0&&d.live_projection_movement===0&&d.live_rank_movement===0,`weight=${d.live_weight} proj=${d.live_projection_movement} rank=${d.live_rank_movement}`);
add('no_market_inputs',d.sportsbook_or_adp_used===false,'sportsbook/adp false');
add('approval_gate',d.user_approval_required_before_3c===true&&d.next_step_after_approval==='STEP_3C_FULL_162_SHADOW_RECALCULATION',d.next_step_after_approval);
add('qb_q50_locked',d.predictive_distribution?.qb?.q50_status==='VALIDATED_LOCKED_FOR_3C_SHADOW'&&d.predictive_distribution?.qb?.method==='TRAILING_2'&&d.predictive_distribution?.qb?.all_years_compatible_95pct===true,JSON.stringify(d.predictive_distribution?.qb));
const rb=d.predictive_distribution?.rb;
add('rb_2019_2025_core_q50_locked',rb?.q50_status==='VALIDATED_RETAIN_CORE_RB_Q50_FOR_3C_SHADOW'&&rb?.decision==='RETAIN_CORE_Q50_MODEL_AVAILABILITY_ROLE_DOWNSIDE_SEPARATELY'&&rb?.preseason_top30_n===210&&Math.abs(rb?.healthy_established_q50_coverage-0.5274725274725275)<1e-12&&rb?.healthy_established_compatible_95pct===true&&rb?.blanket_q50_offset_authorized===false&&rb?.existing_distribution_change_authorized===false&&rb?.availability_role_downside_numeric_change_authorized_in_3b===false,JSON.stringify(rb));
if(rbReport){
  add('rb_decision_report_matches_contract',rbReport?.recommendation==='RETAIN_CORE_RB_Q50_MODEL_AVAILABILITY_ROLE_DOWNSIDE_SEPARATELY'&&rbReport?.locked_decision?.healthy_established_n===91&&Math.abs(rbReport?.locked_decision?.healthy_established_q50_coverage-0.5274725274725275)<1e-12&&rbReport?.locked_decision?.healthy_established_compatible_95pct===true&&Math.abs(rbReport?.overall?.q50_coverage-2/3)<1e-12,JSON.stringify(rbReport?.locked_decision||null));
}else{
  add('rb_decision_report_matches_contract',d.version==='STEP3B_FINAL_DECISION_2.1.0'&&rb?.decision_population_seasons?.join(',')==='2019,2020,2021,2022,2023,2024,2025'&&rb?.healthy_established_n===91&&Math.abs(rb?.healthy_established_q50_coverage-0.5274725274725275)<1e-12&&rb?.healthy_established_compatible_95pct===true&&Math.abs(rb?.preseason_top30_overall_q50_coverage-2/3)<1e-12,'Standalone RB decision artifact absent; authoritative 2.1.0 contract contains the locked 2019-2025 RB decision and is validated directly.');
}
add('preseason_current_evidence_zero',d.preseason_authority?.current_weeks_1_4_evidence_weight===0&&d.preseason_authority?.same_role_cohort_preseason_numeric_weight===0,d.preseason_authority?.same_role_cohort_status);
add('role_upshift_no_auto_boost',d.role_regime?.role_upshift_2022_exception==='FAILED'&&d.role_regime?.automatic_preseason_role_upshift_numeric_modifier_authorized===false,d.role_regime?.policy);
add('stable_environment_history_rule',d.team_qb_environment?.stable_team_and_qb_policy==='RETAIN_ESTABLISHED_HISTORY_PRIMARY_NO_AUTOMATIC_EARLY_EVIDENCE_OVERRIDE',d.team_qb_environment?.groups?.STABLE_TEAM_AND_QB?.early_evidence_improvement_pct);
add('coach_weights_zero',d.team_qb_environment?.coach_specific_weight===0&&d.team_qb_environment?.offensive_coordinator_weight===0&&d.team_qb_environment?.primary_play_caller_weight===0,d.team_qb_environment?.coach_source_completion_next_step);
add('injury_numeric_penalty_zero',d.confirmed_injury?.numeric_injury_severity_penalty_authorized===false&&d.confirmed_injury?.severity_recovery_model_next_step==='STEP_3F_DAILY_EVIDENCE_TO_MODEL_AUTOMATION',d.confirmed_injury?.official_out_status_use);
add('extreme_disagreement_gate',d.extreme_disagreement?.threshold_ppg===9.498105203619907&&d.extreme_disagreement?.review_required===true&&d.extreme_disagreement?.automatic_publish===false,JSON.stringify(d.extreme_disagreement));
add('rookie_shadow_sanitization',d.rookie_history_integrity?.shadow_no_history_required===true&&d.rookie_history_integrity?.shadow_no_history_players?.length===10&&d.rookie_history_integrity?.known_persistent_source_contamination_players?.length===7,d.rookie_history_integrity?.persistent_source_repair_status);
add('rookie_pre3e_repair_gate',String(d.rookie_history_integrity?.hard_gate_before_3e||'').includes('Repair persistent historicalStats2026.json contamination'),d.rookie_history_integrity?.hard_gate_before_3e);
const w=d.historical_relevance?.recency_weights_oldest_to_latest;
add('recency_weights_locked',JSON.stringify(w?.one_season)==='[1]'&&JSON.stringify(w?.two_seasons)==='[0.35,0.65]'&&JSON.stringify(w?.three_seasons)==='[0.2,0.3,0.5]',JSON.stringify(w));
add('football_value_deferred',d.football_value_terms?.lambda===null&&d.football_value_terms?.rho===null&&d.football_value_terms?.gamma===null&&d.football_value_terms?.numeric_authority===0&&d.football_value_terms?.next_step==='STEP_3G_CORE_FEATURE_VALUE_LAYER_VALIDATION',JSON.stringify(d.football_value_terms));
add('breakout_bust_deferred',d.breakout_bust?.status==='DEFERRED_ZERO_AUTHORITY'&&d.breakout_bust?.next_step==='STEP_3G_CORE_FEATURES',JSON.stringify(d.breakout_bust));
add('3c_then_3d',d.rank_projection_impact?.first_full_player_level_assessment==='STEP_3C_FULL_162_SHADOW_RECALCULATION'&&d.rank_projection_impact?.user_review_gate==='STEP_3D',JSON.stringify(d.rank_projection_impact));
add('ui_hold',d.downstream_non_blockers?.ui_pr_74==='HOLD_DO_NOT_MERGE',d.downstream_non_blockers?.ui_pr_74);
const failed=checks.filter(x=>x.status==='FAIL');
const report={generated_at:new Date().toISOString(),step:'STEP3B_SUBSTANTIVE_CLOSURE_VALIDATION',result:failed.length?'FAIL':'PASS',failed_count:failed.length,checks};
fs.mkdirSync('guardrails',{recursive:true});fs.writeFileSync('guardrails/step3b-closure.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(failed.length)process.exit(1);
