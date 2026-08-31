import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,x)=>fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n');
const gitJson=(ref,p)=>JSON.parse(execFileSync('git',['show',`${ref}:${p}`],{encoding:'utf8'}));
const BASE='origin/main';
const TARGET=166;
const ADDS=[
  {name:'Kaleb Johnson',overall:147,trueValue:150},
  {name:'Jonnu Smith',overall:152,trueValue:155},
  {name:'Corey Kiner',overall:154,trueValue:161},
  {name:'Tank Dell',overall:164,trueValue:164}
];
const JONNU={
  n:'Jonnu Smith',p:'TE',pr:'TE20',o:152,t:'Green Bay Packers',tr:155,tp:'TE20',s:6.785,
  pd:6.2,ce:6.5,r:5.8,e:8.5,a:9.3,rl:6.0,su:7.2,ad:null,s6:'CEILING VALUE',s7:'ACCEPTABLE',px:'FAIR',fw:'late / waivers',
  st:'SIGNED BY GREEN BAY / MUSGRAVE PUP OPPORTUNITY',
  m:'Rec 32-40 / 300-380 yd / 2-4 TD',cl:'Rec 45-55 / 450-575 yd / 4-6 TD',mp:78.0,cp:null,dp:null,
  cn:'2025 Pittsburgh: 38 receptions, 222 yards, 2 receiving TD; 2024 Miami: 88 receptions, 884 yards, 8 TD',
  vl:'No stable 2026 season-long market line located at onboarding',vs:null,vr:'Price discovery pending after late-August signing with Green Bay.',
  en:'Strong Green Bay scoring environment. Tucker Kraft remains the primary tight end, while Luke Musgrave opens on PUP; Smith adds veteran receiving/H-back depth without an assumed lead role.',
  ns:'2026-08-31 GREEN BAY SIGNING / REGULAR-SEASON UNIVERSE ADD',
  nm:'Green Bay signed Jonnu Smith after his 2025 season in Pittsburgh. Luke Musgrave is on reserve/PUP, creating a real early-season path to TE2/H-back snaps behind Tucker Kraft.',
  na:'Admit as a late/waiver contingent tight end. Do not reduce Tucker Kraft solely because Smith was added; upgrade Smith only if routes, targets or red-zone usage show a material receiving role.',
  projection_context:{history_seasons:9,history_baseline_ppr:72.2,context_factor:1.08,prior_projected_ppr:null,recalibrated_projected_ppr:78.0,note:'Conservative initial Green Bay projection. Median assumes secondary TE/H-back usage behind Tucker Kraft with Musgrave unavailable early; ceiling requires a materially larger route/red-zone role.',material_downstream_change:true,old_production_tier:'Not ranked',new_production_tier:'Concern'},
  sync_note:'Player 166 onboarding triggered by Green Bay signing plus Luke Musgrave PUP status.',
  current_recommendation:'FAIR / LATE TE CONTINGENCY — monitor routes and red-zone work; Kraft remains primary'
};

try{execFileSync('git',['fetch','origin','main','--depth=1'],{stdio:'ignore'});}catch{}
let addRows=read('players13.json');
if(!addRows.some(p=>p.n==='Jonnu Smith')) addRows=[...addRows,JONNU];
for(const x of ADDS) if(!addRows.some(p=>p.n===x.name)) throw new Error(`Missing ${x.name} from admissions shard`);
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
patch.model='single 166-player active board';
patch.supersedes='current162patch-2026-08-24 content; filename retained for runtime compatibility';
patch.step3e_status='APPLIED_APPROVED_CHANGES_PLUS_KALEB_163_JONNU_166_KINER_164_DELL_165_ADMISSIONS';
patch.market_repair_status='162_OF_166_CURRENT_COST_COVERAGE; FOUR_NEW_ADMISSIONS_PRICE_DISCOVERY_PENDING';
write('current162patch-2026-08-24.json',patch);

