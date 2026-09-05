import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(x,null,2)+'\n');};
const audit=read('analysis/full-overall-backwards-audit-current.json');
const transition=read('analysis/transition-intelligence-current.json');
const source=read('MODEL_SOURCE_OF_TRUTH.json');
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

const rows=audit.rows.map(r=>{
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
if(rows.length!==Number(source.active_player_model)||rows.length!==166)throw new Error(`adjudication coverage ${rows.length}/166`);
if(rows.some(x=>!x.final_disposition))throw new Error('Missing final disposition');
const counts=rows.reduce((a,r)=>(a[r.final_disposition]=(a[r.final_disposition]||0)+1,a),{});
const componentReopens=rows.filter(r=>r.final_disposition==='REOPEN_COMPONENTS_PENDING_QUANT').map(r=>({player:r.player,overall_rank:r.overall_rank,position:r.position,direction:r.subject_bound_current_basis?.direction||null,categories:r.subject_bound_current_basis?.categories||r.subject_bound_current_basis?.dimensions||[],implicated_components:r.implicated_components,headline:r.subject_bound_current_basis?.headline||null}));
const directionalBindingReview=rows.filter(r=>r.final_disposition==='DIRECTIONAL_SIGNAL_NEEDS_SUBJECT_BINDING').map(r=>({player:r.player,overall_rank:r.overall_rank,position:r.position,audit_direction:r.review_direction,status:r.status,camp_latest_basis:r.camp_latest_basis||null,current_season_basis:r.current_season_basis||null,reasons:r.reasons||[]}));
const statusRefreshes=rows.filter(r=>r.final_disposition==='STATUS_REFRESH_ONLY').map(r=>({player:r.player,overall_rank:r.overall_rank,status:r.status}));
const report={schema_version:'1.1.0',generated_at:new Date().toISOString(),season:source.season,universe:166,authority:'ADJUDICATION_ONLY_NO_AUTOMATIC_NUMERIC_OR_RANK_MUTATION',coverage:{reviewed:rows.length,expected:166,complete:rows.length===166,order:'OVERALL_166_TO_1'},policy:{prior_flags:'CLOSE AFTER EXPLICIT FULL-UNIVERSE READJUDICATION WHEN NO DIRECTIONAL CONTRADICTION REMAINS',status:'CLOSED CAMP/PRESEASON WORDING IS STATUS_REFRESH_ONLY UNLESS UNACCOUNTED DIRECTIONAL EVIDENCE EXISTS',components:'PLAYER-OWNED DIRECTIONAL EVIDENCE REOPENS ONLY IMPLICATED TRUE-VALUE COMPONENTS; NUMERIC DELTAS REQUIRE STRUCTURED QUANTITATIVE EVIDENCE',overall:'OVERALL RANK DOES NOT REOPEN UNTIL COMPONENT RECALCULATION OR A SEPARATE ACTIONABLE-RANK FOOTBALL RULE PRODUCES A VALID CHANGE',pr186:'SEP-5 EVIDENCE FOR THE SEVEN PR186-CHANGED PLAYERS IS MARKED ACCOUNTED, NOT DOUBLE-COUNTED',directional_fail_closed:'AN UP/DOWN PLACEMENT SIGNAL MAY NOT FALL THROUGH TO HOLD WHEN SUBJECT-BOUND CURRENT EVIDENCE IS ABSENT OR NON-DIRECTIONAL; IT MUST BE EXPLICITLY REBOUND OR DISMISSED AS CONTAMINATED.'},counts,component_reopens:componentReopens,directional_binding_review:directionalBindingReview,status_refreshes:statusRefreshes,rows};
write('analysis/full-overall-backwards-adjudication-current.json',report);
const md=['# Full Overall Backwards Audit — Adjudication','',`Coverage: ${rows.length}/166, Overall #166 → #1.`,`Component reopens pending quantitative evidence: ${componentReopens.length}`,`Directional signals requiring subject-binding review: ${directionalBindingReview.length}`,'', '| Overall | Player | Pos | Final disposition | Audit direction | Current direction | Components |','|---:|---|---|---|---|---|---|'];for(const r of rows)md.push(`| ${r.overall_rank} | ${r.player.replace(/\|/g,'/')} | ${r.position} | ${r.final_disposition} | ${r.review_direction||'NONE'} | ${r.subject_bound_current_basis?.direction||'NONE'} | ${r.implicated_components.join(', ')} |`);fs.writeFileSync(path.join(root,'analysis/full-overall-backwards-adjudication-current.md'),md.join('\n')+'\n');
console.log(JSON.stringify({result:'PASS',coverage:'166/166',counts,component_reopens:componentReopens.map(x=>x.player),directional_binding_review:directionalBindingReview.map(x=>x.player),status_refreshes:statusRefreshes.map(x=>x.player)},null,2));
