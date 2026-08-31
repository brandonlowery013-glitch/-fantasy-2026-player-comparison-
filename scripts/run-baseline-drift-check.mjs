import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const gitJson=(ref,p)=>JSON.parse(execFileSync('git',['show',`${ref}:${p}`],{encoding:'utf8'}));
const exists=p=>fs.existsSync(path.join(root,p));
const baseline=read('guardrails/baselines/pre-ev-baseline-2026-08-24.json');
const cfg=read('guardrails/guardrails-config.json');
const mainRef='origin/main';
const mainHead=execFileSync('git',['rev-parse',mainRef],{encoding:'utf8'}).trim();
const checkpointFile='guardrails/universe-migration-checkpoints.json';
const checkpoints=exists(checkpointFile)?read(checkpointFile):null;
const checkpoint=checkpoints?.active_checkpoint?.status==='CONSUMED'?checkpoints.active_checkpoint:null;
const historicalAnchor=checkpoint?.commit||baseline.baseline_commit;

function assertAncestor(ancestor,descendant){
  try{execFileSync('git',['merge-base','--is-ancestor',ancestor,descendant],{stdio:'ignore'});return true;}catch{return false;}
}
const anchorErrors=[];
if(checkpoint){
  if(!assertAncestor(historicalAnchor,mainRef))anchorErrors.push({error:'CONSUMED_CHECKPOINT_NOT_ANCESTOR_OF_MAIN',checkpoint:historicalAnchor,main:mainHead});
  const cpCfg=gitJson(historicalAnchor,'guardrails/guardrails-config.json');
  if(Number(cpCfg.authoritative_player_count)!==Number(checkpoint.player_count))anchorErrors.push({error:'CHECKPOINT_PLAYER_COUNT_MISMATCH',checkpoint:checkpoint.player_count,commit_contract:cpCfg.authoritative_player_count});
  if(Number(cpCfg.authoritative_player_shards)!==Number(checkpoint.player_shards))anchorErrors.push({error:'CHECKPOINT_SHARD_COUNT_MISMATCH',checkpoint:checkpoint.player_shards,commit_contract:cpCfg.authoritative_player_shards});
}

const changeManifest=read(cfg.drift.change_manifest_file);
const declared=new Map((changeManifest.changes||[]).map(x=>[x.player,x]));
const structuralManifestFile='guardrails/structural-change-manifest.json';
const structuralManifest=read(structuralManifestFile);
const declaredStructural=new Map((structuralManifest.changes||[]).map(x=>[x.file,x]));
const universeManifestFile=cfg.drift.universe_change_manifest_file||'guardrails/universe-change-manifest.json';
const universeManifest=read(universeManifestFile);
const historicalUniverseChanges=(universeManifest.changes||[]).filter(x=>x&&x.player&&x.action&&x.reason&&x.source);
const historicalModelChanges=(universeManifest.model_changes||[]).filter(x=>x&&x.player&&x.reason&&x.source&&x.expected_values);
const historicalAdmissionUpdates=(universeManifest.admission_updates||[]).filter(x=>x&&x.player&&x.reason&&x.source&&x.expected_values);

// A consumed migration is historical evidence, not a standing authorization for a future PR.
// Only an unconsumed manifest may authorize a current population/core delta.
const universeChanges=checkpoint?[]:historicalUniverseChanges;
const modelChanges=checkpoint?[]:historicalModelChanges;
const admissionUpdates=checkpoint?[]:historicalAdmissionUpdates;
const declaredAdds=new Set(universeChanges.filter(x=>x.action==='ADD').map(x=>x.player));
const declaredRemoves=new Set(universeChanges.filter(x=>x.action==='REMOVE').map(x=>x.player));
const declaredCurrentChanges=[...modelChanges,...admissionUpdates];

const coreFields=['o','tr','tp','pr','s','pd','ce','r','e','a','rl','su','mp'];
const scalarCoreFields=['s','pd','ce','r','e','a','rl','su','mp'];
const patchFile='current162patch-2026-08-24.json';
const applyOverlay=(rows,patch)=>rows.map(p=>({...p,...(patch.players?.[p.n]||{})}));
function loadShardsFromGit(ref,count){let rows=[];for(let i=0;i<count;i++)rows.push(...gitJson(ref,`players${i}.json`));return rows;}
function loadShardsFromWorktree(count){let rows=[];for(let i=0;i<count;i++)rows.push(...read(`players${i}.json`));return rows;}
function overlayAt(refOrNull,rows){let patch={players:{}};try{patch=refOrNull?gitJson(refOrNull,patchFile):read(patchFile);}catch{}return applyOverlay(rows,patch);}