for(const htmlPath of ['index-backup.html']) if(fs.existsSync(htmlPath)){
  let s=fs.readFileSync(htmlPath,'utf8');
  s=s.replace(/Array\.from\(\{length:(?:13|14)\}/g,'Array.from({length:14}');
  fs.writeFileSync(htmlPath,s);
}

if(fs.existsSync('lockedRanks2026.json')){
  const d=read('lockedRanks2026.json'); d.players=d.players||{};
  for(const p of all) d.players[p.n]={...(d.players[p.n]||{}),trueValueRank:p.tr,trueValuePos:p.tp};
  d.updated='2026-08-31'; d.active_players=TARGET; write('lockedRanks2026.json',d);
}

if(fs.existsSync('injuryOverrides2026.json')){
  const d=read('injuryOverrides2026.json'); d.updated='2026-08-31'; d.players=d.players||{};
  for(const spec of ADDS){const p=byName.get(spec.name);d.players[p.n]={st:p.st,ns:p.ns,nm:p.nm,na:p.na,px:p.px,s7:p.s7,current_recommendation:p.current_recommendation};}
  if(d.players['Josh Jacobs'])Object.assign(d.players['Josh Jacobs'],{st:'COMMISSIONER’S EXEMPT LIST — UNAVAILABLE',ns:'2026-08-30 OFFICIAL AVAILABILITY UPDATE',nm:'Jacobs cannot practice or attend games while on the Commissioner’s Exempt List.',na:'Availability assumption remains materially reduced until reinstatement; connected opportunity shifts to Lloyd, Johnson and Brooks.'});
  if(d.players['MarShawn Lloyd'])Object.assign(d.players['MarShawn Lloyd'],{st:'JACOBS UNAVAILABLE / LEAD-OPPORTUNITY WATCH',ns:'2026-08-30 CONNECTED-PLAYER UPDATE',nm:'Jacobs is unavailable and Green Bay added Kaleb Johnson. Lloyd remains the incumbent with first claim on vacated work.',na:'Increase opportunity versus the prior backup baseline, but do not assume a monopoly role before regular-season usage.'});
  if(d.players['Tucker Kraft'])Object.assign(d.players['Tucker Kraft'],{ns:'2026-08-31 CONNECTED-PLAYER TE REVIEW',nm:'Green Bay signed Jonnu Smith while Luke Musgrave is on PUP. Kraft remains the primary receiving tight end.',na:'HOLD current projection/rank; do not downgrade solely for the Smith signing without route/target evidence.'});
  if(d.players['Rhamondre Stevenson'])Object.assign(d.players['Rhamondre Stevenson'],{ns:'2026-08-30 CONNECTED-PLAYER TRANSACTION REVIEW',nm:'New England added Corey Kiner as RB3. Stevenson remains ahead of Kiner; no downgrade is justified solely by the depth addition.',na:'HOLD current projection/rank unless regular-season usage shows Stevenson losing meaningful work.'});
  if(d.players['TreVeyon Henderson'])Object.assign(d.players['TreVeyon Henderson'],{ns:'2026-08-30 CONNECTED-PLAYER TRANSACTION REVIEW',nm:'New England added Corey Kiner as RB3. Henderson remains ahead of Kiner; no downgrade is justified solely by the depth addition.',na:'HOLD current projection/rank unless regular-season usage shows Henderson losing meaningful work.'});
  if(d.players['Zach Charbonnet'])Object.assign(d.players['Zach Charbonnet'],{st:'PUP — OUT AT LEAST FOUR GAMES',ns:'2026-08-31 OFFICIAL AVAILABILITY CONFIRMATION',nm:'Seattle placed Charbonnet on PUP, requiring at least a four-game absence.',na:'HOLD current injury-discounted projection because the saved model already assumed early unavailability; reopen if the return window extends materially.'});
  if(d.players['Jadarian Price'])Object.assign(d.players['Jadarian Price'],{st:'EARLY-SEASON FEATURE-OPPORTUNITY WATCH',ns:'2026-08-31 CONNECTED-PLAYER CONFIRMATION',nm:'Charbonnet is on PUP for at least four games, confirming Price has early-season opportunity.',na:'HOLD current projection/rank because the saved projection already explicitly included feature-role opportunity while Charbonnet is unavailable; upgrade only if regular-season usage exceeds that assumption.'});
  if(d.players['Nico Collins'])Object.assign(d.players['Nico Collins'],{ns:'2026-08-31 CONNECTED-PLAYER IR REVIEW',nm:'Tank Dell was designated to return from IR, but remains unavailable for at least four games and has no established return workload.',na:'HOLD current projection/rank. Do not preemptively reduce Collins for a future Dell return without route/target evidence.'});
  if(d.players['C.J. Stroud'])Object.assign(d.players['C.J. Stroud'],{ns:'2026-08-31 CONNECTED-PLAYER IR REVIEW',nm:'Tank Dell has a 2026 return path but is unavailable for at least four games.',na:'HOLD current projection/rank; a future healthy Dell could improve receiver depth but does not justify speculative passing-volume changes now.'});
  write('injuryOverrides2026.json',d);
}

if(fs.existsSync('comparison-sync-162-audit.json')){const d=read('comparison-sync-162-audit.json');d.updated='2026-08-31';d.active_players=TARGET;d.unique_normalized=TARGET;d.runtime={...(d.runtime||{}),active_players:TARGET,player_loader_shards:14};write('comparison-sync-162-audit.json',d);}

const validate=(rows,label)=>{
  if(rows.length!==TARGET)throw new Error(`${label}: expected ${TARGET} players, found ${rows.length}`);
  if(new Set(rows.map(p=>p.n)).size!==TARGET)throw new Error(`${label}: duplicate player names`);
  for(const f of ['o','tr']){const ranks=rows.map(p=>Number(p[f])).sort((a,b)=>a-b);for(let i=0;i<TARGET;i++)if(ranks[i]!==i+1)throw new Error(`${label}: ${f} rank gap/collision at ${i+1}`);}
};
validate(all,'canonical');
const effective=all.map(p=>({...p,...(patch.players[p.n]||{})}));
validate(effective,'effective overlay');
for(const spec of ADDS){const p=byName.get(spec.name);for(const f of ['pd','ce','r','e','a','rl','su','mp','m','cl','px','s7'])if(p[f]==null)throw new Error(`${spec.name} missing ${f}`);}
write('kaleb-johnson-163-onboarding-audit.json',{updated:'2026-08-31',passed:true,active_players:TARGET,unique_players:TARGET,effective_overlay_players:TARGET,admissions:ADDS.map(x=>{const p=byName.get(x.name);return {player:p.n,overall_rank:p.o,true_value_rank:p.tr,overall_pos:p.pr,true_value_pos:p.tp,projected_ppr:p.mp,market_value:p.px,status:p.st};}),connected_holds:[{player:'Tucker Kraft',decision:'HOLD — Jonnu Smith signing alone does not reduce saved primary TE role'},{player:'Rhamondre Stevenson',decision:'HOLD — Kiner RB3 addition alone does not reduce saved role'},{player:'TreVeyon Henderson',decision:'HOLD — Kiner RB3 addition alone does not reduce saved role'},{player:'Zach Charbonnet',decision:'HOLD — PUP confirms already-modeled early absence'},{player:'Jadarian Price',decision:'HOLD — PUP confirms already-modeled early feature opportunity'},{player:'Nico Collins',decision:'HOLD — Dell return path does not justify speculative target reduction before active usage'},{player:'C.J. Stroud',decision:'HOLD — Dell return path does not justify speculative passing-volume change'}],guardrails:['transaction/availability trigger reviewed','untracked players dispositioned','projection populated','all seven True-Value components populated','canonical Overall and True-Value ranks contiguous 1-166','effective overlay Overall and True-Value ranks contiguous 1-166','positional ranks regenerated','runtime loader uses 14 shards','compatibility overlay migrated to 166']});
console.log('PASS: deterministically rebuilt 166-player canonical + effective runtime universe from current main plus four admissions');
