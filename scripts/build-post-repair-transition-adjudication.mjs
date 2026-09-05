import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(x,null,2)+'\n');};
const source=read('MODEL_SOURCE_OF_TRUTH.json');
const review=read('guardrails/current-football-review.json');
const applied=read('analysis/material-hold-canonical-apply-input-2026-09-05.json');
const extra=read('analysis/post-repair-transition-clear-no-change-2026-09-05.json');
const expected=Number(source.active_player_model),shards=Number(source.runtime_player_shards);
let players=[];for(let i=0;i<shards;i++)players.push(...read(`players${i}.json`));
if(players.length!==expected)throw new Error(`Universe mismatch ${players.length}/${expected}`);
if((review.players||[]).length!==expected)throw new Error(`Review mismatch ${(review.players||[]).length}/${expected}`);
if(review.review_scope!=='FULL_ACTIVE_UNIVERSE_PLUS_CONNECTED')throw new Error(`Unexpected review scope ${review.review_scope}`);

const byName=new Map(players.map(p=>[p.n,p]));
const byReview=new Map((review.players||[]).map(x=>[x.player,x]));
const evidenceFound=new Set((review.players||[]).filter(x=>x.transition_intelligence?.transition_signal==='EVIDENCE_FOUND').map(x=>x.player));
const appliedNumeric=new Map((applied.rows||[]).map(x=>[x.player,x]));
const priorZero=new Set(applied.zero_delta_resolutions||[]);
const extraZero=new Map((extra.rows||[]).map(x=>[x.player,x]));
const resolved=new Set([...appliedNumeric.keys(),...priorZero,...extraZero.keys()]);
const unresolved=[...evidenceFound].filter(x=>!resolved.has(x)).sort();
if(unresolved.length){
  const diagnostics=unresolved.map(name=>{const x=byReview.get(name)||{},ti=x.transition_intelligence||{};return{player:name,trajectory:ti.chronological_development?.overall_trajectory||null,current_season_status:ti.chronological_development?.current_season_state?.status||null,evidence:(ti.evidence||[]).slice(0,5).map(e=>({published:e.published||null,headline:e.headline||null,description:e.description||null,matched_context:e.matched_context||null,url:e.url||null})),chronology:(ti.chronological_development?.events||[]).slice(-6).map(e=>({published:e.published||null,headline:e.headline||null,description:e.description||null,matched_context:e.matched_context||null,url:e.url||null}))};});
  console.log('UNRESOLVED_DIAGNOSTICS='+JSON.stringify(diagnostics,null,2));
  throw new Error(`UNRESOLVED_TRANSITION_EVIDENCE: ${unresolved.join(', ')}`);
}

const weights={pd:.35,ce:.20,r:.15,e:.10,a:.10,rl:.05,su:.05};
const weighted=p=>Object.entries(weights).reduce((s,[k,w])=>s+Number(p[k])*w,0);
const scoreBaselineVariance=[];
const integrityErrors=[];
for(const p of players){
  const calc=weighted(p),stored=Number(p.s),delta=Number((stored-calc).toFixed(6));
  if(!Number.isFinite(calc)||!Number.isFinite(stored))integrityErrors.push({player:p.n,status:'NONFINITE_SCORE_OR_COMPONENT'});
  else if(Math.abs(delta)>.001)scoreBaselineVariance.push({player:p.n,stored_score:stored,weighted_component_recompute:Number(calc.toFixed(6)),baseline_variance:delta,classification:'INFORMATIONAL_CALIBRATED_BASELINE_VARIANCE'});
}
if(integrityErrors.length)throw new Error(`Score integrity errors: ${integrityErrors.map(x=>x.player).join(', ')}`);

const changedChecks=[];
for(const [name,row] of appliedNumeric){
  const p=byName.get(name);if(!p)throw new Error(`Applied player missing: ${name}`);
  const mismatches=[];
  for(const [k,v] of Object.entries(row.component_targets||{}))if(Number(p[k])!==Number(v))mismatches.push(`${k}:${p[k]}!=${v}`);
  const expectedScore=Number((Number(row.expected_current_score)+Number(row.score_delta)).toFixed(6));
  if(Math.abs(Number(p.s)-expectedScore)>.000001)mismatches.push(`s:${p.s}!=${expectedScore}`);
  changedChecks.push({player:name,status:mismatches.length?'MISMATCH':'MATCH',mismatches});
}
const badChanged=changedChecks.filter(x=>x.status!=='MATCH');
if(badChanged.length)throw new Error(`Canonical applied-change mismatch: ${badChanged.map(x=>x.player).join(', ')}`);

