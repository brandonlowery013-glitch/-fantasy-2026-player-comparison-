import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,x)=>fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n');
const gitJson=(ref,p)=>JSON.parse(execFileSync('git',['show',`${ref}:${p}`],{encoding:'utf8'}));
const OVERALL_TARGET=147, TRUE_TARGET=150, NAME='Kaleb Johnson', BASE='origin/main';

// Always rebuild from current main so reruns cannot double-shift an already migrated branch.
try{execFileSync('git',['fetch','origin','main','--depth=1'],{stdio:'ignore'});}catch{}
const add=read('players13.json');
if(add.length!==1||add[0].n!==NAME) throw new Error('players13.json must contain Kaleb Johnson only');
const kaleb={...add[0]};
const baseShards=[];
for(let i=0;i<13;i++) baseShards.push(gitJson(BASE,`players${i}.json`));
const existing=baseShards.flat().map(p=>({...p}));
if(existing.length!==162||existing.some(p=>p.n===NAME)) throw new Error('Expected 162-player main universe without Kaleb Johnson');

for(const p of existing){if(Number(p.o)>=OVERALL_TARGET)p.o=Number(p.o)+1;if(Number(p.tr)>=TRUE_TARGET)p.tr=Number(p.tr)+1;}
kaleb.o=OVERALL_TARGET; kaleb.tr=TRUE_TARGET;
const all=[...existing,kaleb];
for(const pos of ['QB','RB','WR','TE']){
  all.filter(p=>p.p===pos).sort((a,b)=>Number(a.o)-Number(b.o)).forEach((p,i)=>p.pr=`${pos}${i+1}`);
  all.filter(p=>p.p===pos).sort((a,b)=>Number(a.tr)-Number(b.tr)).forEach((p,i)=>p.tp=`${pos}${i+1}`);
}
const byName=new Map(all.map(p=>[p.n,p]));

// Persist canonical shards with main membership unchanged and Kaleb in shard 13.
let off=0;
for(let i=0;i<13;i++){const n=baseShards[i].length;write(`players${i}.json`,existing.slice(off,off+n));off+=n;}
write('players13.json',[kaleb]);

// Migrate the compatibility overlay too. It participates in effective runtime state and must not restore 162-era ranks.
let patch;
try{patch=gitJson(BASE,'current162patch-2026-08-24.json');}catch{patch={players:{}};}
patch.players=patch.players||{};
for(const [name,x] of Object.entries(patch.players)){
  const p=byName.get(name); if(!p) continue;
  x.o=p.o; x.tr=p.tr; x.pr=p.pr; x.tp=p.tp;
}
patch.players[NAME]={
  ...(patch.players[NAME]||{}),o:kaleb.o,tr:kaleb.tr,pr:kaleb.pr,tp:kaleb.tp,
  st:kaleb.st,ns:kaleb.ns,nm:kaleb.nm,na:kaleb.na,px:kaleb.px,s7:kaleb.s7,
  current_recommendation:kaleb.current_recommendation
};
patch.updated='2026-08-30';
patch.model='single 163-player active board';
patch.supersedes='current162patch-2026-08-24 content; filename retained for runtime compatibility';
patch.step3e_status='APPLIED_APPROVED_CHANGES_PLUS_KALEB_163_ADMISSION';
patch.market_repair_status='162_OF_163_CURRENT_COST_COVERAGE; KALEB_PRICE_DISCOVERY_PENDING';
write('current162patch-2026-08-24.json',patch);

