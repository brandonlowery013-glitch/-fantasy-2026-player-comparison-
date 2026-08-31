import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const baseline=read('guardrails/baselines/pre-ev-baseline-2026-08-24.json');
const cfg=read('guardrails/guardrails-config.json');
const manifest=fs.existsSync(path.join(root,cfg.drift.change_manifest_file))?read(cfg.drift.change_manifest_file):{changes:[]};
const declared=new Map((manifest.changes||[]).map(x=>[x.player,x]));
const structuralManifestFile='guardrails/structural-change-manifest.json';
const structuralManifest=fs.existsSync(path.join(root,structuralManifestFile))?read(structuralManifestFile):{changes:[]};
const declaredStructural=new Map((structuralManifest.changes||[]).map(x=>[x.file,x]));
const universeManifestFile=cfg.drift.universe_change_manifest_file||'guardrails/universe-change-manifest.json';
const universeManifest=fs.existsSync(path.join(root,universeManifestFile))?read(universeManifestFile):{changes:[]};
const validUniverseDeclarations=(universeManifest.changes||[]).filter(x=>x&&x.player&&x.action&&x.reason&&x.source);
const declaredAdds=new Set(validUniverseDeclarations.filter(x=>x.action==='ADD').map(x=>x.player));
const declaredRemoves=new Set(validUniverseDeclarations.filter(x=>x.action==='REMOVE').map(x=>x.player));
const coreFields=['o','tr','tp','pr','s','pd','ce','r','e','a','rl','su','mp'];

const baselinePlayers=[];
for(let i=0;i<baseline.model_contract.authoritative_player_shards;i++){
  const txt=execFileSync('git',['show',`${baseline.baseline_commit}:players${i}.json`],{encoding:'utf8'});
  baselinePlayers.push(...JSON.parse(txt));
}
const currentPlayers=[];
for(let i=0;i<cfg.authoritative_player_shards;i++) currentPlayers.push(...read(`players${i}.json`));

const patchFile='current162patch-2026-08-24.json';
const oldPatch=(baseline.authoritative_files?.[patchFile])
  ? JSON.parse(execFileSync('git',['show',`${baseline.baseline_commit}:${patchFile}`],{encoding:'utf8'}))
  : {players:{}};
const newPatch=fs.existsSync(path.join(root,patchFile))?read(patchFile):{players:{}};

// Guardrail the effective runtime state, not the physical storage layer. A field copied
// from a shard into the overlay is not drift if the effective value is unchanged.
const applyOverlay=(rows,patch)=>rows.map(p=>({...p,...(patch.players?.[p.n]||{})}));
const baselineEffective=applyOverlay(baselinePlayers,oldPatch);
const currentEffective=applyOverlay(currentPlayers,newPatch);
const oldMap=new Map(baselineEffective.map(p=>[p.n,p]));
const newMap=new Map(currentEffective.map(p=>[p.n,p]));
const added=[...newMap.keys()].filter(n=>!oldMap.has(n));
const removed=[...oldMap.keys()].filter(n=>!newMap.has(n));
const undeclaredAdded=added.filter(n=>!declaredAdds.has(n));
const undeclaredRemoved=removed.filter(n=>!declaredRemoves.has(n));
const staleDeclaredAdds=[...declaredAdds].filter(n=>!added.includes(n));
const staleDeclaredRemoves=[...declaredRemoves].filter(n=>!removed.includes(n));
const populationDeclarationErrors=[];
for(const d of validUniverseDeclarations){
  if(d.from_count!=null&&d.from_count!==baselineEffective.length) populationDeclarationErrors.push({player:d.player,error:'FROM_COUNT_MISMATCH',declared:d.from_count,actual:baselineEffective.length});
  if(d.to_count!=null&&d.to_count!==currentEffective.length) populationDeclarationErrors.push({player:d.player,error:'TO_COUNT_MISMATCH',declared:d.to_count,actual:currentEffective.length});
}
if(cfg.authoritative_player_count!==currentEffective.length) populationDeclarationErrors.push({error:'CONFIG_CURRENT_COUNT_MISMATCH',declared:cfg.authoritative_player_count,actual:currentEffective.length});
const coreChanges=[];
const unauthorized=[];

const declarationCovers=(name,fields)=>{
  const d=declared.get(name);
  const declaredFields=new Set(Array.isArray(d?.changed_fields)?d.changed_fields:[]);
  return !!(d&&d.reason&&d.source&&fields.every(f=>declaredFields.has(f)));
};
const structuralDeclarationCovers=file=>{
  const d=declaredStructural.get(file);
  return !!(d&&d.reason&&d.source);
};

