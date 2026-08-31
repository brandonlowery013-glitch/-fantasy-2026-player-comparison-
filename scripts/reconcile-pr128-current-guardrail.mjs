import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const gitJson=(ref,p)=>JSON.parse(execFileSync('git',['show',`${ref}:${p}`],{encoding:'utf8'}));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const mainRef='origin/main';
const mainCfg=gitJson(mainRef,'guardrails/guardrails-config.json');
const cfg=read('guardrails/guardrails-config.json');
const manifest=read('guardrails/universe-change-manifest.json');
const mainShardCount=Number(mainCfg.authoritative_player_shards);
const currentShardCount=Number(cfg.authoritative_player_shards);
const patchFile='current162patch-2026-08-24.json';
const coreFields=['o','tr','tp','pr','s','pd','ce','r','e','a','rl','su','mp'];
const scalarCoreFields=['s','pd','ce','r','e','a','rl','su','mp'];
const overlay=(rows,patch)=>rows.map(p=>({...p,...(patch.players?.[p.n]||{})}));
const loadGitShards=(ref,count)=>{let rows=[];for(let i=0;i<count;i++)rows.push(...gitJson(ref,`players${i}.json`));return rows;};
const loadWorktreeShards=count=>{let rows=[];for(let i=0;i<count;i++){const p=`players${i}.json`;if(fs.existsSync(p))rows.push(...read(p));}return rows;};

const mainRaw=loadGitShards(mainRef,mainShardCount);
const mainPatch=gitJson(mainRef,patchFile);
const mainPlayers=overlay(mainRaw,mainPatch);
const currentRaw=loadWorktreeShards(currentShardCount);
const currentPatch=read(patchFile);
const currentPlayers=overlay(currentRaw,currentPatch);
const currentMap=new Map(currentPlayers.map(p=>[p.n,p]));
const admissionDeclarations=(manifest.changes||[]).filter(x=>x.action==='ADD');
const declaredCurrentChanges=[...(manifest.model_changes||[]),...(manifest.admission_updates||[])];
const expected=new Map(mainPlayers.map(p=>[p.n,{...p}]));

for(const d of admissionDeclarations){
  const a=currentMap.get(d.player);
  if(!a) throw new Error(`Declared admission missing: ${d.player}`);
  expected.set(d.player,{...a});
}
function applyAdmissionRankLayout(field,manifestField){
  const targets=new Map();
  for(const d of admissionDeclarations){
    const target=Number(d[manifestField]);
    if(!Number.isInteger(target)||target<1||target>expected.size)throw new Error(`Invalid admission rank ${d.player} ${field}=${target}`);
    if(targets.has(target))throw new Error(`Admission collision ${field}=${target}`);
    targets.set(target,d.player);
  }
  const orderedMain=[...mainPlayers].sort((a,b)=>Number(a[field])-Number(b[field]));
  const slots=Array(expected.size).fill(null);
  for(const [target,name] of targets)slots[target-1]=expected.get(name);
  let j=0;
  for(let i=0;i<slots.length;i++)if(!slots[i])slots[i]=orderedMain[j++];
  if(slots.some(x=>!x))throw new Error(`Admission layout incomplete ${field}`);
  slots.forEach((p,i)=>p[field]=i+1);
}
applyAdmissionRankLayout('o','initial_overall_rank');
applyAdmissionRankLayout('tr','initial_true_value_rank');
for(const pos of ['QB','RB','WR','TE']){
  [...expected.values()].filter(p=>p.p===pos).sort((a,b)=>Number(a.o)-Number(b.o)).forEach((p,i)=>p.pr=`${pos}${i+1}`);
  [...expected.values()].filter(p=>p.p===pos).sort((a,b)=>Number(a.tr)-Number(b.tr)).forEach((p,i)=>p.tp=`${pos}${i+1}`);
}
for(const d of declaredCurrentChanges){
  const p=expected.get(d.player);if(!p)throw new Error(`Declared model player missing ${d.player}`);
  for(const f of scalarCoreFields)if(Object.prototype.hasOwnProperty.call(d.expected_values||{},f))p[f]=d.expected_values[f];
}
function applyDeclaredRankReflow(field){
  const targets=new Map();
  for(const d of declaredCurrentChanges)if(Object.prototype.hasOwnProperty.call(d.expected_values||{},field))targets.set(d.player,Number(d.expected_values[field]));
  if(!targets.size)return;
  const ordered=[...expected.values()].sort((a,b)=>Number(a[field])-Number(b[field]));
  const slots=Array(expected.size).fill(null);
  for(const [name,target] of targets){
    if(!Number.isInteger(target)||target<1||target>expected.size)throw new Error(`Invalid declared rank ${name} ${field}=${target}`);
    if(slots[target-1])throw new Error(`Declared rank collision ${field}=${target}`);
    slots[target-1]=expected.get(name);
  }
  const rest=ordered.filter(p=>!targets.has(p.n));let j=0;
  for(let i=0;i<slots.length;i++)if(!slots[i])slots[i]=rest[j++];
  slots.forEach((p,i)=>p[field]=i+1);
}
applyDeclaredRankReflow('o');
applyDeclaredRankReflow('tr');
for(const pos of ['QB','RB','WR','TE']){
  [...expected.values()].filter(p=>p.p===pos).sort((a,b)=>Number(a.o)-Number(b.o)).forEach((p,i)=>p.pr=`${pos}${i+1}`);
  [...expected.values()].filter(p=>p.p===pos).sort((a,b)=>Number(a.tr)-Number(b.tr)).forEach((p,i)=>p.tp=`${pos}${i+1}`);
}

