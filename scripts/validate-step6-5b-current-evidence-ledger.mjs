import fs from 'node:fs';

const p='data/sources/step6-5b-current-evidence-ledger-2026.json';
const c=JSON.parse(fs.readFileSync(p,'utf8'));
const failures=[];
const need=(v,m)=>{if(!v) failures.push(m);};

need(c.schema_version==='STEP6_5B_CURRENT_EVIDENCE_LEDGER_1.0.0','schema mismatch');
need(c.season===2026,'season mismatch');
need(c.mode==='SHADOW_ONLY','ledger must be shadow-only');
need(c.projection_authority===0,'ledger must have zero direct projection authority');
need(Array.isArray(c.team_universe)&&c.team_universe.length===32,'32-team universe required');
need(new Set(c.team_universe).size===32,'team universe must be unique');
need(Array.isArray(c.source_backbone)&&c.source_backbone.length>=4,'source backbone incomplete');
const statuses=new Set(['MATERIAL','POSSIBLY_MATERIAL','CONTEXT_ONLY','NO_CURRENT_EFFECT']);
const allowedEngines=new Set(['QB','RB','WR','TE','DST','K','TEAM_OFFENSE','TEAM_DEFENSE','SPREAD','TOTAL','PLAYER_PROPS']);
need(Array.isArray(c.evidence)&&c.evidence.length>0,'evidence cannot be empty');
for(const [i,e] of c.evidence.entries()){
  for(const k of ['subject','team','evidence_type','source','captured_at','status','affected_engines','reason','confidence','projection_authority']) need(Object.hasOwn(e,k),`evidence ${i} missing ${k}`);
  need(statuses.has(e.status),`evidence ${i} bad materiality status`);
  need(e.projection_authority===0,`evidence ${i} gained unauthorized numeric authority`);
  need(Array.isArray(e.affected_engines)&&e.affected_engines.length>0,`evidence ${i} lacks affected engines`);
  for(const x of e.affected_engines||[]) need(allowedEngines.has(x),`evidence ${i} unknown engine ${x}`);
}
need(c.closure_requirements.some(x=>x.includes('All 32 teams')),'all-32 closure requirement missing');
need(c.closure_requirements.some(x=>x.includes('2026-08-30')),'roster-cut reconciliation requirement missing');
need(c.evidence.some(x=>x.status==='POSSIBLY_MATERIAL'),'uncertainty visibility missing');
need(c.evidence.some(x=>x.status==='CONTEXT_ONLY'),'context-only classification missing');
need(c.evidence.some(x=>x.status==='NO_CURRENT_EFFECT'),'no-effect classification missing');
need(c.evidence.some(x=>x.affected_engines.includes('TEAM_DEFENSE')),'defensive personnel pathway missing');
need(c.evidence.some(x=>x.affected_engines.includes('SPREAD')),'spread pathway missing');
need(c.evidence.some(x=>x.affected_engines.includes('TOTAL')),'total pathway missing');

if(failures.length){
  console.error(JSON.stringify({status:'FAIL',failures},null,2));
  process.exit(1);
}
console.log(JSON.stringify({status:'PASS',evidence_rows:c.evidence.length,team_universe:c.team_universe.length,ledger_status:c.status},null,2));
