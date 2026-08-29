import fs from 'node:fs';

const path='guardrails/step3d-final-decisions.json';
if(!fs.existsSync(path)) throw new Error('Step 3E requires Step 3D final decisions');
const d=JSON.parse(fs.readFileSync(path,'utf8'));
const decisions=d.decisions||d.rows||[];
const approved=Number(d.approved??decisions.filter(x=>String(x.decision||'').startsWith('APPROVE')).length);
const counts=d.counts||{};
const total=Object.values(counts).reduce((s,v)=>s+Number(v||0),0)||decisions.length;
if(approved!==0) throw new Error(`Step 3E no-op contract expected zero approved changes; found ${approved}`);
if(total!==139) throw new Error(`Step 3E expected 139 reviewed flags; found ${total}`);
const holds=decisions.filter(x=>String(x.decision||'').startsWith('HOLD'));
const report={
  generated_at:new Date().toISOString(),
  step:'STEP_3E_APPLY_APPROVED_CHANGES',
  status:'COMPLETE_NO_APPROVED_CHANGES',
  source_step:'STEP_3D_USER_REVIEW_GATE',
  reviewed_flags:total,
  approved_changes:0,
  applied_changes:0,
  live_player_files_modified:false,
  live_projection_movement:0,
  live_rank_movement:0,
  persistent_history_repair_performed:false,
  persistent_history_repair_note:'No live application occurred because Step 3D approved zero changes. The known persistent rookie-history repair remains a Data Integrity gate before any future live projection application that depends on those rows.',
  holds:holds.map(x=>({name:x.name,decision:x.decision,delta_ppg:x.delta_ppg??x.projection_delta_ppg??null})),
  next_step:'STEP_3F_DAILY_EVIDENCE_TO_MODEL_AUTOMATION'
};
fs.writeFileSync('guardrails/step3e-application-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
