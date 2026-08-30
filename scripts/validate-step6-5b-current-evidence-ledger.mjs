import fs from 'node:fs';

const p='data/sources/step6-5b-current-evidence-ledger-2026.json';
const cp='data/sources/step6-5b-training-camp-injury-chronology-2026.json';
const c=JSON.parse(fs.readFileSync(p,'utf8'));
const chrono=JSON.parse(fs.readFileSync(cp,'utf8'));
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

need(chrono.schema_version==='STEP6_5B_TRAINING_CAMP_INJURY_CHRONOLOGY_1.0.0','camp chronology schema mismatch');
need(chrono.season===2026,'camp chronology season mismatch');
need(chrono.review_window?.includes_preexisting_injuries===true,'players entering camp injured must be included');
need(chrono.review_window?.includes_players_entering_camp_on_pup_or_nfi===true,'opening PUP/NFI must be included');
need(chrono.review_window?.includes_injuries_sustained_during_camp===true,'camp injuries must be included');
need(chrono.review_window?.includes_recovery_and_activation_events===true,'recovery/activation chronology must be included');
need(chrono.state_resolution?.chronology_required===true,'chronology resolution required');
need(chrono.state_resolution?.latest_verified_state_wins===true,'latest verified state must win');
need(Array.isArray(chrono.events)&&chrono.events.length>0,'camp chronology cannot be empty');
need(chrono.events.some(e=>e.subject==='Alvin Kamara'&&e.status==='MATERIAL'&&String(e.current_state).includes('EXPECTED_ABSENCE')),'Kamara current MCL absence state missing');
need(chrono.events.some(e=>String(e.evidence_type).includes('ENTERED_CAMP_INJURED')),'opening-camp injured player history missing');
need(chrono.required_backfill?.all_32_teams===true,'full 32-team camp backfill requirement missing');
need(chrono.required_backfill?.week1_status_resolution===true,'Week 1 injury resolution requirement missing');

if(failures.length){
  console.error(JSON.stringify({status:'FAIL',failures},null,2));
  process.exit(1);
}
console.log(JSON.stringify({status:'PASS',evidence_rows:c.evidence.length,camp_events:chrono.events.length,team_universe:c.team_universe.length,ledger_status:c.status,camp_status:chrono.status},null,2));