const anchorCfg=gitJson(historicalAnchor,'guardrails/guardrails-config.json');
const mainCfg=gitJson(mainRef,'guardrails/guardrails-config.json');
const anchorPlayers=overlayAt(historicalAnchor,loadShardsFromGit(historicalAnchor,anchorCfg.authoritative_player_shards));
const mainPlayers=overlayAt(mainRef,loadShardsFromGit(mainRef,mainCfg.authoritative_player_shards));
const currentPlayers=overlayAt(null,loadShardsFromWorktree(cfg.authoritative_player_shards));
const anchorMap=new Map(anchorPlayers.map(p=>[p.n,p]));
const mainMap=new Map(mainPlayers.map(p=>[p.n,p]));
const currentMap=new Map(currentPlayers.map(p=>[p.n,p]));

const declarationCovers=(name,fields)=>{const d=declared.get(name);const set=new Set(Array.isArray(d?.changed_fields)?d.changed_fields:[]);return !!(d&&d.reason&&d.source&&fields.every(f=>set.has(f)));};
const structuralDeclarationCovers=file=>{const d=declaredStructural.get(file);return !!(d&&d.reason&&d.source);};

// Phase 1: immutable consumed checkpoint -> current main. Historical migration work before
// the checkpoint was already guardrail-approved; only changes after it need fresh declarations.
const anchorToMainChanges=[];const unauthorizedAnchorToMain=[];
for(const [name,p] of mainMap){
  const old=anchorMap.get(name);if(!old)continue;const changed=[];
  for(const f of coreFields)if(JSON.stringify(old[f]??null)!==JSON.stringify(p[f]??null))changed.push({field:f,before:old[f]??null,after:p[f]??null});
  if(changed.length){const item={player:name,changed_fields:changed};anchorToMainChanges.push(item);if(!declarationCovers(name,changed.map(x=>x.field)))unauthorizedAnchorToMain.push(item);}
}
const anchorAddedToMain=[...mainMap.keys()].filter(n=>!anchorMap.has(n));
const anchorRemovedFromMain=[...anchorMap.keys()].filter(n=>!mainMap.has(n));
if(anchorAddedToMain.length||anchorRemovedFromMain.length)anchorErrors.push({error:'UNDECLARED_MAIN_POPULATION_CHANGE_AFTER_CHECKPOINT',added:anchorAddedToMain,removed:anchorRemovedFromMain});

// Phase 2: current PR population must match current main unless a NEW, active universe manifest declares it.
const added=[...currentMap.keys()].filter(n=>!mainMap.has(n));
const removed=[...mainMap.keys()].filter(n=>!currentMap.has(n));
const undeclaredAdded=added.filter(n=>!declaredAdds.has(n));
const undeclaredRemoved=removed.filter(n=>!declaredRemoves.has(n));
const staleDeclaredAdds=checkpoint?[]:[...declaredAdds].filter(n=>!added.includes(n));
const staleDeclaredRemoves=checkpoint?[]:[...declaredRemoves].filter(n=>!removed.includes(n));
const populationDeclarationErrors=[];
for(const d of universeChanges){
  if(d.from_count!=null&&d.from_count!==mainPlayers.length)populationDeclarationErrors.push({player:d.player,error:'FROM_COUNT_MISMATCH',declared:d.from_count,actual:mainPlayers.length});
  if(d.to_count!=null&&d.to_count!==currentPlayers.length)populationDeclarationErrors.push({player:d.player,error:'TO_COUNT_MISMATCH',declared:d.to_count,actual:currentPlayers.length});
}
if(cfg.authoritative_player_count!==currentPlayers.length)populationDeclarationErrors.push({error:'CONFIG_CURRENT_COUNT_MISMATCH',declared:cfg.authoritative_player_count,actual:currentPlayers.length});
if(checkpoint&&currentPlayers.length!==Number(checkpoint.player_count))populationDeclarationErrors.push({error:'CURRENT_COUNT_DIFFERS_FROM_CONSUMED_CHECKPOINT',checkpoint:checkpoint.player_count,current:currentPlayers.length});