// Reset existing raw shards to current main. Preserve the four addition records in the extra shard.
const additions=admissionDeclarations.map(d=>currentMap.get(d.player));
for(let i=0;i<mainShardCount;i++)write(`players${i}.json`,gitJson(mainRef,`players${i}.json`));
for(let i=mainShardCount;i<currentShardCount;i++)write(`players${i}.json`,i===mainShardCount?additions:[]);

// Main overlay is the base; overlay exact expected core values for all 166 so effective state equals guardrail reconstruction.
const nextPatch=JSON.parse(JSON.stringify(mainPatch));
nextPatch.updated='2026-08-31';
nextPatch.model='single 166-player active board';
nextPatch.supersedes='current162patch-2026-08-24 content; filename retained for runtime compatibility';
nextPatch.players=nextPatch.players||{};
for(const p of expected.values()){
  const prior=nextPatch.players[p.n]||currentPatch.players?.[p.n]||{};
  nextPatch.players[p.n]={...prior};
  for(const f of coreFields)nextPatch.players[p.n][f]=p[f];
}
write(patchFile,nextPatch);

const mainLocked=gitJson(mainRef,'lockedRanks2026.json');
const locked={...mainLocked,as_of:'2026-08-31',source:'PR #128 current guardrail reconstruction: simultaneous 162-to-166 admissions plus exact declared model changes',players:{}};
for(const p of [...expected.values()].sort((a,b)=>Number(a.o)-Number(b.o)))locked.players[p.n]={trueValueRank:Number(p.tr),trueValuePos:p.tp};
write('lockedRanks2026.json',locked);

const finalRaw=loadWorktreeShards(currentShardCount);
const finalPlayers=overlay(finalRaw,nextPatch);
const finalMap=new Map(finalPlayers.map(p=>[p.n,p]));
const mismatches=[];
for(const [name,e] of expected){const got=finalMap.get(name);for(const f of coreFields)if(JSON.stringify(got?.[f]??null)!==JSON.stringify(e?.[f]??null))mismatches.push({player:name,field:f,got:got?.[f]??null,expected:e?.[f]??null});}
if(finalPlayers.length!==expected.size||expected.size!==166)throw new Error(`Universe mismatch final=${finalPlayers.length} expected=${expected.size}`);
if(new Set(finalPlayers.map(p=>p.n)).size!==166)throw new Error('Unique universe is not 166');
if(mismatches.length)throw new Error(`Core self-check failed: ${JSON.stringify(mismatches.slice(0,20))}`);
for(const d of declaredCurrentChanges){const got=finalMap.get(d.player);for(const [f,v] of Object.entries(d.expected_values||{}))if(JSON.stringify(got?.[f]??null)!==JSON.stringify(v??null))throw new Error(`Exact declaration mismatch ${d.player}.${f}: got ${got?.[f]} expected ${v}`);}
console.log(JSON.stringify({result:'PASS',main_head:execFileSync('git',['rev-parse',mainRef],{encoding:'utf8'}).trim(),main_players:mainPlayers.length,final_players:finalPlayers.length,declared_additions:admissionDeclarations.map(x=>x.player),exact_model_changes:declaredCurrentChanges.map(x=>x.player),core_mismatches:mismatches.length},null,2));
