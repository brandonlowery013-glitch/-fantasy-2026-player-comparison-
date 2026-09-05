import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(x,null,2)+'\n');};
const audit=read('analysis/full-overall-backwards-audit-current.json');
const transition=read('analysis/transition-intelligence-current.json');
const source=read('MODEL_SOURCE_OF_TRUTH.json');
const bindingInput=read('analysis/subject-binding-adjudication-input-2026-09-05.json');
const bindingDecisions=bindingInput.decisions||[];
const bindingMap=new Map(bindingDecisions.map(x=>[x.player,x]));
if(bindingMap.size!==bindingDecisions.length)throw new Error('duplicate subject-binding player decisions');
const transitionMap=new Map((transition.rows||[]).map(x=>[x.player,x]));
const pr186Changed=new Set(['Ashton Jeanty','Cam Skattebo','George Kittle','MarShawn Lloyd','Isiah Pacheco','Kaleb Johnson','Jonnu Smith']);
const stale=/\bCAMP\b|PRESEASON|ROSTER CUT/i;
const componentMap={
  readiness:['availability','weekly_reliability','production','ceiling'],
  availability_recovery:['availability','weekly_reliability','production','ceiling'],
  prior_season_injury_recovery:['availability','weekly_reliability','production','ceiling'],
  role_usage:['role_volume','production','ceiling','weekly_reliability'],
  competition:['role_volume','production','ceiling','weekly_reliability'],
  scheme_install:['offensive_environment','production','ceiling'],
  adaptation:['offensive_environment','production','ceiling'],
  chemistry:['offensive_environment','production','ceiling'],
  development:['role_volume','production','ceiling'],
  teammate_environment:['offensive_environment','production','ceiling']
};
const validDirectional=new Set(['POSITIVE','NEGATIVE','MIXED']);
const auditDirectional=new Set(['UP','DOWN']);
const canonicalStatusRefresh=r=>stale.test(String(r.status||''));
function catsFor(r){
  const tr=transitionMap.get(r.player);
  const basis=tr?.chronological_development?.current_season_state?.current_state_basis||r.current_season_basis||null;
  const raw=(basis?.categories?.length?basis.categories:basis?.dimensions)||[];
  return {basis,categories:[...raw],direction:basis?.direction||null};
}
function implicated(categories){return [...new Set(categories.flatMap(c=>componentMap[c]||[]))];}
function predatesOrOnSep5(basis){const t=Date.parse(basis?.published||'');return Number.isFinite(t)&&t<=Date.parse('2026-09-05T23:59:59Z');}

let rows=audit.rows.map(r=>{
  const {basis,categories,direction}=catsFor(r),prior=Boolean(r.previous_flag),statusRefresh=canonicalStatusRefresh(r),directional=validDirectional.has(direction)&&categories.length>0,components=implicated(categories),hasAuditDirectional=auditDirectional.has(r.review_direction);
  let final='HOLD',reason='Full 166-player backwards review found no unresolved material contradiction.',requiresQuant=false,overallReopen=false;
  if(r.placement_verdict==='EVIDENCE_COVERAGE_BLOCK'){
    final='EVIDENCE_BLOCKED';reason='Source coverage is incomplete; placement cannot be closed.';
  } else if(pr186Changed.has(r.player)&&directional&&predatesOrOnSep5(basis)){
    final='ACCOUNTED_BY_PR186';reason='Directional evidence falls within the Sep. 5 material-hold recalibration window and this player already received evidence-supported component adjudication in PR #186.';
  } else if(directional){
    final='REOPEN_COMPONENTS_PENDING_QUANT';requiresQuant=true;reason=`Player-owned current evidence is ${direction.toLowerCase()} and maps to ${components.join(', ')||'model components'}; numerical change requires the quantitative evidence pipeline.`;
  } else if(hasAuditDirectional){
    final='DIRECTIONAL_SIGNAL_NEEDS_SUBJECT_BINDING';reason=`The placement audit emitted ${r.review_direction}, but no player-owned current directional basis survived subject binding. This signal cannot be silently converted to HOLD.`;
  } else if(statusRefresh){
    final='STATUS_REFRESH_ONLY';reason='Placement evidence does not require a numerical move, but canonical status still contains closed camp/preseason wording.';
  } else if(prior){
    final='HOLD_AFTER_PRIOR_FLAG_REVIEW';reason='Previously flagged placement was explicitly re-audited across the repaired full-universe evidence set and no unresolved directional contradiction remains.';
  }
  return {...r,subject_bound_current_basis:basis,final_disposition:final,final_reason:reason,implicated_components:components,requires_quantitative_recalculation:requiresQuant,overall_reopen:overallReopen};
});

