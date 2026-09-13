import fs from 'node:fs';

const c=JSON.parse(fs.readFileSync('data/sources/weekly-production-orchestration-2026.json','utf8'));
const step24=fs.readFileSync('.github/workflows/step24-weekly-production-orchestration.yml','utf8');
const liveNews=fs.readFileSync('.github/workflows/live-news-model-ingestion.yml','utf8');
const handoff=fs.readFileSync('scripts/merge-guarded-production-pr.sh','utf8');
const blocked=[];
const expected=['SOURCE_INGESTION','WEEKLY_PLAYER_MODEL','FORECAST_FREEZE','GAME_PROJECTIONS','MARKET_CAPTURE','MARKET_RECOMMENDATIONS','OPPORTUNITY_RANKING','POSTGAME_SETTLEMENT','LIVE_MARKET_CALIBRATION','CALIBRATION_GOVERNANCE','PIPELINE_HEALTH','REAL_SEASON_VALIDATION','ATOMIC_PERSIST'];
const has=(text,needle,label)=>{if(!text.includes(needle))blocked.push(label||`missing invariant: ${needle}`);};

if(c.season!==2026)blocked.push('season must be 2026');
if(c.status!=='STEP_24_WEEKLY_PRODUCTION_ORCHESTRATION_LOCKED')blocked.push('Step 24 status not locked');
if(c.mode!=='SHADOW_ONLY'||c.actionable!==false)blocked.push('Step 24 must remain SHADOW_ONLY/non-actionable');
if(JSON.stringify(c.ordered_stages)!==JSON.stringify(expected))blocked.push('ordered stage contract drift');
if(c.schedule?.concurrency_group!=='weekly-production-orchestration'||c.schedule?.cancel_in_progress!==false)blocked.push('global anti-race concurrency contract missing');
if(c.failure_policy?.dependency_failure_blocks_downstream!==true)blocked.push('dependency hard-fail policy missing');
if(c.failure_policy?.one_atomic_repository_commit_per_orchestrator_run!==true)blocked.push('atomic persist policy missing');
const rules=(c.locked_rules||[]).join(' ');
for(const needle of ['only autonomous production scheduler','Missing data remains missing','Sportsbook data remains downstream','cannot auto-promote','No automatic wagering'])if(!rules.includes(needle))blocked.push(`missing safeguard: ${needle}`);

// Validate Step 24's production semantics, not the historical location of shell commands.
has(step24,'Stage 1 - verify football context readiness','explicit football context readiness gate missing');
has(step24,'id: context','football context readiness output missing');
has(step24,"if: steps.context.outputs.ready == 'true'",'downstream projection/market stages are not gated by football context');
has(step24,'Verified schedule exists, but explicit current player availability context is not ready.','context waiting path is not explicit');
if((step24.match(/git commit -m/g)||[]).length!==1)blocked.push('atomic single commit invariant drift');
if(step24.includes('git push origin HEAD:main'))blocked.push('production must not push directly to protected main');
for(const needle of ['pull-requests: write','checks: read','statuses: read','actions: write','gh pr create','scripts/merge-guarded-production-pr.sh'])has(step24,needle,`Step 24 protected persistence invariant missing: ${needle}`);
has(step24,'production/state-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}','production state branch must be unique per run');

// Both production writers must use the same protected handoff so one stream cannot drift to a weaker implementation.
for(const needle of ['pull-requests: write','checks: read','statuses: read','actions: write','gh pr create','scripts/merge-guarded-production-pr.sh'])has(liveNews,needle,`Live News protected persistence invariant missing: ${needle}`);
has(liveNews,'production/live-news-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}','live-news production branch must be unique per run');
if(liveNews.includes('git push origin HEAD:main'))blocked.push('Live News must not push directly to protected main');
for(const [label,text] of [['Step 24',step24],['Live News',liveNews]]){
  has(text,'group: production-main-writer',`${label} must participate in serialized production-main-writer concurrency`);
}

// Shared handoff contract: exact protected candidate, exact required check/status, current-main freshness,
// refresh-and-revalidate when main moves, and normal protected merge with no administrative bypass.
for(const needle of [
  'guardrail-qa.yml',
  'workflow run',
  'merge_commit_sha',
  '.head.sha',
  'context == "guardrail-qa"',
  'check-runs?check_name=guardrail-qa',
  'REQUIRED_CHECK_APP_ID',
  'git merge-base --is-ancestor',
  'git merge --no-edit origin/main',
  "last_dispatched_merge_sha=''",
  '--match-head-commit',
  'gh pr merge'
])has(handoff,needle,`shared protected handoff invariant missing: ${needle}`);
for(const needle of ['HEAD_STATUS','MERGE_STATUS','HEAD_CHECK','MERGE_CHECK'])has(handoff,needle,`exact-candidate Guardrail evidence missing: ${needle}`);
if(!handoff.includes("[ \"$HEAD_STATUS\" = 'success' ]")||!handoff.includes("[ \"$MERGE_STATUS\" = 'success' ]")||!handoff.includes("[ \"$HEAD_CHECK\" = 'success' ]")||!handoff.includes("[ \"$MERGE_CHECK\" = 'success' ]"))blocked.push('shared handoff must require Guardrail success on both PR head and protected synthetic merge');
if(/gh\s+pr\s+merge[^\n]*--admin/.test(handoff)||handoff.includes('--bypass'))blocked.push('shared handoff contains a protection-bypass option');
if(/git\s+push[^\n]*(?:HEAD:main|origin\s+main)/.test(handoff))blocked.push('shared handoff must never push directly to protected main');
if(!handoff.includes('refusing to force or bypass protection'))blocked.push('shared handoff must fail closed on refresh conflict');

const report={
  generated_at:new Date().toISOString(),
  result:blocked.length?'BLOCKED':'PASS',
  status:c.status,
  ordered_stages:c.ordered_stages,
  concurrency_group:c.schedule?.concurrency_group,
  context_gate:true,
  persistence:'SHARED_EXACT_CANDIDATE_GUARDRAIL_PROTECTED_MERGE',
  production_streams:['Step 24 Weekly Production Orchestration','Live News Model Ingestion'],
  blocked
};
fs.mkdirSync('guardrails',{recursive:true});
fs.writeFileSync('guardrails/weekly-production-orchestration-contract-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);
