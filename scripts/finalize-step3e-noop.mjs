import fs from 'node:fs';

const decisionPath='guardrails/step3e-approved-changes-2026-08-30.json';
const patchPath='current162patch-2026-08-24.json';
if(!fs.existsSync(decisionPath)) throw new Error('Step 3E requires the Aug. 30 approved decision ledger');
if(!fs.existsSync(patchPath)) throw new Error('Step 3E requires the active 162-player runtime overlay');

const d=JSON.parse(fs.readFileSync(decisionPath,'utf8'));
const patch=JSON.parse(fs.readFileSync(patchPath,'utf8'));
const decisions=d.decisions||[];
if(d.supersedes_prior_noop!==true) throw new Error('Step 3E Aug. 30 ledger must explicitly supersede the prior no-op');
if(decisions.length!==5) throw new Error(`Step 3E expected five adjudicated review cases; found ${decisions.length}`);
if(Number(d.direct_changes)!==2||Number(d.connected_changes_count)!==1||Number(d.holds)!==3) throw new Error('Step 3E decision counts do not match the approved Aug. 30 adjudication');
if(patch.updated!=='2026-08-30'||patch.step3e_status!=='APPLIED_APPROVED_CHANGES') throw new Error('Active runtime overlay is not on the approved Aug. 30 Step 3E state');
if(Object.keys(patch.players||{}).length!==162) throw new Error('Step 3E runtime overlay must synchronize all 162 player ranks');

const expected={
  'Kaytron Allen':{o:141,tr:159,s:7.125,pd:6.9,ce:6.3,r:6.5,mp:68},
  'Chuba Hubbard':{o:116,tr:118,s:8.055,pd:8.3,ce:7,r:8.2,mp:162.75},
  'Jonathon Brooks':{o:112,tr:130,s:7.655,pd:7.8,ce:8,r:7.3,mp:169.25}
};
for(const [name,want] of Object.entries(expected)){
  const got=patch.players?.[name];
  if(!got) throw new Error(`Missing Step 3E player: ${name}`);
  for(const [k,v] of Object.entries(want)) if(got[k]!==v) throw new Error(`${name} ${k}: expected ${v}; found ${got[k]}`);
}
const holds=['Tyler Allgeier','Rashee Rice','Josh Downs'];
for(const name of holds) if(!patch.players?.[name]) throw new Error(`Missing held Step 3E player from synchronized rank map: ${name}`);

const overall=[...Object.values(patch.players).map(x=>x.o)].sort((a,b)=>a-b);
const trueValue=[...Object.values(patch.players).map(x=>x.tr)].sort((a,b)=>a-b);
for(let i=0;i<162;i++){
  if(overall[i]!==i+1) throw new Error(`Overall rank integrity failure at ${i+1}`);
  if(trueValue[i]!==i+1) throw new Error(`True-Value rank integrity failure at ${i+1}`);
}

const report={
  generated_at:new Date().toISOString(),
  step:'STEP_3E_APPLY_APPROVED_CHANGES',
  status:'COMPLETE_APPROVED_CHANGES_APPLIED',
  source_step:'AUG_30_TARGETED_REVIEW_GATE',
  reviewed_cases:5,
  direct_changes:2,
  connected_changes:1,
  holds:3,
  live_player_overlay_modified:true,
  live_projection_changes:['Kaytron Allen','Chuba Hubbard','Jonathon Brooks'],
  live_rank_reflow:true,
  market_independence:true,
  prior_noop_superseded:true,
  next_gate:'FULL_BACKWARD_REAUDIT_BEFORE_PROMOTION'
};
fs.writeFileSync('guardrails/step3e-application-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
