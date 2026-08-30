import fs from 'node:fs';
const p='data/sources/step6-5f-unified-reason-stack-2026.json';
const c=JSON.parse(fs.readFileSync(p,'utf8'));
const bad=[];
if(c.schema_version!=='STEP6_5F_UNIFIED_REASON_STACK_1.0.0')bad.push('schema');
if(c.production_numeric_authority!==0)bad.push('authority');
if(c.status!=='SHADOW_ONLY')bad.push('status');
for(const k of ['may_change_projection','may_change_probability','may_change_true_value','may_change_market_verdict','may_create_bet_signal','sportsbook_may_explain_football_forecast']) if(c.rules[k]!==false)bad.push(k);
for(const k of ['read_only_explanation_layer','sportsbook_may_explain_downstream_edge_only','missing_reason_is_unknown_not_zero','duplicate_evidence_key_must_collapse','same_evidence_cannot_support_multiple_independent_signal_counts','unvalidated_numeric_effect_cannot_be_stated_as_causal']) if(c.rules[k]!==true)bad.push(k);
if(c.governance?.full_backward_audit_required_before_promotion_or_merge!==true)bad.push('backward audit');
if(c.governance?.pr74_hold!==true)bad.push('pr74 hold');
if(c.governance?.step7_visual_system_frozen!==true)bad.push('step7 frozen');
if((c.output_contract?.projection_fields_prohibited||[]).length<7)bad.push('prohibited numeric outputs');
if(bad.length){console.error(JSON.stringify({result:'FAIL',bad},null,2));process.exit(1)}
console.log(JSON.stringify({result:'PASS',schema:c.schema_version,surfaces:c.supported_surfaces,authority:c.production_numeric_authority,sportsbook_inputs_used_for_forecast:false},null,2));
