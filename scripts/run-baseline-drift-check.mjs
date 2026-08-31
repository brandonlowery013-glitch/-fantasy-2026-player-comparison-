import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const gitJson=(ref,p)=>JSON.parse(execFileSync('git',['show',`${ref}:${p}`],{encoding:'utf8'}));
const baseline=read('guardrails/baselines/pre-ev-baseline-2026-08-24.json');
const cfg=read('guardrails/guardrails-config.json');
const mainRef='origin/main';
const mainCfg=gitJson(mainRef,'guardrails/guardrails-config.json');
const manifest=read(cfg.drift.change_manifest_file);
const declared=new Map((manifest.changes||[]).map(x=>[x.player,x]));
const structuralManifestFile='guardrails/structural-change-manifest.json';
const structuralManifest=read(structuralManifestFile);
const declaredStructural=new Map((structuralManifest.changes||[]).map(x=>[x.file,x]));
const universeManifestFile=cfg.drift.universe_change_manifest_file||'guardrails/universe-change-manifest.json';
const universeManifest=read(universeManifestFile);
const universeChanges=(universeManifest.changes||[]).filter(x=>x&&x.player&&x.action&&x.reason&&x.source);
const declaredAdds=new Set(universeChanges.filter(x=>x.action==='ADD').map(x=>x.player));
const declaredRemoves=new Set(universeChanges.filter(x=>x.action==='REMOVE').map(x=>x.player));
const coreFields=['o','tr','tp','pr','s','pd','ce','r','e','a','rl','su','mp'];
const patchFile='current162patch-2026-08-24.json';
const applyOverlay=(rows,patch)=>rows.map(p=>({...p,...(patch.players?.[p.n]||{})}));

function loadShardsFromGit(ref,count){
  let rows=[]; for(let i=0;i<count;i++) rows.push(...gitJson(ref,`players${i}.json`)); return rows;
}
function loadShardsFromWorktree(count){
  let rows=[]; for(let i=0;i<count;i++) rows.push(...read(`players${i}.json`)); return rows;
}
function overlayAt(refOrNull,rows){
  let patch={players:{}};
  try{ patch=refOrNull?gitJson(refOrNull,patchFile):read(patchFile); }catch{}
  return applyOverlay(rows,patch);
}
const frozenPlayers=overlayAt(baseline.baseline_commit,loadShardsFromGit(baseline.baseline_commit,baseline.model_contract.authoritative_player_shards));
const mainPlayers=overlayAt(mainRef,loadShardsFromGit(mainRef,mainCfg.authoritative_player_shards));
const currentPlayers=overlayAt(null,loadShardsFromWorktree(cfg.authoritative_player_shards));
const frozenMap=new Map(frozenPlayers.map(p=>[p.n,p]));
const mainMap=new Map(mainPlayers.map(p=>[p.n,p]));
const currentMap=new Map(currentPlayers.map(p=>[p.n,p]));

const declarationCovers=(name,fields)=>{
  const d=declared.get(name); const set=new Set(Array.isArray(d?.changed_fields)?d.changed_fields:[]);
  return !!(d&&d.reason&&d.source&&fields.every(f=>set.has(f)));
};
const structuralDeclarationCovers=file=>{ const d=declaredStructural.get(file); return !!(d&&d.reason&&d.source); };

// Phase 1: preserve the frozen-baseline contract for the already-approved current main state.
const baselineToMainChanges=[];
const unauthorizedBaselineToMain=[];
for(const [name,p] of mainMap){
  const old=frozenMap.get(name); if(!old) continue;
  const changed=[];
  for(const f of coreFields){ if(JSON.stringify(old[f]??null)!==JSON.stringify(p[f]??null)) changed.push({field:f,before:old[f]??null,after:p[f]??null}); }
  if(changed.length){
    const item={player:name,changed_fields:changed}; baselineToMainChanges.push(item);
    if(!declarationCovers(name,changed.map(x=>x.field))) unauthorizedBaselineToMain.push(item);
  }
}

// Phase 2: universe admission is evaluated against current main, not directly against the old frozen baseline.
// This prevents a new insertion from reinterpreting older approved ranking movement.
const added=[...currentMap.keys()].filter(n=>!mainMap.has(n));
const removed=[...mainMap.keys()].filter(n=>!currentMap.has(n));
const undeclaredAdded=added.filter(n=>!declaredAdds.has(n));
const undeclaredRemoved=removed.filter(n=>!declaredRemoves.has(n));
const staleDeclaredAdds=[...declaredAdds].filter(n=>!added.includes(n));
const staleDeclaredRemoves=[...declaredRemoves].filter(n=>!removed.includes(n));
const populationDeclarationErrors=[];
for(const d of universeChanges){
  if(d.from_count!=null&&d.from_count!==mainPlayers.length) populationDeclarationErrors.push({player:d.player,error:'FROM_COUNT_MISMATCH',declared:d.from_count,actual:mainPlayers.length});
  if(d.to_count!=null&&d.to_count!==currentPlayers.length) populationDeclarationErrors.push({player:d.player,error:'TO_COUNT_MISMATCH',declared:d.to_count,actual:currentPlayers.length});
}
if(cfg.authoritative_player_count!==currentPlayers.length) populationDeclarationErrors.push({error:'CONFIG_CURRENT_COUNT_MISMATCH',declared:cfg.authoritative_player_count,actual:currentPlayers.length});

