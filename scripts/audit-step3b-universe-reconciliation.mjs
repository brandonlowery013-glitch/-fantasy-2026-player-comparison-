import fs from 'node:fs';

const shardFiles=fs.readdirSync('.').filter(f=>/^players\d+\.json$/.test(f)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
const players=shardFiles.flatMap(f=>JSON.parse(fs.readFileSync(f,'utf8')));
const unique=new Set(players.map(p=>p.n));
const legacyProjection=JSON.parse(fs.readFileSync('projection-context-audit-2026.json','utf8'));
const legacyDownstream=JSON.parse(fs.readFileSync('projection-downstream-audit.json','utf8'));
const decisions=JSON.parse(fs.readFileSync('overall-rank-audit-decisions.json','utf8'));
const shadowProjection=JSON.parse(fs.readFileSync('guardrails/step3b-shadow-projection-context-163.json','utf8'));
const shadowDownstream=JSON.parse(fs.readFileSync('guardrails/step3b-shadow-projection-downstream-163.json','utf8'));
const shadowReview=JSON.parse(fs.readFileSync('guardrails/step3b-shadow-overall-review-queue-163.json','utf8'));
const overallWorkflow=fs.readFileSync('.github/workflows/apply-overall-audit-and-cohesion.yml','utf8');
const recalibrateWorkflow=fs.readFileSync('.github/workflows/recalibrate-projections.yml','utf8');
const propagateWorkflow=fs.readFileSync('.github/workflows/propagate-projection-recalibration.yml','utf8');
const finalQaWorkflow=fs.readFileSync('.github/workflows/final-162-qa-publish.yml','utf8');

const blockers=[]; const findings=[];
const add=(severity,id,detail)=>{findings.push({severity,id,detail});if(severity==='BLOCKER')blockers.push(id)};
add(players.length===163?'PASS':'BLOCKER','ACTIVE_UNIVERSE_163',`player shards contain ${players.length} active players`);
add(unique.size===163?'PASS':'BLOCKER','UNIQUE_IDENTITIES_163',`${unique.size} unique player names`);

if(legacyProjection.players_checked!==163)add('INFO','LEGACY_PROJECTION_AUDIT_PRE_163',`legacy saved projection audit checked ${legacyProjection.players_checked}; retained as historical artifact, not current 163 evidence`);
if(legacyDownstream.players_checked!==163)add('INFO','LEGACY_DOWNSTREAM_AUDIT_PRE_163',`legacy saved downstream audit checked ${legacyDownstream.players_checked}; retained as historical artifact, not current 163 evidence`);

add(shadowProjection.players_checked===163&&shadowProjection.shadow_only===true&&shadowProjection.live_player_files_modified===false?'PASS':'BLOCKER','SHADOW_PROJECTION_163','fresh shadow projection audit must cover all 163 and make no live mutations');
add(shadowDownstream.players_checked===163&&shadowDownstream.shadow_only===true&&shadowDownstream.live_player_files_modified===false?'PASS':'BLOCKER','SHADOW_DOWNSTREAM_163','fresh shadow downstream audit must cover all 163 and make no live mutations');
add(shadowReview.players_checked===163&&shadowReview.shadow_only===true&&shadowReview.published===false?'PASS':'BLOCKER','SHADOW_REVIEW_QUEUE_163','fresh 163 Overall review queue exists and remains unpublished');

const hardcoded153=/expected 153 players|len\(players\)==153|range\(1,154\)|1-153|len\(can_by\)!=153|players_checked.?[:=].?153/i.test(overallWorkflow);
add(!hardcoded153?'PASS':'BLOCKER','OVERALL_APPLY_COUNT_SAFE',!hardcoded153?'Overall apply path has no executable 153-era count/rank assertions':'Overall apply path still contains executable 153-era assumptions');
const universeGate=/decision_universe\s*!=\s*player_count/.test(overallWorkflow)&&/approval_status\s*!=\s*'APPROVED_FOR_APPLY'/.test(overallWorkflow);
add(universeGate?'PASS':'BLOCKER','OVERALL_APPLY_REVIEW_GATE',universeGate?'Overall apply refuses mismatched universe and lacks-approval decision files':'Overall apply does not prove universe/review gating');

if(decisions.universe_size!==163||decisions.approval_status!=='APPROVED_FOR_APPLY')add('PASS','OLD_DECISIONS_BLOCKED','pre-163 decision set lacks fresh 163 approval metadata and is therefore blocked from application');
else add('BLOCKER','OLD_DECISIONS_UNEXPECTEDLY_APPLYABLE','old decision file appears applyable without a new review');

const recalDynamic=/filter\(f=>\/\^players\\d\+\\\.json\$\//.test(recalibrateWorkflow)&&/total\+\+/.test(recalibrateWorkflow);
add(recalDynamic?'PASS':'BLOCKER','RECALIBRATION_COUNT_DYNAMIC',recalDynamic?'legacy recalibration discovers shards dynamically':'legacy recalibration is not proven count-dynamic');
const propDynamic=/filter\(f=>\/\^players\\d\+\\\.json\$\//.test(propagateWorkflow)&&/players_checked:all\.length/.test(propagateWorkflow);
add(propDynamic?'PASS':'BLOCKER','PROPAGATION_COUNT_DYNAMIC',propDynamic?'legacy downstream propagation discovers shards dynamically':'legacy propagation is not proven count-dynamic');
const final163=/len\(parts\)!=163/.test(finalQaWorkflow)&&/range\(1,164\)/.test(finalQaWorkflow)&&/length:14/.test(finalQaWorkflow);
add(final163?'PASS':'BLOCKER','FINAL_163_GUARD_PRESENT',final163?'final cross-board workflow explicitly guards 163 players, ranks 1-163 and 14 shards':'final 163 guard not found');

const report={
  generated_at:new Date().toISOString(),step:'STEP_3B_2_UNIVERSE_RECONCILIATION',status:blockers.length?'BLOCKED_RECONCILIATION_REQUIRED':'PASS',
  active_players:players.length,unique_players:unique.size,shard_files:shardFiles.length,
  legacy_pre_163_artifacts_retained_as_history:{projection_context_players_checked:legacyProjection.players_checked,projection_downstream_players_checked:legacyDownstream.players_checked,overall_decisions_as_of:decisions.as_of??null,overall_decisions_count:decisions.decisions?.length??0},
  current_shadow_evidence:{projection_players_checked:shadowProjection.players_checked,direct_history:shadowProjection.players_with_direct_history,no_direct_history:shadowProjection.players_without_direct_history,downstream_players_checked:shadowDownstream.players_checked,material_changes:shadowDownstream.material_changes,overall_review_count:shadowDownstream.overall_rank_review_count},
  blockers,findings,
  next_required_actions:blockers.length?['Resolve reconciliation blockers before model promotion.']:['Use the reconciled 163-player shadow baseline to continue Step 3B Bayesian validation.','Do not publish any proposed rank or projection movement before the user review gate.']
};
fs.mkdirSync('guardrails',{recursive:true});
fs.writeFileSync('guardrails/step3b-universe-reconciliation-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blockers.length)process.exit(1);