// Start expected PR state from CURRENT MAIN, not the old frozen universe.
const expected=new Map(mainPlayers.map(p=>[p.n,{...p}]));
const admissionDeclarations=universeChanges.filter(x=>x.action==='ADD');
for(const d of admissionDeclarations){
  const a=currentMap.get(d.player);
  if(!a){populationDeclarationErrors.push({player:d.player,error:'DECLARED_ADMISSION_MISSING_FROM_CURRENT'});continue;}
  expected.set(d.player,{...a});
}
function applyAdmissionRankLayout(field,manifestField){
  if(!admissionDeclarations.length)return;
  const targets=new Map();
  for(const d of admissionDeclarations){
    const target=Number(d[manifestField]);
    if(!Number.isInteger(target)||target<1||target>expected.size){populationDeclarationErrors.push({player:d.player,error:'INVALID_INITIAL_ADMISSION_RANK',field,target});continue;}
    if(targets.has(target)){populationDeclarationErrors.push({player:d.player,error:'INITIAL_ADMISSION_RANK_COLLISION',field,target,other:targets.get(target)});continue;}
    targets.set(target,d.player);
  }
  const admittedNames=new Set(admissionDeclarations.map(d=>d.player));
  const orderedMain=[...mainMap.values()].sort((a,b)=>Number(a[field])-Number(b[field]));
  const slots=Array(expected.size).fill(null);
  for(const [target,name] of targets)slots[target-1]=expected.get(name);
  let j=0;
  for(let i=0;i<slots.length;i++){
    if(slots[i])continue;
    while(j<orderedMain.length&&admittedNames.has(orderedMain[j]?.n))j++;
    slots[i]=orderedMain[j++];
  }
  if(slots.some(x=>!x)){populationDeclarationErrors.push({error:'ADMISSION_LAYOUT_INCOMPLETE',field});return;}
  slots.forEach((p,i)=>p[field]=i+1);
}
applyAdmissionRankLayout('o','initial_overall_rank');
applyAdmissionRankLayout('tr','initial_true_value_rank');
for(const pos of ['QB','RB','WR','TE']){
  [...expected.values()].filter(p=>p.p===pos).sort((a,b)=>Number(a.o)-Number(b.o)).forEach((p,i)=>p.pr=`${pos}${i+1}`);
  [...expected.values()].filter(p=>p.p===pos).sort((a,b)=>Number(a.tr)-Number(b.tr)).forEach((p,i)=>p.tp=`${pos}${i+1}`);
}

const modelDeclarationErrors=[];
for(const d of declaredCurrentChanges){
  const cur=currentMap.get(d.player);if(!cur){modelDeclarationErrors.push({player:d.player,error:'DECLARED_MODEL_PLAYER_MISSING'});continue;}
  for(const [f,v] of Object.entries(d.expected_values||{})){
    if(!coreFields.includes(f)){modelDeclarationErrors.push({player:d.player,error:'UNSUPPORTED_DECLARED_FIELD',field:f});continue;}
    if(JSON.stringify(cur[f]??null)!==JSON.stringify(v??null))modelDeclarationErrors.push({player:d.player,error:'DECLARED_VALUE_MISMATCH',field:f,declared:v??null,current:cur[f]??null});
  }
}
for(const d of declaredCurrentChanges){const p=expected.get(d.player);if(!p)continue;for(const f of scalarCoreFields)if(Object.prototype.hasOwnProperty.call(d.expected_values,f))p[f]=d.expected_values[f];}
function applyDeclaredRankReflow(field){
  const targets=new Map();for(const d of declaredCurrentChanges)if(Object.prototype.hasOwnProperty.call(d.expected_values,field))targets.set(d.player,Number(d.expected_values[field]));
  if(!targets.size)return;
  const ordered=[...expected.values()].sort((a,b)=>Number(a[field])-Number(b[field]));const slots=Array(expected.size).fill(null);
  for(const [name,target] of targets){
    if(!Number.isInteger(target)||target<1||target>expected.size){modelDeclarationErrors.push({player:name,error:'INVALID_DECLARED_RANK',field,target});continue;}
    if(slots[target-1]){modelDeclarationErrors.push({player:name,error:'DECLARED_RANK_COLLISION',field,target,other:slots[target-1].n});continue;}
    slots[target-1]=expected.get(name);
  }
  const rest=ordered.filter(p=>!targets.has(p.n));let j=0;for(let i=0;i<slots.length;i++)if(!slots[i])slots[i]=rest[j++];slots.forEach((p,i)=>p[field]=i+1);
}
applyDeclaredRankReflow('o');applyDeclaredRankReflow('tr');
for(const pos of ['QB','RB','WR','TE']){
  [...expected.values()].filter(p=>p.p===pos).sort((a,b)=>Number(a.o)-Number(b.o)).forEach((p,i)=>p.pr=`${pos}${i+1}`);
  [...expected.values()].filter(p=>p.p===pos).sort((a,b)=>Number(a.tr)-Number(b.tr)).forEach((p,i)=>p.tp=`${pos}${i+1}`);
}

const deterministicReflow=[];const unauthorizedPrChanges=[];
for(const [name,p] of currentMap){
  if(!expected.has(name))continue;const e=expected.get(name);const changed=[];
  for(const f of coreFields){
    if(JSON.stringify(p[f]??null)!==JSON.stringify(e[f]??null))changed.push({field:f,main:mainMap.get(name)?.[f]??null,expected_after_declared_changes:e[f]??null,current:p[f]??null});
    else if(mainMap.has(name)&&JSON.stringify(mainMap.get(name)?.[f]??null)!==JSON.stringify(e[f]??null))deterministicReflow.push({player:name,field:f,before:mainMap.get(name)?.[f]??null,after:e[f]??null});
  }
  if(changed.length)unauthorizedPrChanges.push({player:name,changed_fields:changed});
}