// Build the exact expected existing-player state after declared ADDs, allowing only rank-coordinate reflow.
const expected=new Map(mainPlayers.map(p=>[p.n,{...p}]));
for(const name of added.filter(n=>declaredAdds.has(n))){
  const a=currentMap.get(name); if(!a) continue;
  for(const p of expected.values()){
    if(Number(p.o)>=Number(a.o)) p.o=Number(p.o)+1;
    if(Number(p.tr)>=Number(a.tr)) p.tr=Number(p.tr)+1;
  }
  expected.set(name,{...a});
}
for(const pos of ['QB','RB','WR','TE']){
  const o=[...expected.values()].filter(p=>p.p===pos).sort((a,b)=>Number(a.o)-Number(b.o)); o.forEach((p,i)=>p.pr=`${pos}${i+1}`);
  const t=[...expected.values()].filter(p=>p.p===pos).sort((a,b)=>Number(a.tr)-Number(b.tr)); t.forEach((p,i)=>p.tp=`${pos}${i+1}`);
}
const admissionReflow=[];
const unauthorizedPrChanges=[];
for(const [name,p] of currentMap){
  if(!mainMap.has(name)) continue;
  const e=expected.get(name); const changed=[];
  for(const f of coreFields){
    if(JSON.stringify(p[f]??null)!==JSON.stringify(e[f]??null)) changed.push({field:f,main:mainMap.get(name)?.[f]??null,expected_after_admission:e[f]??null,current:p[f]??null});
    else if(JSON.stringify(mainMap.get(name)?.[f]??null)!==JSON.stringify(e[f]??null)) admissionReflow.push({player:name,field:f,before:mainMap.get(name)?.[f]??null,after:e[f]??null});
  }
  if(changed.length) unauthorizedPrChanges.push({player:name,changed_fields:changed});
}

const protectedStructural=['MODEL_SOURCE_OF_TRUTH.json','canonicalBoards2026.json','lockedRanks2026.json'];
const structural=[]; const unauthorizedStructural=[];
for(const f of protectedStructural){
  const expectedBlob=baseline.authoritative_files?.[f]; if(!expectedBlob) continue;
  const actual=execFileSync('git',['hash-object',f],{encoding:'utf8'}).trim();
  if(actual!==expectedBlob){ const item={file:f,baseline_blob:expectedBlob,current_blob:actual}; structural.push(item); if(!structuralDeclarationCovers(f)) unauthorizedStructural.push(item); }
}
const marketFiles=['market2026.json','vegasOdds2026.json'];
const marketChanges=[];
for(const f of marketFiles){
  const expectedBlob=baseline.authoritative_files?.[f]; if(!expectedBlob||!fs.existsSync(path.join(root,f))) continue;
  const actual=execFileSync('git',['hash-object',f],{encoding:'utf8'}).trim();
  if(actual!==expectedBlob) marketChanges.push({file:f,baseline_blob:expectedBlob,current_blob:actual,classification:'ALLOWED_OVERLAY_DRIFT'});
}
const blocked=[];
if(unauthorizedBaselineToMain.length) blocked.push({type:'UNDECLARED_BASELINE_TO_MAIN_CORE_DRIFT',players:unauthorizedBaselineToMain});
if(undeclaredAdded.length||undeclaredRemoved.length||populationDeclarationErrors.length||staleDeclaredAdds.length||staleDeclaredRemoves.length) blocked.push({type:'PLAYER_POPULATION_DRIFT',added,removed,undeclared_added:undeclaredAdded,undeclared_removed:undeclaredRemoved,stale_declared_adds:staleDeclaredAdds,stale_declared_removes:staleDeclaredRemoves,declaration_errors:populationDeclarationErrors});
if(unauthorizedPrChanges.length) blocked.push({type:'NON_DETERMINISTIC_UNIVERSE_ADMISSION_DRIFT',players:unauthorizedPrChanges});
if(unauthorizedStructural.length) blocked.push({type:'UNDECLARED_PROTECTED_STRUCTURAL_DRIFT',files:unauthorizedStructural});

const report={
  generated_at:new Date().toISOString(), baseline_id:baseline.baseline_id, baseline_commit:baseline.baseline_commit,
  main_ref:mainRef, main_head:execFileSync('git',['rev-parse',mainRef],{encoding:'utf8'}).trim(), current_head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  comparison_scope:'FROZEN_BASELINE_TO_MAIN_MANIFEST_PLUS_MAIN_TO_PR_DECLARED_UNIVERSE_ADMISSION', result:blocked.length?'BLOCKED':'PASS',
  player_count:{baseline:frozenPlayers.length,main:mainPlayers.length,current:currentPlayers.length},
  baseline_to_main:{changes:baselineToMainChanges.length,undeclared:unauthorizedBaselineToMain.length},
  added_players:added,removed_players:removed,declared_added_players:added.filter(n=>declaredAdds.has(n)),declared_removed_players:removed.filter(n=>declaredRemoves.has(n)),
  undeclared_added_players:undeclaredAdded,undeclared_removed_players:undeclaredRemoved,universe_change_manifest:universeManifestFile,population_declaration_errors:populationDeclarationErrors,
  deterministic_admission_rank_reflow:admissionReflow,non_deterministic_pr_changes:unauthorizedPrChanges,
  structural_drift:structural,declared_structural_changes:structural.length-unauthorizedStructural.length,undeclared_structural_changes:unauthorizedStructural.length,structural_change_manifest:structuralManifestFile,
  market_overlay_changes:marketChanges,blocked
};
fs.writeFileSync(path.join(root,'guardrails/baseline-drift-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length) process.exit(1);
