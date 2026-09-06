import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(x,null,2)+'\n');};
const report=read('analysis/transition-intelligence-current.json');
const ledger=read('guardrails/current-football-review.json');
const source=read('MODEL_SOURCE_OF_TRUTH.json');
const phaseConfig=read(`config/season-phase-${source.season||2026}.json`);
const now=Date.parse(report.generated_at||new Date().toISOString());
const campStart=Date.parse(phaseConfig.retroactive_camp.start),campEnd=Date.parse(phaseConfig.retroactive_camp.end),currentStart=Date.parse(phaseConfig.current_season.start);
if(![campStart,campEnd,currentStart].every(Number.isFinite)||campEnd>=currentStart)throw new Error('Invalid season phase boundaries');
const byLedger=new Map((ledger.players||[]).map(x=>[x.player,x]));

const positive=/\b(won|named starter|starter|starting|lead|feature|first team|full practice|full participant|cleared|activated|healthy|ready|improv|progress|ahead|expanded|increase|more work|trusted|breakout|sharp|comfortable|master|command)\b/i;
const negative=/\b(lost|backup|behind|limited|out|injur|pup|ir|nfi|setback|reduced|fewer|uncertain|questionable|waived|released|surgery|miss|struggl|slowed|restricted)\b/i;
const neutral=/\b(learning|install|competition|battle|split|rotation|working through|adjust|transition|new offense|new scheme|new coordinator|new quarterback|new qb)\b/i;
const roleTerms=/\b(starter|starting|backup|lead|feature|first team|reps|snap|route|target|carry|touch|workload|role|depth chart|competition|committee|split|rotation)\b/i;
const recoveryTerms=/\b(recover|rehab|surgery|acl|mcl|lcl|meniscus|achilles|ankle|knee|hamstring|cleared|practice|pup|ir|limited|full participant|healthy|setback)\b/i;
const schemeTerms=/\b(offense|offensive coordinator|coordinator|scheme|system|playbook|install|motion|rpo|play action|under center|shotgun|terminology|concept)\b/i;
const chemistryTerms=/\b(chemistry|rapport|connection|timing|trust|sync|working with)\b/i;

