import fs from 'node:fs';

const read = p => JSON.parse(fs.readFileSync(p,'utf8'));
const write = (p,x) => fs.writeFileSync(p, JSON.stringify(x,null,2)+'\n');

const OVERALL_TARGET = 147;
const TRUE_TARGET = 150;
const NAME = 'Kaleb Johnson';

// Load existing 162-player universe and the new shard.
const shards=[];
for(let i=0;i<13;i++) shards.push(read(`players${i}.json`));
const add=read('players13.json');
if(add.length!==1 || add[0].n!==NAME) throw new Error('players13.json must contain Kaleb Johnson only');
const existing=shards.flat();
if(existing.some(p=>p.n===NAME)) throw new Error('Kaleb Johnson already exists in legacy shards');
if(existing.length!==162) throw new Error(`Expected 162 legacy players, found ${existing.length}`);

// Insert Overall rank 147 and shift every player at/behind that slot.
for(const p of existing){ if(Number(p.o)>=OVERALL_TARGET) p.o=Number(p.o)+1; }
add[0].o=OVERALL_TARGET;

// Insert True-Value rank 150 and shift every player at/behind that slot.
for(const p of existing){ if(Number(p.tr)>=TRUE_TARGET) p.tr=Number(p.tr)+1; }
add[0].tr=TRUE_TARGET;

// Recompute positional rank labels independently for Overall and True Value.
const all=[...existing,...add];
for(const pos of ['QB','RB','WR','TE']){
  const overall=all.filter(p=>p.p===pos).sort((a,b)=>a.o-b.o);
  overall.forEach((p,i)=>p.pr=`${pos}${i+1}`);
  const tv=all.filter(p=>p.p===pos).sort((a,b)=>a.tr-b.tr);
  tv.forEach((p,i)=>p.tp=`${pos}${i+1}`);
}

// Write legacy shards back without changing membership; new player stays in shard 13.
let offset=0;
for(let i=0;i<13;i++){
  const n=shards[i].length;
  write(`players${i}.json`, existing.slice(offset,offset+n));
  offset+=n;
}
write('players13.json',add);

// Runtime now loads 14 shards.
for(const htmlPath of ['index-backup.html']){
  let s=fs.readFileSync(htmlPath,'utf8');
  s=s.replace('Array.from({length:13}', 'Array.from({length:14}');
  fs.writeFileSync(htmlPath,s);
}

// Keep locked True-Value ranks synchronized if that file exists.
if(fs.existsSync('lockedRanks2026.json')){
  const d=read('lockedRanks2026.json');
  const players=d.players||{};
  for(const [n,x] of Object.entries(players)){
    if(Number(x.trueValueRank)>=TRUE_TARGET) x.trueValueRank=Number(x.trueValueRank)+1;
  }
  const rbPos=all.filter(p=>p.p==='RB').sort((a,b)=>a.tr-b.tr).findIndex(p=>p.n===NAME)+1;
  players[NAME]={trueValueRank:TRUE_TARGET,trueValuePos:`RB${rbPos}`};
  d.updated='2026-08-30';
  d.active_players=163;
  write('lockedRanks2026.json',d);
}

