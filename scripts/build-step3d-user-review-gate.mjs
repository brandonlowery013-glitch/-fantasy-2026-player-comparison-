import fs from 'node:fs';

const recalPath='guardrails/step3c-shadow-recalculation-162.json';
const queuePath='guardrails/step3c-user-review-queue-162.json';
if(!fs.existsSync(recalPath)){
  throw new Error('Step 3D requires Step 3C shadow output in guardrails/');
}
const recal=JSON.parse(fs.readFileSync(recalPath,'utf8'));
const authoritative=Number(recal.authoritative_player_count||recal.universe_count||0);
let queue=[];
if(fs.existsSync(queuePath)){
  queue=JSON.parse(fs.readFileSync(queuePath,'utf8')).review_queue||[];
}else if(Array.isArray(recal.rows)){
  queue=recal.rows.filter(r=>r.extreme_disagreement_review_required).map(r=>({
    name:r.player,
    pos:r.position,
    live_projection:r.live_projection,
    shadow_projection:r.shadow_projection,
    projection_delta_ppg:Number(r.shadow_ppr_per_game)-Number(r.live_ppr_per_game),
    extreme_disagreement_review:true
  }));
}else{
  throw new Error('Step 3D requires Step 3C rows or a review queue');
}
const threshold=Number(recal.extreme_disagreement_threshold_ppg||9.498105203619907);

function bucket(r){
  const a=Math.abs(Number(r.projection_delta_ppg||0));
  if(r.extreme_disagreement_review||a>=threshold)return 'EXTREME_HOLD';
  if(a>=2)return 'MATERIAL_MANUAL_REVIEW';
  if(a>=1)return 'MODERATE_BATCH_REVIEW';
  return 'MINOR_BATCH_REVIEW';
}
const rows=queue.map(r=>({...r,step3d_bucket:bucket(r)}));
const counts={};for(const r of rows)counts[r.step3d_bucket]=(counts[r.step3d_bucket]||0)+1;
const byPos={};for(const r of rows){byPos[r.pos]??={total:0,positive:0,negative:0};byPos[r.pos].total++;if(r.projection_delta_ppg>0)byPos[r.pos].positive++;if(r.projection_delta_ppg<0)byPos[r.pos].negative++;}
const sorted=[...rows].sort((a,b)=>Math.abs(b.projection_delta_ppg)-Math.abs(a.projection_delta_ppg));
const report={
  generated_at:new Date().toISOString(),
  step:'STEP_3D_USER_REVIEW_GATE',
  status:'READY_FOR_USER_DECISION',
  source_step:'STEP_3C_FULL_SHADOW_RECALCULATION',
  authoritative_player_count:authoritative,
  players_checked:recal.universe_count||recal.players_checked,
  flagged_rows:rows.length,
  extreme_threshold_ppg:threshold,
  buckets:counts,
  by_position:byPos,
  policy:{
    EXTREME_HOLD:'No automatic approval. Individual football review required.',
    MATERIAL_MANUAL_REVIEW:'Absolute shadow/live difference >=2.0 PPR/G. Review individually before any Step 3E application.',
    MODERATE_BATCH_REVIEW:'Absolute difference 1.0-1.999 PPR/G. May be reviewed/approved as a batch only after material set is resolved.',
    MINOR_BATCH_REVIEW:'Absolute difference <1.0 PPR/G. Keep separate from material changes; no live application until explicit approval.'
  },
  automatic_apply:false,
  live_projection_movement:0,
  live_rank_movement:0,
  next_step_after_user_decision:'STEP_3E_APPLY_APPROVED_CHANGES',
  rows:sorted
};
fs.writeFileSync('guardrails/step3d-user-review-gate.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,authoritative_player_count:authoritative,flagged:rows.length,buckets:counts,top:sorted.slice(0,10).map(x=>({name:x.name,pos:x.pos,delta_ppg:x.projection_delta_ppg,bucket:x.step3d_bucket}))},null,2));