function txt(e){return `${e.headline||''} ${e.description||''} ${e.matched_context||''} ${e.body_text||''}`.replace(/\s+/g,' ').trim();}
function ts(e){const t=Date.parse(e.published||'');return Number.isFinite(t)?t:null;}
function phase(t){
  if(!t)return'UNDATED';
  if(t>=currentStart)return'CURRENT_SEASON_STATE';
  if(t<campStart)return'PRE_CAMP_OFFSEASON';
  const d=new Date(t),m=d.getUTCMonth()+1,day=d.getUTCDate();
  if(m<=5)return'OFFSEASON';
  if(m===6)return'MINICAMP_OTAS';
  if(m===7)return'TRAINING_CAMP_EARLY';
  if(m===8&&day<=15)return'TRAINING_CAMP_MID';
  if(m===8&&day<=26)return'PRESEASON_LATE_CAMP';
  return'ROSTER_CUTS_FINAL_CAMP';
}
function direction(s){const p=positive.test(s),n=negative.test(s);if(p&&!n)return'POSITIVE';if(n&&!p)return'NEGATIVE';if(p&&n)return'MIXED';if(neutral.test(s))return'DEVELOPMENTAL_NEUTRAL';return'CONTEXT';}
function dimensions(s){const out=[];if(roleTerms.test(s))out.push('role_usage');if(recoveryTerms.test(s))out.push('availability_recovery');if(schemeTerms.test(s))out.push('scheme_adaptation');if(chemistryTerms.test(s))out.push('chemistry');return out;}
function significance(e){const s=txt(e);let score=0;if(e.direct_player_evidence)score+=4;if(e.cluster_trigger)score+=2;if(roleTerms.test(s))score+=3;if(recoveryTerms.test(s))score+=3;if(/\b(named starter|won .* job|activated|placed on ir|waived|released|traded|signed|full practice|full participant|cleared)\b/i.test(s))score+=4;if(schemeTerms.test(s)||chemistryTerms.test(s))score+=1;return score;}
function trajectory(events){const dated=events.filter(x=>x.timestamp!==null);if(!dated.length)return'UNKNOWN';const meaningful=dated.filter(x=>x.significance>=3),early=(meaningful[0]||dated[0]),late=(meaningful.at(-1)||dated.at(-1));if(early.direction!==late.direction){if(late.direction==='POSITIVE')return'IMPROVING_OR_ROLE_GAIN';if(late.direction==='NEGATIVE')return'DECLINING_OR_ROLE_LOSS';return'EVOLVING_MIXED';}if(late.direction==='POSITIVE')return'POSITIVE_CONFIRMED';if(late.direction==='NEGATIVE')return'NEGATIVE_CONFIRMED';return'STABLE_OR_CONTEXT_ONLY';}
function bestCurrent(events){const current=events.filter(x=>x.timestamp!==null&&x.timestamp>=currentStart);if(!current.length)return null;const meaningful=current.filter(x=>x.significance>=3);return [...(meaningful.length?meaningful:current)].sort((a,b)=>b.significance-a.significance||b.timestamp-a.timestamp)[0];}
function bestCampBaseline(events){const camp=events.filter(x=>x.timestamp!==null&&x.timestamp>=campStart&&x.timestamp<=campEnd);if(!camp.length)return null;const meaningful=camp.filter(x=>x.significance>=3);return [...(meaningful.length?meaningful:camp)].sort((a,b)=>b.timestamp-a.timestamp||b.significance-a.significance)[0];}
function currentResolution(current,campBaseline,ledgerRow){
  if(current){
    const dims=new Set(current.dimensions||[]),dir=current.direction;
    let state='CURRENT_CONTEXT_CONFIRMED';
    if(dims.has('availability_recovery')) state=dir==='POSITIVE'?'HEALTH_OR_AVAILABILITY_IMPROVING':dir==='NEGATIVE'?'AVAILABILITY_RISK':'AVAILABILITY_STATUS_UPDATE';
    if(dims.has('role_usage')) state=dir==='POSITIVE'?'ROLE_UP':dir==='NEGATIVE'?'ROLE_DOWN':dir==='MIXED'?'ROLE_MIXED':'ROLE_CONFIRMED_OR_CONTEXT';
    if(dims.has('scheme_adaptation')||dims.has('chemistry')) state=dir==='POSITIVE'?'ENVIRONMENT_OR_CHEMISTRY_UP':dir==='NEGATIVE'?'ENVIRONMENT_OR_CHEMISTRY_DOWN':'ENVIRONMENT_OR_CHEMISTRY_CONTEXT';
    return {state,resolution_basis:'POST_CAMP_CURRENT_EVIDENCE',material_change_candidate:['POSITIVE','NEGATIVE','MIXED'].includes(dir),direction:dir,dimensions:[...dims]};
  }
  const reviewed=String(ledgerRow?.status||'').startsWith('REVIEWED');
  if(reviewed){
    return {state:'NO_NEW_MATERIAL_DEVELOPMENT',resolution_basis:'FULL_CURRENT_SWEEP_NO_NEW_PLAYER_MATERIAL_EVIDENCE',material_change_candidate:false,direction:'UNCHANGED',dimensions:[],camp_baseline_carried_as_context:Boolean(campBaseline)};
  }
  return {state:'CURRENT_STATE_UNRESOLVED',resolution_basis:'CURRENT_SWEEP_NOT_CONFIRMED',material_change_candidate:false,direction:'UNKNOWN',dimensions:[],camp_baseline_carried_as_context:Boolean(campBaseline)};
}