// Add current connected-player context without forcing an unsupported Lloyd takeover assumption.
if(fs.existsSync('injuryOverrides2026.json')){
  const d=read('injuryOverrides2026.json');
  d.updated='2026-08-30';
  d.players=d.players||{};
  d.players[NAME]={
    st:'TRADED TO GREEN BAY / JACOBS EXEMPT-LIST OPPORTUNITY',
    ns:'2026-08-30 REGULAR-SEASON TRANSACTION UPDATE',
    nm:'Green Bay acquired Kaleb Johnson from Pittsburgh for a 2028 sixth-round pick after Josh Jacobs was placed on the Commissioner’s Exempt List.',
    na:'Meaningful contingent and near-term opportunity increase. Do not treat Johnson as the lead back unless regular-season usage shows he has displaced MarShawn Lloyd.',
    px:'FAIR', s7:'ACCEPTABLE', current_recommendation:'FAIR / LATE CONTINGENCY ADD'
  };
  if(d.players['Josh Jacobs']) Object.assign(d.players['Josh Jacobs'],{
    st:'COMMISSIONER’S EXEMPT LIST — UNAVAILABLE',
    ns:'2026-08-30 OFFICIAL AVAILABILITY UPDATE',
    nm:'Jacobs cannot practice or attend games while on the Commissioner’s Exempt List.',
    na:'Availability assumption must remain materially reduced until reinstatement; connected opportunity shifts to Lloyd, Johnson and Brooks.'
  });
  if(d.players['MarShawn Lloyd']) Object.assign(d.players['MarShawn Lloyd'],{
    st:'JACOBS UNAVAILABLE / LEAD-OPPORTUNITY WATCH',
    ns:'2026-08-30 CONNECTED-PLAYER UPDATE',
    nm:'Jacobs is unavailable and Green Bay added Kaleb Johnson. Lloyd remains the incumbent with the first claim on vacated work, but Johnson prevents an uncontested-backfield assumption.',
    na:'Increase opportunity versus the prior backup baseline, but do not assume a monopoly role before regular-season usage.'
  });
  write('injuryOverrides2026.json',d);
}

// Update common audit metadata when present.
for(const p of ['comparison-sync-162-audit.json']){
  if(fs.existsSync(p)){
    const d=read(p); d.updated='2026-08-30'; d.active_players=163; d.unique_normalized=163;
    d.runtime={...(d.runtime||{}),active_players:163,player_loader_shards:14};
    write(p,d);
  }
}

// Patch hard-coded final QA workflow from 162 to 163 and 13 to 14.
const qa='.github/workflows/final-162-qa-publish.yml';
if(fs.existsSync(qa)){
  let s=fs.readFileSync(qa,'utf8');
  s=s.replaceAll('Expected 162 active players','Expected 163 active players');
  s=s.replaceAll('found {len(parts)}','found {len(parts)}');
  s=s.replaceAll('len(parts)!=162','len(parts)!=163');
  s=s.replaceAll('range(1,163)','range(1,164)');
  s=s.replaceAll('length:13','length:14');
  s=s.replaceAll("'player_shards':13","'player_shards':14");
  s=s.replaceAll("'active_players':162","'active_players':163");
  s=s.replaceAll("old['active_players']=162","old['active_players']=163");
  s=s.replaceAll("old['unique_normalized']=162","old['unique_normalized']=163");
  s=s.replaceAll("'player_loader_shards':13","'player_loader_shards':14");
  fs.writeFileSync(qa,s);
}

// Onboarding regression audit.
const names=all.map(p=>p.n);
if(all.length!==163) throw new Error(`Universe count failed: ${all.length}`);
if(new Set(names).size!==163) throw new Error('Duplicate player name after onboarding');
if(!all.find(p=>p.n===NAME)) throw new Error('Kaleb missing after onboarding');
for(const field of ['o','tr']){
  const ranks=all.map(p=>p[field]).sort((a,b)=>a-b);
  for(let i=0;i<163;i++) if(ranks[i]!==i+1) throw new Error(`${field} ranks not contiguous 1-163 at ${i+1}`);
}
const k=all.find(p=>p.n===NAME);
for(const f of ['pd','ce','r','e','a','rl','su','mp','m','cl','px','s7']) if(k[f]==null) throw new Error(`Kaleb missing ${f}`);
write('kaleb-johnson-163-onboarding-audit.json',{
  updated:'2026-08-30',passed:true,active_players:163,unique_players:163,
  player:NAME,overall_rank:k.o,true_value_rank:k.tr,overall_pos:k.pr,true_value_pos:k.tp,
  projected_ppr:k.mp,market_value:k.px,status:k.st,
  guardrails:[
    'transaction/availability trigger reviewed',
    'connected-player effect documented',
    'projection populated',
    'all seven True-Value components populated',
    'Overall and True-Value ranks contiguous 1-163',
    'positional ranks regenerated',
    'runtime loader migrated to 14 shards',
    'legacy 162-count QA migrated to 163'
  ]
});
console.log('PASS: migrated universe to 163 with Kaleb Johnson');
