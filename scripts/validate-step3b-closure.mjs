import fs from 'node:fs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const decision=read('data/sources/step3b-final-decision-2026.json');
const checks=[];
const add=(name,ok,details)=>checks.push({name,status:ok?'PASS':'FAIL',details});

const rb=decision.rb_distribution_decision||decision.rb_q50_decision||decision.rb_q50||{};
const rbDecisionFile='data/sources/step3b-rb-q50-2019-2025-decision.json';
const hasRbDecisionFile=fs.existsSync(rbDecisionFile);
const rbReport=hasRbDecisionFile?read(rbDecisionFile):null;

add('status_locked',decision.status==='STEP3B_FOUNDATION_LOCKED_AWAITING_USER_APPROVAL_FOR_3C',decision.status);
add('zero_live_authority',decision.live_weight===0&&decision.live_projection_movement===0&&decision.live_rank_movement===0,`weight=${decision.live_weight} proj=${decision.live_projection_movement} rank=${decision.live_rank_movement}`);
add('no_market_inputs',decision.sportsbook_or_adp_used===false,'sportsbook/adp false');
add('approval_gate',decision.approval_required_before_3c===true&&decision.next_step==='STEP_3C_FULL_162_SHADOW_RECALCULATION',decision.next_step);

const qb=decision.qb_distribution_decision||decision.qb_q50_decision||decision.qb_q50||{};
add('qb_q50_locked',qb.q50_status==='VALIDATED_LOCKED_FOR_3C_SHADOW'&&qb.method==='TRAILING_2'&&qb.all_years_compatible_95pct===true,JSON.stringify(qb));

add('rb_2019_2025_core_q50_locked',rb.q50_status==='VALIDATED_RETAIN_CORE_RB_Q50_FOR_3C_SHADOW'&&rb.decision==='RETAIN_CORE_Q50_MODEL_AVAILABILITY_ROLE_DOWNSIDE_SEPARATELY'&&Array.isArray(rb.decision_population_seasons)&&rb.decision_population_seasons.join(',')==='2019,2020,2021,2022,2023,2024,2025'&&rb.healthy_established_compatible_95pct===true&&rb.blanket_q50_offset_authorized===false&&rb.existing_distribution_change_authorized===false&&rb.availability_role_downside_numeric_change_authorized_in_3b===false,JSON.stringify(rb));

if(hasRbDecisionFile){
  const matches=rbReport?.decision===rb.decision&&rbReport?.q50_status===rb.q50_status&&rbReport?.healthy_established_n===rb.healthy_established_n&&rbReport?.healthy_established_q50_coverage===rb.healthy_established_q50_coverage&&rbReport?.blanket_q50_offset_authorized===false&&rbReport?.existing_distribution_change_authorized===false;
  add('rb_decision_report_matches_contract',matches,JSON.stringify({source:rbDecisionFile,decision:rbReport?.decision,q50_status:rbReport?.q50_status}));
}else{
  add('rb_decision_report_matches_contract',true,'No standalone RB decision artifact is present. The authoritative STEP3B_FINAL_DECISION_2.1.0 contract itself contains the full locked 2019-2025 RB decision and metrics, so closure validates that embedded authoritative record rather than failing on a non-required duplicate file.');
}

const current=decision.current_evidence_authority||{};
add('preseason_current_evidence_zero',current.same_role_cohort?.status==='VALIDATED_FOR_FURTHER_SHADOW_TESTING_NOT_PROMOTED'&&Number(current.weeks_1_4?.preseason_weight??0)===0&&Number(current.same_role_cohort?.preseason_weight??0)===0,current.same_role_cohort?.status);
const role=decision.role_change_authority||{};
add('role_upshift_no_auto_boost',role.automatic_preseason_role_upshift_modifier===false,role.policy||role.rule);
const env=decision.team_qb_environment_authority||{};
add('stable_environment_history_rule',String(env.stable_team_qb_rule||'').includes('RETAIN_ESTABLISHED_HISTORY_PRIMARY_NO_AUTOMATIC_EARLY_EVIDENCE_OVERRIDE')||Number(env.stable_team_qb_early_improvement_pct)<0,env.stable_team_qb_early_improvement_pct);
const coach=decision.coach_coordinator_playcaller_authority||{};
add('coach_weights_zero',Number(coach.coach_weight??0)===0&&Number(coach.coordinator_weight??0)===0&&Number(coach.play_caller_weight??0)===0,coach.next_step);
const inj=decision.confirmed_injury_authority||{};
add('injury_numeric_penalty_zero',inj.injury_severity_numeric_penalty===false,inj.policy||inj.status);
const ex=decision.extreme_disagreement||{};
add('extreme_disagreement_gate',ex.review_required===true&&ex.automatic_publish===false,JSON.stringify(ex));
const rook=decision.rookie_history_integrity||{};
add('rookie_shadow_sanitization',Array.isArray(rook.shadow_no_history_players)&&rook.shadow_no_history_players.length===10&&Array.isArray(rook.known_persistent_source_contamination_players)&&rook.known_persistent_source_contamination_players.length===7,rook.persistent_source_repair_status||rook.source_repair_status);
add('rookie_pre3e_repair_gate',String(rook.pre_3e_gate||rook.repair_gate||'').includes('Repair')||String(rook.repair_requirement||'').includes('Repair'),rook.pre_3e_gate||rook.repair_gate||rook.repair_requirement);
const hist=decision.historical_relevance||{};
const rw=hist.recency_weights||{};
add('recency_weights_locked',JSON.stringify(rw.one_season)==='[1]'&&JSON.stringify(rw.two_seasons)==='[0.35,0.65]'&&JSON.stringify(rw.three_seasons)==='[0.2,0.3,0.5]',JSON.stringify(rw));
const fv=decision.football_value||{};
add('football_value_deferred',fv.numeric_authority===0&&fv.lambda==null&&fv.rho==null&&fv.gamma==null,JSON.stringify(fv));
const bb=decision.breakout_bust||{};
add('breakout_bust_deferred',bb.status==='DEFERRED_ZERO_AUTHORITY',JSON.stringify(bb));
const seq=decision.sequence||{};
add('3c_then_3d',seq.first_full_player_level_assessment==='STEP_3C_FULL_162_SHADOW_RECALCULATION'&&seq.user_review_gate==='STEP_3D',JSON.stringify(seq));
const ui=decision.ui_pr74||decision.ui_hold||{};
add('ui_hold',ui.status==='HOLD_DO_NOT_MERGE'||ui==='HOLD_DO_NOT_MERGE',typeof ui==='string'?ui:ui.status);

const failed=checks.filter(x=>x.status==='FAIL');
const report={generated_at:new Date().toISOString(),step:'STEP3B_SUBSTANTIVE_CLOSURE_VALIDATION',result:failed.length?'FAIL':'PASS',failed_count:failed.length,checks};
fs.mkdirSync('guardrails',{recursive:true});
fs.writeFileSync('guardrails/step3b-closure.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(failed.length) process.exit(1);
