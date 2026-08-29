import fs from 'node:fs';

const shardFiles=fs.readdirSync('.').filter(f=>/^players\d+\.json$/.test(f)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
const players=shardFiles.flatMap(f=>JSON.parse(fs.readFileSync(f,'utf8')));
const names=players.map(p=>p.n);
const unique=new Set(names);
const projectionAudit=JSON.parse(fs.readFileSync('projection-context-audit-2026.json','utf8'));
const downstreamAudit=JSON.parse(fs.readFileSync('projection-downstream-audit.json','utf8'));
const decisions=JSON.parse(fs.readFileSync('overall-rank-audit-decisions.json','utf8'));
const overallWorkflow=fs.readFileSync('.github/workflows/apply-overall-audit-and-cohesion.yml','utf8');
const recalibrateWorkflow=fs.readFileSync('.github/workflows/recalibrate-projections.yml','utf8');
const propagateWorkflow=fs.readFileSync('.github/workflows/propagate-projection-recalibration.yml','utf8');
const final162Workflow=fs.readFileSync('.github/workflows/final-162-qa-publish.yml','utf8');

const blockers=[];
const findings=[];
const add=(severity,id,detail)=>{findings.push({severity,id,detail});if(severity==='BLOCKER')blockers.push(id)};

if(players.length!==162)add('BLOCKER','ACTIVE_UNIVERSE_NOT_162',`player shards contain ${players.length}`);
else add('PASS','ACTIVE_UNIVERSE_162','player shards contain exactly 162 active players');
if(unique.size!==players.length)add('BLOCKER','DUPLICATE_PLAYER_IDENTITIES',`${players.length-unique.size} duplicate normalized names`);
else add('PASS','UNIQUE_IDENTITIES_162','all 162 player names are unique');

if(projectionAudit.players_checked!==players.length)add('BLOCKER','STALE_PROJECTION_CONTEXT_AUDIT',`projection-context audit checked ${projectionAudit.players_checked}, active universe is ${players.length}`);
else add('PASS','PROJECTION_CONTEXT_CURRENT',`projection-context audit matches ${players.length}`);
if(downstreamAudit.players_checked!==players.length)add('BLOCKER','STALE_PROJECTION_DOWNSTREAM_AUDIT',`projection-downstream audit checked ${downstreamAudit.players_checked}, active universe is ${players.length}`);
else add('PASS','PROJECTION_DOWNSTREAM_CURRENT',`projection-downstream audit matches ${players.length}`);

const hardcoded153=/expected 153 players|len\(players\)==153|range\(1,154\)|1-153|len\(can_by\)!=153|players_checked.?[:=].?153/i.test(overallWorkflow);
if(hardcoded153)add('BLOCKER','OVERALL_APPLY_HARDCODED_153','apply-overall-audit-and-cohesion.yml still contains executable 153-era count/rank assertions');
else add('PASS','OVERALL_APPLY_COUNT_SAFE','overall apply workflow has no executable 153-era count/rank assertions');

if(decisions.decisions?.length===37)add('INFO','OVERALL_DECISIONS_153_ERA','overall-rank-audit-decisions.json contains the 37-decision Aug 23 audit and must not be treated as a fresh 162-player review');
else add('INFO','OVERALL_DECISION_COUNT',`overall decision file contains ${decisions.decisions?.length??0} decisions`);

const recalDynamic=/filter\(f=>\/\^players\\d\+\\\.json\$\//.test(recalibrateWorkflow)&&/total\+\+/.test(recalibrateWorkflow);
add(recalDynamic?'PASS':'BLOCKER','RECALIBRATION_COUNT_DYNAMIC',recalDynamic?'recalibration discovers player shards dynamically':'recalibration is not proven count-dynamic');
const propDynamic=/filter\(f=>\/\^players\\d\+\\\.json\$\//.test(propagateWorkflow)&&/players_checked:all\.length/.test(propagateWorkflow);
add(propDynamic?'PASS':'BLOCKER','PROPAGATION_COUNT_DYNAMIC',propDynamic?'downstream propagation discovers player shards dynamically':'propagation is not proven count-dynamic');
const final162=/len\(parts\)!=162/.test(final162Workflow)&&/range\(1,163\)/.test(final162Workflow);
add(final162?'PASS':'BLOCKER','FINAL_162_GUARD_PRESENT',final162?'final cross-board workflow explicitly guards 162 players and ranks 1-162':'final 162 guard not found');

const report={
  generated_at:new Date().toISOString(),
  step:'STEP_3B_2_UNIVERSE_RECONCILIATION',
  status:blockers.length?'BLOCKED_RECONCILIATION_REQUIRED':'PASS',
  active_players:players.length,
  unique_players:unique.size,
  shard_files:shardFiles.length,
  stale_artifacts:{
    projection_context_players_checked:projectionAudit.players_checked,
    projection_downstream_players_checked:downstreamAudit.players_checked,
    overall_decisions_as_of:decisions.as_of??null,
    overall_decisions_count:decisions.decisions?.length??0
  },
  blockers,
  findings,
  next_required_actions:[
    'Make the Overall audit/apply path universe-size safe and prevent 153-era decisions from applying to a 162-player board.',
    'Run a fresh full-universe historical recalibration in shadow mode across all 162 players.',
    'Regenerate projection-context-audit-2026.json and projection-downstream-audit.json with players_checked=162.',
    'Generate a new 162-player Overall review queue; do not reuse the Aug 23 153-era decision set as current approval evidence.'
  ]
};
fs.mkdirSync('guardrails',{recursive:true});
fs.writeFileSync('guardrails/step3b-universe-reconciliation-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(players.length!==162||unique.size!==162)process.exit(1);
