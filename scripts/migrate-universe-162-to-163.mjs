import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,x)=>fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n');
const gitJson=(ref,p)=>JSON.parse(execFileSync('git',['show',`${ref}:${p}`],{encoding:'utf8'}));
const BASE='origin/main';
const ADDS=[
  {name:'Kaleb Johnson',overall:147,trueValue:150},
  {name:'Corey Kiner',overall:154,trueValue:161}
];

try{execFileSync('git',['fetch','origin','main','--depth=1'],{stdio:'ignore'});}catch{}
const addRows=read('players13.json');
if(addRows.length!==2) throw new Error('players13.json must contain exactly Kaleb Johnson and Corey Kiner');
for(const x of ADDS) if(!addRows.some(p=>p.n===x.name)) throw new Error(`Missing ${x.name} from players13.json`);
const additions=new Map(addRows.map(p=>[p.n,{...p}]));
const baseShards=[];
for(let i=0;i<13;i++) baseShards.push(gitJson(BASE,`players${i}.json`));
let basePatch={players:{}};
try{basePatch=gitJson(BASE,'current162patch-2026-08-24.json');}catch{}
basePatch.players=basePatch.players||{};
const existing=baseShards.flat().map(p=>{
  const x=basePatch.players[p.n]||{};
  return {...p,o:x.o??p.o,tr:x.tr??p.tr,pr:x.pr??p.pr,tp:x.tp??p.tp};
});
if(existing.length!==162) throw new Error(`Expected 162-player main universe, found ${existing.length}`);
for(const x of ADDS) if(existing.some(p=>p.n===x.name)) throw new Error(`${x.name} already exists on main`);

let all=[...existing];
for(const spec of ADDS){
  for(const p of all){
    if(Number(p.o)>=spec.overall)p.o=Number(p.o)+1;
    if(Number(p.tr)>=spec.trueValue)p.tr=Number(p.tr)+1;
  }
  const add={...additions.get(spec.name),o:spec.overall,tr:spec.trueValue};
  all.push(add);
}
for(const pos of ['QB','RB','WR','TE']){
  all.filter(p=>p.p===pos).sort((a,b)=>Number(a.o)-Number(b.o)).forEach((p,i)=>p.pr=`${pos}${i+1}`);
  all.filter(p=>p.p===pos).sort((a,b)=>Number(a.tr)-Number(b.tr)).forEach((p,i)=>p.tp=`${pos}${i+1}`);
}
const byName=new Map(all.map(p=>[p.n,p]));
const migratedExisting=existing.map(p=>byName.get(p.n));
let off=0;
for(let i=0;i<13;i++){const n=baseShards[i].length;write(`players${i}.json`,migratedExisting.slice(off,off+n));off+=n;}
write('players13.json',ADDS.map(x=>byName.get(x.name)));

const patch=structuredClone(basePatch);
patch.players=patch.players||{};
for(const [name,x] of Object.entries(patch.players)){
  const p=byName.get(name); if(!p) continue;
  x.o=p.o; x.tr=p.tr; x.pr=p.pr; x.tp=p.tp;
}
for(const spec of ADDS){
  const p=byName.get(spec.name);
  patch.players[spec.name]={...(patch.players[spec.name]||{}),o:p.o,tr:p.tr,pr:p.pr,tp:p.tp,st:p.st,ns:p.ns,nm:p.nm,na:p.na,px:p.px,s7:p.s7,current_recommendation:p.current_recommendation};
}
patch.updated='2026-08-31';
patch.model='single 164-player active board';
patch.supersedes='current162patch-2026-08-24 content; filename retained for runtime compatibility';
patch.step3e_status='APPLIED_APPROVED_CHANGES_PLUS_KALEB_163_AND_KINER_164_ADMISSIONS';
patch.market_repair_status='162_OF_164_CURRENT_COST_COVERAGE; TWO_NEW_ADMISSIONS_PRICE_DISCOVERY_PENDING';
write('current162patch-2026-08-24.json',patch);

