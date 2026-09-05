import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(x,null,2)+'\n');};
const report=read('analysis/transition-intelligence-current.json');
const ledger=read('guardrails/current-football-review.json');
const now=Date.parse(report.generated_at||new Date().toISOString());
const byLedger=new Map((ledger.players||[]).map(x=>[x.player,x]));

const positive=/\b(won|named starter|starter|starting|lead|feature|first team|full practice|full participant|cleared|activated|healthy|ready|improv|progress|ahead|expanded|increase|more work|trusted|breakout|sharp|comfortable|master|command)\b/i;
const negative=/\b(lost|backup|behind|limited|out|injur|pup|ir|nfi|setback|reduced|fewer|uncertain|questionable|waived|released|surgery|miss|struggl|slowed|restricted)\b/i;
const neutral=/\b(learning|install|competition|battle|split|rotation|working through|adjust|transition|new offense|new scheme|new coordinator|new quarterback|new qb)\b/i;
const roleTerms=/\b(starter|starting|backup|lead|feature|first team|reps|snap|route|target|carry|touch|workload|role|depth chart|competition|committee|split|rotation)\b/i;
const recoveryTerms=/\b(recover|rehab|surgery|acl|mcl|lcl|meniscus|achilles|ankle|knee|hamstring|cleared|practice|pup|ir|limited|full participant|healthy|setback)\b/i;
const schemeTerms=/\b(offense|offensive coordinator|coordinator|scheme|system|playbook|install|motion|rpo|play action|under center|shotgun|terminology|concept)\b/i;
const chemistryTerms=/\b(chemistry|rapport|connection|timing|trust|sync|working with)\b/i;

function txt(e){return `${e.headline||''} ${e.description||''} ${e.body_text||''}`.replace(/\s+/g,' ').trim();}
function ts(e){const t=Date.parse(e.published||'');return Number.isFinite(t)?t:null;}
function phase(t){
  if(!t)return'UNDATED';
  const d=new Date(t),m=d.getUTCMonth()+1,day=d.getUTCDate();
  if(m<=5)return'OFFSEASON';
  if(m===6)return'MINICAMP_OTAS';
  if(m===7)return'TRAINING_CAMP_EARLY';
  if(m===8&&day<=15)return'TRAINING_CAMP_MID';
  if(m===8&&day<=26)return'PRESEASON_LATE_CAMP';
  if(m===8)return'ROSTER_CUTS_FINAL_CAMP';
  return'WEEK_1_CURRENT_STATE';
}
function direction(s){
  const p=positive.test(s),n=negative.test(s);
  if(p&&!n)return'POSITIVE';
  if(n&&!p)return'NEGATIVE';
  if(p&&n)return'MIXED';
  if(neutral.test(s))return'DEVELOPMENTAL_NEUTRAL';
  return'CONTEXT';
}
function dimensions(s){const out=[];if(roleTerms.test(s))out.push('role_usage');if(recoveryTerms.test(s))out.push('availability_recovery');if(schemeTerms.test(s))out.push('scheme_adaptation');if(chemistryTerms.test(s))out.push('chemistry');return out;}
function significance(e){
  const s=txt(e);let score=0;
  if(e.direct_player_evidence)score+=4;
  if(e.cluster_trigger)score+=2;
  if(roleTerms.test(s))score+=3;
  if(recoveryTerms.test(s))score+=3;
  if(/\b(named starter|won .* job|activated|placed on ir|waived|released|traded|signed|full practice|full participant|cleared)\b/i.test(s))score+=4;
  if(schemeTerms.test(s)||chemistryTerms.test(s))score+=1;
  return score;
}
function summarizeTimeline(events){
  const dated=events.filter(x=>x.timestamp!==null);
  if(!dated.length)return{status:'NO_DATED_EVIDENCE',trajectory:'UNKNOWN',current_state_basis:null};
  const latest=[...dated].sort((a,b)=>b.timestamp-a.timestamp)[0];
  const early=[...dated].sort((a,b)=>a.timestamp-b.timestamp)[0];
  const meaningful=dated.filter(x=>x.significance>=3);
  const latestMeaningful=[...meaningful].sort((a,b)=>b.timestamp-a.timestamp)[0]||latest;
  let trajectory='STABLE_OR_CONTEXT_ONLY';
  if(early.direction!==latestMeaningful.direction){
    if(latestMeaningful.direction==='POSITIVE')trajectory='IMPROVING_OR_ROLE_GAIN';
    else if(latestMeaningful.direction==='NEGATIVE')trajectory='DECLINING_OR_ROLE_LOSS';
    else trajectory='EVOLVING_MIXED';
  }else if(latestMeaningful.direction==='POSITIVE')trajectory='POSITIVE_CONFIRMED';
  else if(latestMeaningful.direction==='NEGATIVE')trajectory='NEGATIVE_CONFIRMED';
  const recentCut=now-14*86400000;
  const recent=meaningful.filter(x=>x.timestamp>=recentCut);
  const current=recent.sort((a,b)=>b.significance-a.significance||b.timestamp-a.timestamp)[0]||latestMeaningful;
  return{status:'CHRONOLOGY_BUILT',trajectory,current_state_basis:{published:current.published,phase:current.phase,direction:current.direction,headline:current.headline,dimensions:current.dimensions},latest_evidence_age_days:Math.max(0,Math.floor((now-current.timestamp)/86400000))};
}

let chronologyPlayers=0,withCurrentState=0;
for(const row of report.rows||[]){
  const events=(row.development_evidence||[]).map(e=>{const t=ts(e),s=txt(e);return{...e,timestamp:t,phase:phase(t),direction:direction(s),dimensions:dimensions(s),significance:significance(e)}}).sort((a,b)=>(a.timestamp??Number.MAX_SAFE_INTEGER)-(b.timestamp??Number.MAX_SAFE_INTEGER));
  const synthesis=summarizeTimeline(events);
  row.chronological_development={mandatory:true,event_count:events.length,events, ...synthesis,rule:'OLDER_EVIDENCE_IS_RETAINED_AS_CONTEXT; LATER_MATERIAL_EVIDENCE_SUPERSEDES_EARLIER_STATE_WHILE_PRESERVING_THE_TRAJECTORY'};
  if(events.length)chronologyPlayers++;
  if(synthesis.current_state_basis)withCurrentState++;
  const l=byLedger.get(row.player);
  if(l?.transition_intelligence)l.transition_intelligence.chronological_development=row.chronological_development;
}
report.schema_version='1.3.0';
report.chronological_context={mandatory:true,players_with_timeline:chronologyPlayers,players_with_current_state_basis:withCurrentState,precedence:'CHRONOLOGICAL_NOT_RECENCY_ONLY',rule:'Preserve offseason/camp evidence; sort by date and phase; later material developments supersede earlier state; older evidence remains explanatory context.'};
ledger.transition_intelligence_schema={...(ledger.transition_intelligence_schema||{}),version:'1.3.0',chronological_context_mandatory:true,chronology_rule:report.chronological_context.rule};
write('analysis/transition-intelligence-current.json',report);
write('guardrails/current-football-review.json',ledger);
console.log(JSON.stringify({result:'PASS',players:(report.rows||[]).length,players_with_timeline:chronologyPlayers,players_with_current_state_basis:withCurrentState},null,2));
