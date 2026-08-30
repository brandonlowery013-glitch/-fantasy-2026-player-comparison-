import fs from 'node:fs';
const x=JSON.parse(fs.readFileSync('data/sources/step6-5d-current-process-policy.json','utf8'));
const fail=m=>{throw new Error(m)};
if(x.schema_version!=='STEP6_5D_PROCESS_POLICY_1.0.0'||x.status!=='ACTIVE')fail('schema/status');
if(x.between_step_global_guardrail_wait_required!==false)fail('global wait rule reintroduced');
if(x.step_specific_qa_required!==true||x.step_specific_hard_guardrail_required!==true)fail('step QA weakened');
if(x.full_backward_audit_required_before_promotion_or_merge!==true)fail('backward audit gate missing');
console.log(JSON.stringify({result:'PASS',between_step_global_guardrail_wait_required:x.between_step_global_guardrail_wait_required,full_backward_audit_required_before_promotion_or_merge:x.full_backward_audit_required_before_promotion_or_merge}));