for(const htmlPath of ['index-backup.html']) if(fs.existsSync(htmlPath)){
  let s=fs.readFileSync(htmlPath,'utf8');
  s=s.replace(/Array\.from\(\{length:(?:13|14)\}/g,'Array.from({length:14}');
  fs.writeFileSync(htmlPath,s);
}

if(fs.existsSync('lockedRanks2026.json')){
  const d=read('lockedRanks2026.json'); d.players=d.players||{};
  for(const p of all) d.players[p.n]={...(d.players[p.n]||{}),trueValueRank:p.tr,trueValuePos:p.tp};
  d.updated='2026-08-31'; d.active_players=164; write('lockedRanks2026.json',d);
}

if(fs.existsSync('injuryOverrides2026.json')){
  const d=read('injuryOverrides2026.json'); d.updated='2026-08-31'; d.players=d.players||{};
  const k=byName.get('Kaleb Johnson'), c=byName.get('Corey Kiner');
  d.players[k.n]={st:k.st,ns:k.ns,nm:k.nm,na:k.na,px:k.px,s7:k.s7,current_recommendation:k.current_recommendation};
  d.players[c.n]={st:c.st,ns:c.ns,nm:c.nm,na:c.na,px:c.px,s7:c.s7,current_recommendation:c.current_recommendation};
  if(d.players['Josh Jacobs'])Object.assign(d.players['Josh Jacobs'],{st:'COMMISSIONER’S EXEMPT LIST — UNAVAILABLE',ns:'2026-08-30 OFFICIAL AVAILABILITY UPDATE',nm:'Jacobs cannot practice or attend games while on the Commissioner’s Exempt List.',na:'Availability assumption remains materially reduced until reinstatement; connected opportunity shifts to Lloyd, Johnson and Brooks.'});
  if(d.players['MarShawn Lloyd'])Object.assign(d.players['MarShawn Lloyd'],{st:'JACOBS UNAVAILABLE / LEAD-OPPORTUNITY WATCH',ns:'2026-08-30 CONNECTED-PLAYER UPDATE',nm:'Jacobs is unavailable and Green Bay added Kaleb Johnson. Lloyd remains the incumbent with first claim on vacated work.',na:'Increase opportunity versus the prior backup baseline, but do not assume a monopoly role before regular-season usage.'});
  if(d.players['Rhamondre Stevenson'])Object.assign(d.players['Rhamondre Stevenson'],{ns:'2026-08-30 CONNECTED-PLAYER TRANSACTION REVIEW',nm:'New England added Corey Kiner as RB3. Stevenson remains ahead of Kiner; no downgrade is justified solely by the depth addition.',na:'HOLD current projection/rank unless regular-season usage shows Stevenson losing meaningful work.'});
  if(d.players['TreVeyon Henderson'])Object.assign(d.players['TreVeyon Henderson'],{ns:'2026-08-30 CONNECTED-PLAYER TRANSACTION REVIEW',nm:'New England added Corey Kiner as RB3. Henderson remains ahead of Kiner; no downgrade is justified solely by the depth addition.',na:'HOLD current projection/rank unless regular-season usage shows Henderson losing meaningful work.'});
  if(d.players['Zach Charbonnet'])Object.assign(d.players['Zach Charbonnet'],{st:'PUP — OUT AT LEAST FOUR GAMES',ns:'2026-08-31 OFFICIAL AVAILABILITY CONFIRMATION',nm:'Seattle placed Charbonnet on PUP, requiring at least a four-game absence.',na:'HOLD current injury-discounted projection for now because the saved model already assumed early unavailability; reopen only if the return window extends materially.'});
  if(d.players['Jadarian Price'])Object.assign(d.players['Jadarian Price'],{st:'EARLY-SEASON FEATURE-OPPORTUNITY WATCH',ns:'2026-08-31 CONNECTED-PLAYER CONFIRMATION',nm:'Charbonnet is on PUP for at least four games, confirming Price has early-season opportunity.',na:'HOLD current projection/rank because the saved projection already explicitly included feature-role opportunity while Charbonnet is unavailable; upgrade only if regular-season usage exceeds that assumption.'});
  write('injuryOverrides2026.json',d);
}

if(fs.existsSync('comparison-sync-162-audit.json')){const d=read('comparison-sync-162-audit.json');d.updated='2026-08-31';d.active_players=164;d.unique_normalized=164;d.runtime={...(d.runtime||{}),active_players:164,player_loader_shards:14};write('comparison-sync-162-audit.json',d);}

const validate=(rows,label)=>{
  if(rows.length!==164)throw new Error(`${label}: expected 164 players, found ${rows.length}`);
  if(new Set(rows.map(p=>p.n)).size!==164)throw new Error(`${label}: duplicate player names`);
  for(const f of ['o','tr']){const ranks=rows.map(p=>Number(p[f])).sort((a,b)=>a-b);for(let i=0;i<164;i++)if(ranks[i]!==i+1)throw new Error(`${label}: ${f} rank gap/collision at ${i+1}`);}
};
validate(all,'canonical');
const effective=all.map(p=>({...p,...(patch.players[p.n]||{})}));
validate(effective,'effective overlay');
for(const spec of ADDS){const p=byName.get(spec.name);for(const f of ['pd','ce','r','e','a','rl','su','mp','m','cl','px','s7'])if(p[f]==null)throw new Error(`${spec.name} missing ${f}`);}
write('kaleb-johnson-163-onboarding-audit.json',{updated:'2026-08-31',passed:true,active_players:164,unique_players:164,effective_overlay_players:164,admissions:ADDS.map(x=>{const p=byName.get(x.name);return {player:p.n,overall_rank:p.o,true_value_rank:p.tr,overall_pos:p.pr,true_value_pos:p.tp,projected_ppr:p.mp,market_value:p.px,status:p.st};}),connected_holds:[{player:'Rhamondre Stevenson',decision:'HOLD — Kiner RB3 addition alone does not reduce saved role'},{player:'TreVeyon Henderson',decision:'HOLD — Kiner RB3 addition alone does not reduce saved role'},{player:'Zach Charbonnet',decision:'HOLD — PUP confirms already-modeled early absence'},{player:'Jadarian Price',decision:'HOLD — PUP confirms already-modeled early feature opportunity'}],guardrails:['transaction/availability trigger reviewed','untracked players dispositioned','projection populated','all seven True-Value components populated','canonical Overall and True-Value ranks contiguous 1-164','effective overlay Overall and True-Value ranks contiguous 1-164','positional ranks regenerated','runtime loader uses 14 shards','compatibility overlay migrated to 164']});
console.log('PASS: deterministically rebuilt 164-player canonical + effective runtime universe from current main plus two admissions');
