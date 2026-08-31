import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const gitJson=(ref,p)=>JSON.parse(execFileSync('git',['show',`${ref}:${p}`],{encoding:'utf8'}));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const mainRef='origin/main';
const mainSot=gitJson(mainRef,'MODEL_SOURCE_OF_TRUTH.json');
const prSot=read('MODEL_SOURCE_OF_TRUTH.json');
const mainShardCount=Number(mainSot.runtime_player_shards);
const prShardCount=Number(prSot.runtime_player_shards);
const additions=['Kaleb Johnson','Corey Kiner','Tank Dell','Jonnu Smith'];

const loadGitShards=(ref,count)=>{let rows=[];for(let i=0;i<count;i++)rows.push(...gitJson(ref,`players${i}.json`));return rows;};
const loadWorktreeShards=count=>{let rows=[];for(let i=0;i<count;i++){const p=`players${i}.json`;if(fs.existsSync(p))rows.push(...read(p));}return rows;};
const overlay=(rows,patch)=>rows.map(p=>({...p,...(patch.players?.[p.n]||{})}));

const mainRaw=loadGitShards(mainRef,mainShardCount);
const mainPatch=gitJson(mainRef,'current162patch-2026-08-24.json');
const mainEffective=overlay(mainRaw,mainPatch);
const currentRaw=loadWorktreeShards(prShardCount);
const currentPatch=read('current162patch-2026-08-24.json');
const currentEffective=overlay(currentRaw,currentPatch);
const currentMap=new Map(currentEffective.map(p=>[p.n,p]));
const additionRows=additions.map(n=>currentMap.get(n));
if(additionRows.some(x=>!x)) throw new Error(`Missing declared addition(s): ${additions.filter((n,i)=>!additionRows[i]).join(', ')}`);
if(mainRaw.length!==Number(mainSot.active_player_model)) throw new Error(`main raw universe mismatch ${mainRaw.length} vs ${mainSot.active_player_model}`);
if(mainEffective.length!==Number(mainSot.active_player_model)) throw new Error('main effective universe mismatch');

// Mirror scripts/run-baseline-drift-check.mjs Phase 2 exactly.
const expected=new Map(mainEffective.map(p=>[p.n,{...p}]));
for(const a of additionRows){
  for(const p of expected.values()){
    if(Number(p.o)>=Number(a.o)) p.o=Number(p.o)+1;
    if(Number(p.tr)>=Number(a.tr)) p.tr=Number(p.tr)+1;
  }
  expected.set(a.n,{...a});
}
for(const pos of ['QB','RB','WR','TE']){
  const overall=[...expected.values()].filter(p=>p.p===pos).sort((a,b)=>Number(a.o)-Number(b.o));
  overall.forEach((p,i)=>p.pr=`${pos}${i+1}`);
  const truth=[...expected.values()].filter(p=>p.p===pos).sort((a,b)=>Number(a.tr)-Number(b.tr));
  truth.forEach((p,i)=>p.tp=`${pos}${i+1}`);
}

// Reset the original 162 raw records to current main. Keep additions isolated in shard 13.
for(let i=0;i<mainShardCount;i++) write(`players${i}.json`,gitJson(mainRef,`players${i}.json`));
for(let i=mainShardCount;i<prShardCount;i++) write(`players${i}.json`,i===mainShardCount?additionRows:[]);

// Reset the overlay to current main, then apply only deterministic admission rank coordinates.
const nextPatch=JSON.parse(JSON.stringify(mainPatch));
nextPatch.updated='2026-08-31';
nextPatch.model='single 166-player active board';
nextPatch.supersedes='current162patch-2026-08-24 content; filename retained for runtime compatibility';
nextPatch.market_repair_status='162_OF_166_CURRENT_COST_COVERAGE; four declared additions pending price discovery where unavailable';
nextPatch.players=nextPatch.players||{};
for(const p of mainEffective){
  const e=expected.get(p.n);
  nextPatch.players[p.n]={...(nextPatch.players[p.n]||{}),o:e.o,tr:e.tr,pr:e.pr,tp:e.tp};
}
for(const a of additionRows){
  const e=expected.get(a.n);
  const prior=currentPatch.players?.[a.n]||{};
  nextPatch.players[a.n]={...prior,o:e.o,tr:e.tr,pr:e.pr,tp:e.tp};
}
write('current162patch-2026-08-24.json',nextPatch);

// Rebuild locked true-value coordinates from the same expected effective universe.
const mainLocked=gitJson(mainRef,'lockedRanks2026.json');
const locked={...mainLocked,as_of:'2026-08-31',source:'PR #128 declared 162-to-166 universe admission; current main plus deterministic rank reflow',players:{}};
for(const p of [...expected.values()].sort((a,b)=>Number(a.o)-Number(b.o))){locked.players[p.n]={trueValueRank:Number(p.tr),trueValuePos:p.tp};}
write('lockedRanks2026.json',locked);

const existingNames=new Set(mainEffective.map(p=>p.n));
const finalEffective=overlay([...mainRaw,...additionRows],nextPatch);
const finalMap=new Map(finalEffective.map(p=>[p.n,p]));
const core=['o','tr','tp','pr','s','pd','ce','r','e','a','rl','su','mp'];
const mismatches=[];
for(const n of existingNames){const got=finalMap.get(n),e=expected.get(n);for(const f of core)if(JSON.stringify(got?.[f]??null)!==JSON.stringify(e?.[f]??null))mismatches.push({player:n,field:f,got:got?.[f]??null,expected:e?.[f]??null});}
if(mismatches.length) throw new Error(`Reconciliation self-check failed: ${JSON.stringify(mismatches.slice(0,10))}`);
if(finalEffective.length!==166) throw new Error(`Expected 166 effective players, found ${finalEffective.length}`);
console.log(JSON.stringify({result:'PASS',main_players:mainEffective.length,final_players:finalEffective.length,additions:additionRows.map(x=>({player:x.n,o:x.o,tr:x.tr})),existing_core_mismatches:mismatches.length},null,2));
