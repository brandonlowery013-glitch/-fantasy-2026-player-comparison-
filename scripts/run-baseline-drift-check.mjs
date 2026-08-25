import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const baseline=read('guardrails/baselines/pre-ev-baseline-2026-08-24.json');
const cfg=read('guardrails/guardrails-config.json');
const manifest=fs.existsSync(path.join(root,cfg.drift.change_manifest_file))?read(cfg.drift.change_manifest_file):{changes:[]};
const declared=new Map((manifest.changes||[]).map(x=>[x.player,x]));
const coreFields=['o','tr','tp','pr','s','pd','ce','r','e','a','rl','su','mp'];

const baselinePlayers=[];
for(let i=0;i<baseline.model_contract.authoritative_player_shards;i++){
  const txt=execFileSync('git',['show',`${baseline.baseline_commit}:players${i}.json`],{encoding:'utf8'});
  baselinePlayers.push(...JSON.parse(txt));
}
const currentPlayers=[];
for(let i=0;i<baseline.model_contract.authoritative_player_shards;i++) currentPlayers.push(...read(`players${i}.json`));

const oldMap=new Map(baselinePlayers.map(p=>[p.n,p]));
const newMap=new Map(currentPlayers.map(p=>[p.n,p]));
const added=[...newMap.keys()].filter(n=>!oldMap.has(n));
const removed=[...oldMap.keys()].filter(n=>!newMap.has(n));
const coreChanges=[];
const unauthorized=[];

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
    const d=declared.get(name);
    const declaredFields=new Set(Array.isArray(d?.changed_fields)?d.changed_fields:[]);
    const missingDeclaration=!d||!d.reason||!d.source||changed.some(x=>!declaredFields.has(x.field));
    if(missingDeclaration) unauthorized.push(item);
  }
}

const protectedStructural=['MODEL_SOURCE_OF_TRUTH.json','canonicalBoards2026.json','lockedRanks2026.json'];
const structural=[];
for(const f of protectedStructural){
  const expected=baseline.authoritative_files?.[f];
  if(!expected) continue;
  const actual=execFileSync('git',['hash-object',f],{encoding:'utf8'}).trim();
  if(actual!==expected) structural.push({file:f,baseline_blob:expected,current_blob:actual});
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
if(added.length||removed.length) blocked.push({type:'PLAYER_POPULATION_DRIFT',added,removed});
if(unauthorized.length) blocked.push({type:'UNDECLARED_CORE_DRIFT',players:unauthorized});
if(structural.length) blocked.push({type:'PROTECTED_STRUCTURAL_DRIFT',files:structural});

const report={
  generated_at:new Date().toISOString(),
  baseline_id:baseline.baseline_id,
  baseline_commit:baseline.baseline_commit,
  current_head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  result:blocked.length?'BLOCKED':'PASS',
  player_count:{baseline:baselinePlayers.length,current:currentPlayers.length},
  added_players:added,
  removed_players:removed,
  declared_core_changes:coreChanges.length-unauthorized.length,
  undeclared_core_changes:unauthorized.length,
  core_changes:coreChanges,
  structural_drift:structural,
  market_overlay_changes:marketChanges,
  blocked
};
fs.writeFileSync(path.join(root,'guardrails/baseline-drift-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length) process.exit(1);