const rows=[];
for(const x of review.players||[]){
  const ti=x.transition_intelligence||{};
  const signal=ti.transition_signal||'REVIEWED_NO_EVIDENCE';
  let adjudication='NO_TRANSITION_ACTION';
  let basis='NO_VALIDATED_TRANSITION_EVIDENCE';
  if(evidenceFound.has(x.player)){
    if(appliedNumeric.has(x.player)){adjudication='ALREADY_APPLIED_NUMERIC_CHANGE';basis='SEP5_USER_APPROVED_QUANTITATIVE_APPLY';}
    else if(priorZero.has(x.player)){adjudication='RESOLVED_ZERO_DELTA';basis='SEP5_USER_APPROVED_ZERO_DELTA';}
    else if(extraZero.has(x.player)){adjudication='RESOLVED_ZERO_DELTA';basis='POST_REPAIR_EXPLICIT_CLEAR_NO_CHANGE';}
  }
  rows.push({player:x.player,transition_signal:signal,trajectory:ti.chronological_development?.overall_trajectory||null,current_season_status:ti.chronological_development?.current_season_state?.status||null,adjudication,basis,canonical_score:byName.get(x.player)?.s??null,true_value_rank:byName.get(x.player)?.tr??null,overall_rank:byName.get(x.player)?.o??null});
}

const counts={
  players:expected,
  transition_evidence_found:evidenceFound.size,
  transition_no_evidence:expected-evidenceFound.size,
  already_applied_numeric:[...evidenceFound].filter(x=>appliedNumeric.has(x)).length,
  resolved_zero_delta_prior:[...evidenceFound].filter(x=>priorZero.has(x)).length,
  resolved_zero_delta_post_repair:[...evidenceFound].filter(x=>extraZero.has(x)).length,
  unresolved_transition_evidence:unresolved.length,
  raw_article_presence_not_authoritative:true,
  calibrated_score_baseline_variances:scoreBaselineVariance.length,
  actual_score_integrity_errors:integrityErrors.length,
  canonical_writes:false
};
if(counts.already_applied_numeric+counts.resolved_zero_delta_prior+counts.resolved_zero_delta_post_repair!==counts.transition_evidence_found)throw new Error('Resolved transition count does not equal evidence-found count');

const report={schema_version:'1.0.0',generated_at:new Date().toISOString(),authoritative:true,mutation_policy:'AUDIT_ONLY_NO_CANONICAL_WRITES',scoring_policy:'CURRENT_CALIBRATED_SCORE_IS_AUTHORITATIVE_BASELINE; WEIGHTED COMPONENT RECOMPUTE IS INFORMATIONAL UNLESS A GOVERNED FULL-REBASE IS EXPLICITLY APPROVED',trigger_policy:'TRANSITION_INTELLIGENCE.EVIDENCE_FOUND PLUS EXPLICIT ADJUDICATION; RAW MATERIAL_NEWS_SIGNAL PRESENCE ALONE IS NOT A RANK TRIGGER',universe:{players:expected,shards},counts,applied_numeric_checks:changedChecks,score_baseline_variance:scoreBaselineVariance,rows};
write('analysis/post-repair-transition-adjudication-current.json',report);
const md=['# Post-Repair Transition Adjudication','',`Generated: ${report.generated_at}`,`Universe: ${expected}`,`Validated transition evidence: ${counts.transition_evidence_found}`,`Already-applied numeric changes: ${counts.already_applied_numeric}`,`Prior zero-delta resolutions: ${counts.resolved_zero_delta_prior}`,`Post-repair zero-delta resolutions: ${counts.resolved_zero_delta_post_repair}`,`Unresolved transition evidence: ${counts.unresolved_transition_evidence}`,`Calibrated score-baseline variances: ${counts.calibrated_score_baseline_variances}`,`Actual score-integrity errors: ${counts.actual_score_integrity_errors}`,'','The previous 117 raw blocked rows are not authoritative adjudications because raw material-news presence is not itself a validated transition trigger. The repaired transition layer is the evidence gate.',''];
for(const r of rows.filter(x=>x.transition_signal==='EVIDENCE_FOUND'))md.push(`- ${r.player}: ${r.adjudication} (${r.basis})`);
fs.writeFileSync(path.join(root,'analysis/post-repair-transition-adjudication-current.md'),md.join('\n')+'\n');
console.log(JSON.stringify(counts,null,2));
