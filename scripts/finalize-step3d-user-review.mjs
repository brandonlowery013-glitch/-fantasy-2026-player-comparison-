import fs from 'node:fs';

const gatePath='guardrails/step3d-user-review-gate.json';
if(!fs.existsSync(gatePath))throw new Error('Step 3D gate must be built before final review');
const gate=JSON.parse(fs.readFileSync(gatePath,'utf8'));
const rows=gate.rows||[];
const decisions=[];
for(const r of rows){
  let decision='REJECT_DIRECT_HISTORY_OVERRIDE_KEEP_LIVE';
  let reason='Step 3C shadow is a validated historical prior/center, not a fully context-adjusted final projection. Step 3B assigns zero numeric preseason authority to unvalidated role-upshift, injury-severity, coach/play-caller and early-evidence modifiers, so a direct history-center replacement would discard known current projection context without a validated bridge.';
  if(r.extreme_disagreement_review){
    decision='HOLD_EXTREME_MANUAL_REVIEW';
    reason='Extreme disagreement exceeds the locked 9.498105203619907 PPR/G quarantine threshold. No direct application is allowed.';
  }else if(Number(r.live_projection_ppr)===0 && Number(r.shadow_projection_ppr)>0){
    decision='HOLD_DATA_INTEGRITY_ZERO_LIVE_PROJECTION';
    reason='A zero live projection versus nonzero historical prior is a data/integrity condition, not evidence that the historical prior should be promoted directly.';
  }
  decisions.push({name:r.name,pos:r.pos,team:r.team,live_projection_ppr:r.live_projection_ppr,shadow_projection_ppr:r.shadow_projection_ppr,projection_delta_ppg:r.projection_delta_ppg,step3d_bucket:r.step3d_bucket,decision,reason});
}
const counts=decisions.reduce((o,d)=>(o[d.decision]=(o[d.decision]||0)+1,o),{});
const approved=decisions.filter(d=>d.decision.startsWith('APPROVE'));
const holds=decisions.filter(d=>d.decision.startsWith('HOLD'));
const report={
  generated_at:new Date().toISOString(),
  step:'STEP_3D_USER_REVIEW_GATE',
  status:'COMPLETE',
  review_basis:'User authorized Step 3D after Step 3C results were presented. Review rejects direct promotion of history-center priors where no validated current-context bridge exists.',
  flagged_rows:decisions.length,
  decision_counts:counts,
  approved_change_count:approved.length,
  held_for_followup_count:holds.length,
  live_projection_movement:0,
  live_rank_movement:0,
  sportsbook_or_adp_used:false,
  step3e_policy:approved.length?'APPLY_ONLY_EXPLICITLY_APPROVED_ROWS':'NO_APPROVED_CHANGES_STEP_3E_IS_AUDITED_NO_OP',
  held_items:holds,
  decisions
};
fs.writeFileSync('guardrails/step3d-final-decisions.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,counts,approved:approved.length,holds:holds.map(x=>({name:x.name,decision:x.decision,delta_ppg:x.projection_delta_ppg}))},null,2));
