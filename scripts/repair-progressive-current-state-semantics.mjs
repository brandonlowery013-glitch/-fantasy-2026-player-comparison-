import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(x,null,2)+'\n');};
const report=read('analysis/transition-intelligence-current.json');
const ledger=read('guardrails/current-football-review.json');
const byLedger=new Map((ledger.players||[]).map(x=>[x.player,x]));

const decode=s=>String(s||'').replace(/&#x27;|&#39;|&apos;/gi,"'").replace(/&amp;/gi,'&');
const availabilityNegative=/\b(dnp|did not practice|didn't practice|doesn't practice|does not practice|missed practice|miss practice|out|limited|questionable|doubtful|injur|ankle|hamstring|knee|shoulder|concussion|ir|pup|nfi|setback)\b/i;

let acceptedCurrent=0, rejectedContext=0, availabilityRisk=0;
const counts={};
for(const row of report.rows||[]){
  const cd=row.chronological_development;
  const cs=cd?.current_season_state;
  if(!cs?.current_resolution) throw new Error(`CURRENT_RESOLUTION_MISSING ${row.player}`);
  const cr=cs.current_resolution;
  const basis=cs.current_state_basis;
  const dims=new Set(cr.dimensions||basis?.dimensions||[]);
  const basisText=decode(`${basis?.headline||''}`);

  // Context-only post-camp matches are not authoritative player-state evidence.
  if(basis && dims.size===0 && cr.state==='CURRENT_CONTEXT_CONFIRMED'){
    cs.nonmaterial_current_context=basis;
    cs.current_state_basis=null;
    cs.status='CURRENT_REVIEWED_NO_NEW_MATERIAL_DEVELOPMENT';
    cs.current_resolution={state:'NO_NEW_MATERIAL_DEVELOPMENT',resolution_basis:'POST_CAMP_CONTEXT_REJECTED_AS_NONMATERIAL_PLAYER_STATE',material_change_candidate:false,direction:'UNCHANGED',dimensions:[],camp_baseline_carried_as_context:Boolean(cs.inherited_camp_baseline)};
    rejectedContext++;
  }

  // A current availability event with an explicit DNP/injury marker must fail negative,
  // not disappear into generic CONTEXT because of HTML/entity wording.
  const fixed=cs.current_resolution;
  if(basis && dims.has('availability_recovery') && availabilityNegative.test(basisText)){
    fixed.state='AVAILABILITY_RISK';
    fixed.resolution_basis='POST_CAMP_CURRENT_AVAILABILITY_EVIDENCE';
    fixed.material_change_candidate=true;
    fixed.direction='NEGATIVE';
    fixed.dimensions=['availability_recovery'];
    if(cs.current_state_basis) cs.current_state_basis.direction='NEGATIVE';
    availabilityRisk++;
  }

  const final=cs.current_resolution;
  cd.progressive_story={
    ...(cd.progressive_story||{}),
    current_resolution:final.state,
    current_direction:final.direction,
    material_change_candidate:Boolean(final.material_change_candidate),
    progression:`${cd.camp_retroactive_audit?.latest_camp_basis?cd.camp_retroactive_audit?.trajectory:'NO_MATERIAL_CAMP_EVIDENCE'} -> ${final.state}`
  };
  if(cs.current_state_basis) acceptedCurrent++;
  counts[final.state]=(counts[final.state]||0)+1;
  const l=byLedger.get(row.player);
  if(l?.transition_intelligence) l.transition_intelligence.chronological_development=cd;
}

report.schema_version='1.5.1';
report.chronological_context={
  ...(report.chronological_context||{}),
  players_with_accepted_direct_post_camp_state_basis:acceptedCurrent,
  rejected_context_only_post_camp_matches:rejectedContext,
  availability_risk_current_states:availabilityRisk,
  current_resolution_counts:counts,
  semantic_repair_rule:'Context-only post-camp matches without fantasy dimensions cannot become current player-state authority. Explicit current injury/DNP availability evidence resolves negative and is a material-change candidate.'
};
ledger.transition_intelligence_schema={...(ledger.transition_intelligence_schema||{}),version:'1.5.1',progressive_story_semantic_repair:true};
write('analysis/transition-intelligence-current.json',report);
write('guardrails/current-football-review.json',ledger);

if((report.rows||[]).length!==166) throw new Error(`UNIVERSE_MISMATCH ${(report.rows||[]).length}/166`);
if((report.rows||[]).some(r=>!r.chronological_development?.progressive_story?.current_resolution)) throw new Error('PROGRESSIVE_STORY_MISSING');
if((report.rows||[]).some(r=>r.chronological_development?.current_season_state?.current_resolution?.state==='CURRENT_CONTEXT_CONFIRMED' && !(r.chronological_development?.current_season_state?.current_resolution?.dimensions||[]).length)) throw new Error('CONTEXT_ONLY_CURRENT_STATE_LEAK');
if((report.rows||[]).filter(r=>r.chronological_development?.current_season_state?.current_resolution?.material_change_candidate).some(r=>r.chronological_development?.current_season_state?.current_resolution?.direction==='CONTEXT')) throw new Error('MATERIAL_CONTEXT_DIRECTION_LEAK');
console.log(JSON.stringify({result:'PASS',players:166,accepted_direct_current_state_basis:acceptedCurrent,rejected_context_only_matches:rejectedContext,availability_risk_states:availabilityRisk,current_resolution_counts:counts},null,2));