// Structural drift is now PR-vs-main. A consumed checkpoint must never serve as a standing
// authorization to rewrite protected files in a later PR.
const protectedStructural=['MODEL_SOURCE_OF_TRUTH.json','canonicalBoards2026.json','lockedRanks2026.json'];
const structural=[];const unauthorizedStructural=[];
for(const f of protectedStructural){
  let mainBlob=null;try{mainBlob=execFileSync('git',['rev-parse',`${mainRef}:${f}`],{encoding:'utf8'}).trim();}catch{continue;}
  if(!exists(f))continue;const actual=execFileSync('git',['hash-object',f],{encoding:'utf8'}).trim();
  if(actual!==mainBlob){const item={file:f,main_blob:mainBlob,current_blob:actual};structural.push(item);if(!structuralDeclarationCovers(f))unauthorizedStructural.push(item);}
}
const marketFiles=['market2026.json','vegasOdds2026.json'];const marketChanges=[];
for(const f of marketFiles){if(!exists(f))continue;let mainBlob=null;try{mainBlob=execFileSync('git',['rev-parse',`${mainRef}:${f}`],{encoding:'utf8'}).trim();}catch{continue;}const actual=execFileSync('git',['hash-object',f],{encoding:'utf8'}).trim();if(actual!==mainBlob)marketChanges.push({file:f,main_blob:mainBlob,current_blob:actual,classification:'ALLOWED_OVERLAY_DRIFT'});}

const blocked=[];
if(anchorErrors.length)blocked.push({type:'INVALID_CONSUMED_CHECKPOINT',errors:anchorErrors});
if(unauthorizedAnchorToMain.length)blocked.push({type:'UNDECLARED_CHECKPOINT_TO_MAIN_CORE_DRIFT',players:unauthorizedAnchorToMain});
if(undeclaredAdded.length||undeclaredRemoved.length||populationDeclarationErrors.length||staleDeclaredAdds.length||staleDeclaredRemoves.length)blocked.push({type:'PLAYER_POPULATION_DRIFT',added,removed,undeclared_added:undeclaredAdded,undeclared_removed:undeclaredRemoved,stale_declared_adds:staleDeclaredAdds,stale_declared_removes:staleDeclaredRemoves,declaration_errors:populationDeclarationErrors});
if(modelDeclarationErrors.length)blocked.push({type:'INVALID_EXACT_MODEL_CHANGE_DECLARATION',errors:modelDeclarationErrors});
if(unauthorizedPrChanges.length)blocked.push({type:'UNDECLARED_PR_CORE_DRIFT',players:unauthorizedPrChanges});
if(unauthorizedStructural.length)blocked.push({type:'UNDECLARED_PROTECTED_STRUCTURAL_DRIFT',files:unauthorizedStructural});

const report={
  generated_at:new Date().toISOString(),legacy_baseline_id:baseline.baseline_id,legacy_baseline_commit:baseline.baseline_commit,
  checkpoint_file:checkpointFile,consumed_checkpoint:checkpoint||null,historical_anchor:historicalAnchor,
  main_ref:mainRef,main_head:mainHead,current_head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  comparison_scope:checkpoint?'CONSUMED_MIGRATION_CHECKPOINT_TO_MAIN_PLUS_CURRENT_PR':'FROZEN_BASELINE_TO_MAIN_PLUS_ACTIVE_UNIVERSE_DECLARATIONS',result:blocked.length?'BLOCKED':'PASS',
  player_count:{anchor:anchorPlayers.length,main:mainPlayers.length,current:currentPlayers.length},anchor_to_main:{changes:anchorToMainChanges.length,undeclared:unauthorizedAnchorToMain.length},
  added_players:added,removed_players:removed,declared_added_players:added.filter(n=>declaredAdds.has(n)),declared_removed_players:removed.filter(n=>declaredRemoves.has(n)),undeclared_added_players:undeclaredAdded,undeclared_removed_players:undeclaredRemoved,
  universe_change_manifest:universeManifestFile,manifest_lifecycle:checkpoint?'CONSUMED':'ACTIVE',population_declaration_errors:populationDeclarationErrors,
  exact_model_change_players:declaredCurrentChanges.map(x=>x.player),model_declaration_errors:modelDeclarationErrors,deterministic_declared_rank_reflow:deterministicReflow,undeclared_pr_changes:unauthorizedPrChanges,
  structural_drift:structural,declared_structural_changes:structural.length-unauthorizedStructural.length,undeclared_structural_changes:unauthorizedStructural.length,structural_change_manifest:structuralManifestFile,
  market_overlay_changes:marketChanges,blocked
};
fs.writeFileSync(path.join(root,'guardrails/baseline-drift-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);