const currentDirectional=rows.filter(r=>auditDirectional.has(r.review_direction));
const currentDirectionalUncovered=currentDirectional.filter(r=>!bindingMap.has(r.player)).map(r=>r.player);
if(currentDirectionalUncovered.length)throw new Error(`current directional audit rows missing explicit subject-binding decisions: ${currentDirectionalUncovered.join(', ')}`);

const usedBinding=new Set();
rows=rows.map(r=>{
  const d=bindingMap.get(r.player);
  if(!d||!auditDirectional.has(r.review_direction))return r;
  usedBinding.add(r.player);
  const requiresQuant=d.disposition==='REOPEN_COMPONENTS_PENDING_QUANT';
  return {...r,binding_adjudication:d,final_disposition:d.disposition,final_reason:d.reason,implicated_components:d.components||[],requires_quantitative_recalculation:requiresQuant,overall_reopen:false};
});

const staleBindingDecisions=[...bindingMap.keys()].filter(x=>!usedBinding.has(x));
if(rows.length!==Number(source.active_player_model)||rows.length!==166)throw new Error(`adjudication coverage ${rows.length}/166`);
if(rows.some(x=>!x.final_disposition))throw new Error('Missing final disposition');
const unresolved=rows.filter(x=>x.final_disposition==='DIRECTIONAL_SIGNAL_NEEDS_SUBJECT_BINDING');
if(unresolved.length)throw new Error(`unresolved subject-binding signals remain: ${unresolved.map(x=>x.player).join(', ')}`);
const counts=rows.reduce((a,r)=>(a[r.final_disposition]=(a[r.final_disposition]||0)+1,a),{});
const componentReopens=rows.filter(r=>r.final_disposition==='REOPEN_COMPONENTS_PENDING_QUANT').map(r=>({player:r.player,overall_rank:r.overall_rank,position:r.position,direction:r.binding_adjudication?.direction||r.subject_bound_current_basis?.direction||r.review_direction||null,categories:r.subject_bound_current_basis?.categories||r.subject_bound_current_basis?.dimensions||[],implicated_components:r.implicated_components,headline:r.subject_bound_current_basis?.headline||r.camp_latest_basis?.headline||null,reason:r.final_reason}));
const rejectedBindings=rows.filter(r=>r.final_disposition==='HOLD_SUBJECT_BINDING_REJECTED').map(r=>({player:r.player,overall_rank:r.overall_rank,audit_direction:r.review_direction,reason:r.final_reason}));
const contextNoNumeric=rows.filter(r=>r.final_disposition==='HOLD_VALID_CONTEXT_NO_NUMERIC').map(r=>({player:r.player,overall_rank:r.overall_rank,audit_direction:r.review_direction,reason:r.final_reason}));
const accountedPrior=rows.filter(r=>r.final_disposition==='ACCOUNTED_PRIOR_ADJUDICATION').map(r=>({player:r.player,overall_rank:r.overall_rank,reason:r.final_reason}));
const statusRefreshes=rows.filter(r=>r.final_disposition==='STATUS_REFRESH_ONLY').map(r=>({player:r.player,overall_rank:r.overall_rank,status:r.status}));
const report={schema_version:'1.3.0',generated_at:new Date().toISOString(),season:source.season,universe:166,authority:'EXPLICIT_SUBJECT_BINDING_ADJUDICATION_NO_AUTOMATIC_NUMERIC_OR_RANK_MUTATION',coverage:{reviewed:rows.length,expected:166,complete:rows.length===166,order:'OVERALL_166_TO_1',subject_binding_decisions_total:bindingMap.size,subject_binding_decisions_used:usedBinding.size,subject_binding_decisions_stale:staleBindingDecisions.length,current_directional_rows:currentDirectional.length,current_directional_uncovered:currentDirectionalUncovered.length,subject_binding_unresolved:unresolved.length},policy:{prior_flags:'CLOSE AFTER EXPLICIT FULL-UNIVERSE READJUDICATION WHEN NO DIRECTIONAL CONTRADICTION REMAINS',status:'CLOSED CAMP/PRESEASON WORDING IS STATUS_REFRESH_ONLY UNLESS UNACCOUNTED DIRECTIONAL EVIDENCE EXISTS',components:'ONLY VERIFIED PLAYER-OWNED FOOTBALL EVIDENCE MAY REOPEN TRUE-VALUE COMPONENTS; NUMERIC DELTAS REQUIRE THE QUANTITATIVE PIPELINE',overall:'OVERALL RANK DOES NOT REOPEN UNTIL COMPONENT RECALCULATION OR A SEPARATE ACTIONABLE-RANK FOOTBALL RULE PRODUCES A VALID CHANGE',directional_fail_closed:'EVERY CURRENT UP/DOWN SIGNAL MUST HAVE AN EXPLICIT SUBJECT-BINDING DECISION. HISTORICAL DECISIONS THAT FALL OUT OF THE CURRENT DIRECTIONAL SET ARE RETAINED AS STALE AUDIT HISTORY, NOT TREATED AS FAILURES.'},counts,stale_binding_decisions:staleBindingDecisions,component_reopens:componentReopens,rejected_bindings:rejectedBindings,context_no_numeric:contextNoNumeric,accounted_prior:accountedPrior,status_refreshes:statusRefreshes,rows};
write('analysis/full-overall-backwards-adjudication-current.json',report);
const md=['# Full Overall Backwards Audit — Subject-Bound Adjudication','',`Coverage: ${rows.length}/166, Overall #166 → #1.`,`Current directional rows: ${currentDirectional.length}.`,`Explicit binding decisions used: ${usedBinding.size}/${bindingMap.size}.`,`Stale binding decisions retained as history: ${staleBindingDecisions.length}.`,`Unresolved subject-binding signals: ${unresolved.length}.`,`Component reopens pending quantitative evidence: ${componentReopens.length}.`,'', '| Overall | Player | Pos | Final disposition | Direction | Components |','|---:|---|---|---|---|---|'];for(const r of rows)md.push(`| ${r.overall_rank} | ${r.player.replace(/\|/g,'/')} | ${r.position} | ${r.final_disposition} | ${r.binding_adjudication?.direction||r.review_direction||r.subject_bound_current_basis?.direction||'NONE'} | ${r.implicated_components.join(', ')} |`);fs.writeFileSync(path.join(root,'analysis/full-overall-backwards-adjudication-current.md'),md.join('\n')+'\n');
console.log(JSON.stringify({result:'PASS',coverage:'166/166',counts,current_directional_rows:currentDirectional.length,subject_binding_decisions_total:bindingMap.size,subject_binding_decisions_used:usedBinding.size,stale_binding_decisions:staleBindingDecisions,subject_binding_unresolved:unresolved.length,component_reopens:componentReopens.map(x=>({player:x.player,direction:x.direction,components:x.implicated_components})),rejected_bindings:rejectedBindings.map(x=>x.player),context_no_numeric:contextNoNumeric.map(x=>x.player),accounted_prior:accountedPrior.map(x=>x.player),status_refreshes:statusRefreshes.map(x=>x.player)},null,2));