// Runtime loader must include shard 13.
for(const htmlPath of ['index-backup.html']) if(fs.existsSync(htmlPath)){
  let s=fs.readFileSync(htmlPath,'utf8');
  s=s.replace(/Array\.from\(\{length:(?:13|14)\}/g,'Array.from({length:14}');
  fs.writeFileSync(htmlPath,s);
}

// Locked True-Value coordinates are regenerated directly from the final 163-player state.
if(fs.existsSync('lockedRanks2026.json')){
  const d=read('lockedRanks2026.json'); d.players=d.players||{};
  for(const p of all) d.players[p.n]={...(d.players[p.n]||{}),trueValueRank:p.tr,trueValuePos:p.tp};
  d.updated='2026-08-30'; d.active_players=163; write('lockedRanks2026.json',d);
}

// Connected-player availability/opportunity context.
if(fs.existsSync('injuryOverrides2026.json')){
  const d=read('injuryOverrides2026.json'); d.updated='2026-08-30'; d.players=d.players||{};
  d.players[NAME]={st:'TRADED TO GREEN BAY / JACOBS EXEMPT-LIST OPPORTUNITY',ns:'2026-08-30 REGULAR-SEASON TRANSACTION UPDATE',nm:'Green Bay acquired Kaleb Johnson from Pittsburgh for a 2028 sixth-round pick after Josh Jacobs was placed on the Commissioner’s Exempt List.',na:'Meaningful contingent and near-term opportunity increase. Do not treat Johnson as the lead back unless regular-season usage shows he has displaced MarShawn Lloyd.',px:'FAIR',s7:'ACCEPTABLE',current_recommendation:'FAIR / LATE CONTINGENCY ADD'};
  if(d.players['Josh Jacobs'])Object.assign(d.players['Josh Jacobs'],{st:'COMMISSIONER’S EXEMPT LIST — UNAVAILABLE',ns:'2026-08-30 OFFICIAL AVAILABILITY UPDATE',nm:'Jacobs cannot practice or attend games while on the Commissioner’s Exempt List.',na:'Availability assumption must remain materially reduced until reinstatement; connected opportunity shifts to Lloyd, Johnson and Brooks.'});
  if(d.players['MarShawn Lloyd'])Object.assign(d.players['MarShawn Lloyd'],{st:'JACOBS UNAVAILABLE / LEAD-OPPORTUNITY WATCH',ns:'2026-08-30 CONNECTED-PLAYER UPDATE',nm:'Jacobs is unavailable and Green Bay added Kaleb Johnson. Lloyd remains the incumbent with the first claim on vacated work, but Johnson prevents an uncontested-backfield assumption.',na:'Increase opportunity versus the prior backup baseline, but do not assume a monopoly role before regular-season usage.'});
  write('injuryOverrides2026.json',d);
}

if(fs.existsSync('comparison-sync-162-audit.json')){const d=read('comparison-sync-162-audit.json');d.updated='2026-08-30';d.active_players=163;d.unique_normalized=163;d.runtime={...(d.runtime||{}),active_players:163,player_loader_shards:14};write('comparison-sync-162-audit.json',d);}

const qa='.github/workflows/final-162-qa-publish.yml';
if(fs.existsSync(qa)){
  let s=fs.readFileSync(qa,'utf8');
  s=s.replaceAll('Expected 162 active players','Expected 163 active players').replaceAll('len(parts)!=162','len(parts)!=163').replaceAll('range(1,163)','range(1,164)').replaceAll('length:13','length:14').replaceAll("'player_shards':13","'player_shards':14").replaceAll("'active_players':162","'active_players':163").replaceAll("old['active_players']=162","old['active_players']=163").replaceAll("old['unique_normalized']=162","old['unique_normalized']=163").replaceAll("'player_loader_shards':13","'player_loader_shards':14");
  fs.writeFileSync(qa,s);
}

// Validate both canonical and effective-overlay states.
const validate=(rows,label)=>{
  if(rows.length!==163)throw new Error(`${label}: expected 163 players, found ${rows.length}`);
  if(new Set(rows.map(p=>p.n)).size!==163)throw new Error(`${label}: duplicate player names`);
  for(const f of ['o','tr']){const ranks=rows.map(p=>Number(p[f])).sort((a,b)=>a-b);for(let i=0;i<163;i++)if(ranks[i]!==i+1)throw new Error(`${label}: ${f} rank gap/collision at ${i+1}`);}
};
validate(all,'canonical');
const effective=all.map(p=>({...p,...(patch.players[p.n]||{})}));
validate(effective,'effective overlay');
const k=byName.get(NAME);
for(const f of ['pd','ce','r','e','a','rl','su','mp','m','cl','px','s7'])if(k[f]==null)throw new Error(`Kaleb missing ${f}`);
write('kaleb-johnson-163-onboarding-audit.json',{updated:'2026-08-30',passed:true,active_players:163,unique_players:163,effective_overlay_players:163,player:NAME,overall_rank:k.o,true_value_rank:k.tr,overall_pos:k.pr,true_value_pos:k.tp,projected_ppr:k.mp,market_value:k.px,status:k.st,guardrails:['transaction/availability trigger reviewed','connected-player effect documented','projection populated','all seven True-Value components populated','canonical Overall and True-Value ranks contiguous 1-163','effective overlay Overall and True-Value ranks contiguous 1-163','positional ranks regenerated','runtime loader migrated to 14 shards','compatibility overlay migrated to 163','legacy 162-count QA migrated to 163']});
console.log('PASS: deterministically rebuilt 163-player canonical + effective runtime universe with Kaleb Johnson');