for(const [name,p] of newMap){
  const old=oldMap.get(name); if(!old) continue;
  const changed=[];
  for(const f of coreFields){
    const a=old[f]??null,b=p[f]??null;
    if(JSON.stringify(a)!==JSON.stringify(b)) changed.push({field:f,before:a,after:b});
  }
  if(changed.length){
    const item={player:name,changed_fields:changed};
    coreChanges.push(item);
    if(!declarationCovers(name,changed.map(x=>x.field))) unauthorized.push(item);
  }
}

// Preserve a storage-layer audit for visibility, but do not block on values that merely
// duplicate shard state. Only effective protected-field changes above require declarations.
const patchStorageChanges=[];
const oldPatchPlayers=oldPatch.players||{};
const newPatchPlayers=newPatch.players||{};
const patchNames=new Set([...Object.keys(oldPatchPlayers),...Object.keys(newPatchPlayers)]);
for(const name of patchNames){
  const before=oldPatchPlayers[name]||{};
  const after=newPatchPlayers[name]||{};
  const fields=new Set([...Object.keys(before),...Object.keys(after)]);
  const changed=[];
  for(const field of fields){
    if(JSON.stringify(before[field]??null)!==JSON.stringify(after[field]??null)) changed.push({field,before:before[field]??null,after:after[field]??null});
  }
  if(changed.length) patchStorageChanges.push({player:name,changed_fields:changed});
}

const patchMetadataDrift=[];
for(const key of ['updated','model']){
  if(JSON.stringify(oldPatch[key]??null)!==JSON.stringify(newPatch[key]??null)) patchMetadataDrift.push({field:key,before:oldPatch[key]??null,after:newPatch[key]??null});
}

const protectedStructural=['MODEL_SOURCE_OF_TRUTH.json','canonicalBoards2026.json','lockedRanks2026.json'];
const structural=[];
const unauthorizedStructural=[];
for(const f of protectedStructural){
  const expected=baseline.authoritative_files?.[f];
  if(!expected) continue;
  const actual=execFileSync('git',['hash-object',f],{encoding:'utf8'}).trim();
  if(actual!==expected){
    const item={file:f,baseline_blob:expected,current_blob:actual};
    structural.push(item);
    if(!structuralDeclarationCovers(f)) unauthorizedStructural.push(item);
  }
}

const marketFiles=['market2026.json','vegasOdds2026.json'];
const marketChanges=[];
for(const f of marketFiles){
  const expected=baseline.authoritative_files?.[f];
  if(!expected||!fs.existsSync(path.join(root,f))) continue;
  const actual=execFileSync('git',['hash-object',f],{encoding:'utf8'}).trim();
  if(actual!==expected) marketChanges.push({file:f,baseline_blob:expected,current_blob:actual,classification:'ALLOWED_OVERLAY_DRIFT'});
}

const blocked=[];
if(undeclaredAdded.length||undeclaredRemoved.length||populationDeclarationErrors.length||staleDeclaredAdds.length||staleDeclaredRemoves.length){
  blocked.push({type:'PLAYER_POPULATION_DRIFT',added,removed,undeclared_added:undeclaredAdded,undeclared_removed:undeclaredRemoved,stale_declared_adds:staleDeclaredAdds,stale_declared_removes:staleDeclaredRemoves,declaration_errors:populationDeclarationErrors});
}
if(unauthorized.length) blocked.push({type:'UNDECLARED_EFFECTIVE_CORE_DRIFT',players:unauthorized});
if(unauthorizedStructural.length) blocked.push({type:'UNDECLARED_PROTECTED_STRUCTURAL_DRIFT',files:unauthorizedStructural});

const report={
  generated_at:new Date().toISOString(),
  baseline_id:baseline.baseline_id,
  baseline_commit:baseline.baseline_commit,
  current_head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  comparison_scope:'EFFECTIVE_RUNTIME_STATE_SHARDS_PLUS_OVERLAY',
  result:blocked.length?'BLOCKED':'PASS',
  player_count:{baseline:baselineEffective.length,current:currentEffective.length},
  added_players:added,
  removed_players:removed,
  declared_added_players:added.filter(n=>declaredAdds.has(n)),
  declared_removed_players:removed.filter(n=>declaredRemoves.has(n)),
  undeclared_added_players:undeclaredAdded,
  undeclared_removed_players:undeclaredRemoved,
  universe_change_manifest:universeManifestFile,
  population_declaration_errors:populationDeclarationErrors,
  declared_core_changes:coreChanges.length-unauthorized.length,
  undeclared_core_changes:unauthorized.length,
  core_changes:coreChanges,
  overlay_storage_changes:patchStorageChanges,
  overlay_metadata_changes:patchMetadataDrift,
  structural_drift:structural,
  declared_structural_changes:structural.length-unauthorizedStructural.length,
  undeclared_structural_changes:unauthorizedStructural.length,
  structural_change_manifest:structuralManifestFile,
  market_overlay_changes:marketChanges,
  blocked
};
fs.writeFileSync(path.join(root,'guardrails/baseline-drift-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length) process.exit(1);
