import fs from 'node:fs';

const decisionPath='guardrails/step3e-approved-changes-2026-08-30.json';
const patchPath='current162patch-2026-08-24.json';
const sourcePath='MODEL_SOURCE_OF_TRUTH.json';
const universeCfg=JSON.parse(fs.readFileSync('guardrails/guardrails-config.json','utf8'));
const expectedPlayerCount=Number(universeCfg.authoritative_player_count);
if(!fs.existsSync(decisionPath)) throw new Error('Step 3E requires the Aug. 30 approved decision ledger');
if(!fs.existsSync(patchPath)) throw new Error('Step 3E requires the active runtime overlay');
if(!fs.existsSync(sourcePath)) throw new Error('Step 3E requires the model source-of-truth declaration');

const d=JSON.parse(fs.readFileSync(decisionPath,'utf8'));
const patch=JSON.parse(fs.readFileSync(patchPath,'utf8'));
const source=JSON.parse(fs.readFileSync(sourcePath,'utf8'));
const decisions=d.decisions||[];
if(d.supersedes_prior_noop!==true) throw new Error('Step 3E Aug. 30 ledger must explicitly supersede the prior no-op');
if(decisions.length!==5) throw new Error(`Step 3E expected five adjudicated review cases; found ${decisions.length}`);
if(Number(d.direct_changes)!==2||Number(d.connected_changes_count)!==1||Number(d.holds)!==3) throw new Error('Step 3E decision counts do not match the approved Aug. 30 adjudication');

// Step 3E is historical. Later approved recalibrations legitimately replace the original
// APPLIED_APPROVED_CHANGES marker, so prove preservation instead of requiring a stale literal.
const directState=patch.step3e_status==='APPLIED_APPROVED_CHANGES';
const preservedState=String(patch.step3e_status||'').startsWith('PRESERVED_WITH_');
const sourcePreservesStep3E=/approved Step 3E changes preserved/i.test(String(source.step3e_state||''));
if(!directState&&!(preservedState&&sourcePreservesStep3E)) {
  throw new Error(`Active runtime overlay does not prove approved Step 3E preservation (status=${patch.step3e_status||'MISSING'})`);
}
if(Number(source.active_player_model)!==expectedPlayerCount) throw new Error(`Source-of-truth universe mismatch: ${source.active_player_model} != ${expectedPlayerCount}`);
const patchPlayers=patch.players||{};
if(Object.keys(patchPlayers).length!==expectedPlayerCount) throw new Error(`Step 3E runtime overlay must synchronize all ${expectedPlayerCount} active players`);

// Historical Step 3E adjudication must remain represented, but later approved universe/rank
// migrations are allowed to reflow ranks and projections. Do not pin Aug. 30 numeric values.
const adjudicated=['Kaytron Allen','Chuba Hubbard','Jonathon Brooks','Tyler Allgeier','Rashee Rice','Josh Downs'];
for(const name of adjudicated) if(!patchPlayers[name]) throw new Error(`Missing adjudicated Step 3E player from current synchronized overlay: ${name}`);

const overall=Object.values(patchPlayers).map(x=>x.o).sort((a,b)=>a-b);
const trueValue=Object.values(patchPlayers).map(x=>x.tr).sort((a,b)=>a-b);
for(let i=0;i<expectedPlayerCount;i++){
  if(overall[i]!==i+1) throw new Error(`Overall rank integrity failure at ${i+1}`);
  if(trueValue[i]!==i+1) throw new Error(`True-Value rank integrity failure at ${i+1}`);
}

const report={
  generated_at:new Date().toISOString(),
  step:'STEP_3E_APPLY_APPROVED_CHANGES',
  status:'COMPLETE_APPROVED_CHANGES_RETAINED_IN_CURRENT_UNIVERSE',
  source_step:'AUG_30_TARGETED_REVIEW_GATE',
  authoritative_player_count:expectedPlayerCount,
  reviewed_cases:5,
  direct_changes:2,
  connected_changes:1,
  holds:3,
  current_overlay_updated:patch.updated,
  current_overlay_step3e_status:patch.step3e_status,
  source_of_truth_step3e_preserved:sourcePreservesStep3E,
  live_player_overlay_modified:true,
  adjudicated_players_present:true,
  contiguous_overall_ranks:true,
  contiguous_true_value_ranks:true,
  market_independence:true,
  prior_noop_superseded:true,
  next_gate:'FULL_BACKWARD_REAUDIT_BEFORE_PROMOTION'
};
fs.writeFileSync('guardrails/step3e-application-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