let chronologyPlayers=0,currentEvidencePlayers=0,synthesizedCurrentPlayers=0,campEvidencePlayers=0,campNoEvidencePlayers=0;
const resolutionCounts={};
for(const row of report.rows||[]){
  const events=(row.development_evidence||[]).map(e=>{const t=ts(e),s=txt(e);return{...e,timestamp:t,phase:phase(t),direction:direction(s),dimensions:dimensions(s),significance:significance(e)}}).sort((a,b)=>(a.timestamp??Number.MAX_SAFE_INTEGER)-(b.timestamp??Number.MAX_SAFE_INTEGER));
  const campEvents=events.filter(x=>x.timestamp!==null&&x.timestamp>=campStart&&x.timestamp<=campEnd);
  const currentEvents=events.filter(x=>x.timestamp!==null&&x.timestamp>=currentStart);
  const current=bestCurrent(events),campBaseline=bestCampBaseline(events),ledgerRow=byLedger.get(row.player);
  const resolution=currentResolution(current,campBaseline,ledgerRow);
  const campAudit={required:true,window:{start:phaseConfig.retroactive_camp.start,end:phaseConfig.retroactive_camp.end},status:campEvents.length?'RETROACTIVE_CAMP_EVIDENCE_FOUND':'RETROACTIVE_CAMP_REVIEWED_NO_EVIDENCE',event_count:campEvents.length,trajectory:trajectory(campEvents),latest_camp_basis:campBaseline?{published:campBaseline.published,phase:campBaseline.phase,direction:campBaseline.direction,headline:campBaseline.headline,dimensions:campBaseline.dimensions}:null,authority:phaseConfig.retroactive_camp.authority,rule:phaseConfig.retroactive_camp.rule};
  const currentState={required:true,window:{start:phaseConfig.current_season.start,end:report.generated_at||new Date().toISOString()},status:current?'CURRENT_EVIDENCE_FOUND':resolution.state==='NO_NEW_MATERIAL_DEVELOPMENT'?'CURRENT_REVIEWED_NO_NEW_MATERIAL_DEVELOPMENT':'CURRENT_STATE_UNRESOLVED',event_count:currentEvents.length,current_state_basis:current?{published:current.published,phase:current.phase,direction:current.direction,headline:current.headline,dimensions:current.dimensions}:null,inherited_camp_baseline:!current&&campBaseline?{published:campBaseline.published,phase:campBaseline.phase,direction:campBaseline.direction,headline:campBaseline.headline,dimensions:campBaseline.dimensions}:null,current_resolution:resolution,authority:phaseConfig.current_season.authority,rule:'Current-season evidence supersedes camp when present. When the full current sweep finds no new material player evidence, explicitly resolve the player as NO_NEW_MATERIAL_DEVELOPMENT while retaining camp only as explanatory history.'};
  const story={camp_trajectory:campAudit.trajectory,current_resolution:resolution.state,current_direction:resolution.direction,material_change_candidate:resolution.material_change_candidate,progression:campBaseline?`${campAudit.trajectory} -> ${resolution.state}`:`NO_MATERIAL_CAMP_EVIDENCE -> ${resolution.state}`};
  row.chronological_development={mandatory:true,event_count:events.length,events,camp_retroactive_audit:campAudit,current_season_state:currentState,progressive_story:story,overall_trajectory:trajectory(events),rule:'CAMP IS CLOSED HISTORICAL CONTEXT; CURRENT EVIDENCE CONTROLS WHEN PRESENT; A COMPLETE CURRENT SWEEP WITH NO NEW MATERIAL EVIDENCE RESOLVES TO NO_NEW_MATERIAL_DEVELOPMENT, NOT UNRESOLVED.'};
  if(events.length)chronologyPlayers++;if(current)currentEvidencePlayers++;if(currentState.status!=='CURRENT_STATE_UNRESOLVED')synthesizedCurrentPlayers++;if(campEvents.length)campEvidencePlayers++;else campNoEvidencePlayers++;
  resolutionCounts[resolution.state]=(resolutionCounts[resolution.state]||0)+1;
  if(ledgerRow?.transition_intelligence)ledgerRow.transition_intelligence.chronological_development=row.chronological_development;
}
report.schema_version='1.5.0';
report.season_phase={config:`config/season-phase-${source.season||2026}.json`,retroactive_camp:phaseConfig.retroactive_camp,current_season:phaseConfig.current_season};
report.chronological_context={mandatory:true,players_with_timeline:chronologyPlayers,players_with_direct_post_camp_evidence:currentEvidencePlayers,players_with_synthesized_current_state:synthesizedCurrentPlayers,retroactive_camp_players_with_evidence:campEvidencePlayers,retroactive_camp_players_reviewed_no_evidence:campNoEvidencePlayers,current_resolution_counts:resolutionCounts,precedence:'CURRENT_SEASON_EVIDENCE_OVER_CLOSED_CAMP; COMPLETE_CURRENT_SWEEP_NO_CHANGE_IS_EXPLICIT_CURRENT_RESOLUTION',rule:'Every active player must have a progressive story from camp/offseason history into an explicit current Week 1 state. Direct post-camp evidence is authoritative when present. Otherwise a completed 166-player current sweep may resolve NO_NEW_MATERIAL_DEVELOPMENT without promoting camp evidence into current evidence.'};
ledger.transition_intelligence_schema={...(ledger.transition_intelligence_schema||{}),version:'1.5.0',chronological_context_mandatory:true,retroactive_camp_audit_mandatory:true,current_season_state_mandatory:true,progressive_story_mandatory:true,season_phase_config:report.season_phase.config,chronology_rule:report.chronological_context.rule};
write('analysis/transition-intelligence-current.json',report);write('guardrails/current-football-review.json',ledger);
if((report.rows||[]).some(r=>r.chronological_development?.camp_retroactive_audit?.required!==true))throw new Error('RETROACTIVE_CAMP_AUDIT_MISSING');
if((report.rows||[]).some(r=>r.chronological_development?.current_season_state?.required!==true))throw new Error('CURRENT_SEASON_STATE_REVIEW_MISSING');
if((report.rows||[]).some(r=>!r.chronological_development?.progressive_story?.current_resolution))throw new Error('PROGRESSIVE_STORY_MISSING');
if(synthesizedCurrentPlayers!==(report.rows||[]).length)throw new Error(`CURRENT_STATE_SYNTHESIS_INCOMPLETE ${synthesizedCurrentPlayers}/${(report.rows||[]).length}`);
console.log(JSON.stringify({result:'PASS',players:(report.rows||[]).length,players_with_timeline:chronologyPlayers,direct_post_camp_evidence_players:currentEvidencePlayers,synthesized_current_state_players:synthesizedCurrentPlayers,retroactive_camp_evidence_players:campEvidencePlayers,retroactive_camp_no_evidence_players:campNoEvidencePlayers,current_resolution_counts:resolutionCounts},null,2));
