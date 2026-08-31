import fs from 'node:fs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,x)=>fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n');
const TARGET=166;

const shards=[];
for(let i=0;i<14;i++) shards.push(read(`players${i}.json`));
const P=shards.flat();
if(P.length!==TARGET) throw new Error(`Expected ${TARGET} players, found ${P.length}`);
const by=new Map(P.map(p=>[p.n,p]));
for(const n of ['Josh Jacobs','MarShawn Lloyd','Kaleb Johnson']) if(!by.has(n)) throw new Error(`Missing ${n}`);

const jacobs=by.get('Josh Jacobs');
Object.assign(jacobs,{
  pd:7.7,ce:7.4,r:7.8,e:8.8,a:4.8,rl:8.0,su:7.6,
  mp:202.0,
  m:'Rush 800-930 yd / 7-9 TD · Rec 26-32 / 210-250 yd / 0-2 TD',
  cl:'Rush 1050-1200 yd / 10-13 TD · Rec 34-40 / 275-325 yd / 1-3 TD',
  px:'FADE',s7:'AVOID',s6:'OVERPRICED',fw:'6.01–7.02',
  st:'COMMISSIONER’S EXEMPT LIST — UNAVAILABLE',
  ns:'2026-08-31 REGULAR-SEASON AVAILABILITY PROPAGATION',
  nm:'The NFL placed Jacobs on the Commissioner’s Exempt List. He cannot practice or attend games while listed. ESPN currently carries an estimated Sept. 27 return, but the league has not set a guaranteed reinstatement date.',
  na:'Reduce season volume and availability immediately. The 202.0 PPR median is a planning estimate that prices roughly three missed games plus reinstatement uncertainty; restore volume only when the league reinstates him.',
  current_recommendation:'FADE / DO NOT PAY PRIOR COST — currently unavailable; reassess on reinstatement',
  projection_context:{...(jacobs.projection_context||{}),prior_projected_ppr:245.5,recalibrated_projected_ppr:202.0,note:'Commissioner Exempt placement is a material season-volume event. Median prices an estimated late-September return while explicitly retaining uncertainty because the NFL has not guaranteed that date.',material_downstream_change:true,old_production_tier:'Strong',new_production_tier:'Solid'}
});

const lloyd=by.get('MarShawn Lloyd');
Object.assign(lloyd,{
  pd:7.4,ce:8.2,r:8.2,e:8.8,a:6.4,rl:6.8,su:7.2,
  mp:142.0,
  m:'Rush 650-760 yd / 5-7 TD · Rec 18-24 / 130-180 yd / 1-2 TD',
  cl:'Rush 900-1050 yd / 8-11 TD · Rec 28-34 / 220-285 yd / 2-4 TD',
  px:'BUY',s7:'TARGET',s6:'CEILING VALUE',fw:'9.01–11.01',
  st:'JACOBS UNAVAILABLE — EARLY LEAD-BACK OPPORTUNITY',
  ns:'2026-08-31 CONNECTED-OPPORTUNITY PROPAGATION',
  nm:'Jacobs is unavailable on the Commissioner’s Exempt List. Green Bay’s initial roster lists Lloyd in the active three-back room with Chris Brooks and newly acquired Kaleb Johnson, and Lloyd has first claim on the vacated early-down work.',
  na:'Upgrade season projection and role materially, but do not model a monopoly. Lloyd keeps an elevated durability discount and Johnson can earn a power/rotation role.',
  current_recommendation:'BUY / PRIORITY LATE RB — immediate lead-opportunity window while Jacobs is unavailable',
  projection_context:{...(lloyd.projection_context||{}),prior_projected_ppr:80.25,recalibrated_projected_ppr:142.0,note:'Connected-player propagation from Jacobs Commissioner Exempt placement. Median assumes Lloyd leads the early committee without receiving a full Jacobs workload monopoly.',material_downstream_change:true,old_production_tier:'Concern',new_production_tier:'Moderate'}
});

const kaleb=by.get('Kaleb Johnson');
Object.assign(kaleb,{
  pd:6.6,ce:7.5,r:7.3,e:8.8,a:9.0,rl:6.1,su:7.0,
  mp:108.0,
  m:'Rush 500-610 yd / 4-6 TD · Rec 10-15 / 70-110 yd / 0-1 TD',
  cl:'Rush 700-850 yd / 7-9 TD · Rec 16-22 / 120-175 yd / 1-2 TD',
  px:'FAIR',s7:'ACCEPTABLE',s6:'CEILING VALUE',fw:'late / waivers',
  st:'JACOBS UNAVAILABLE — ROTATION / POWER-ROLE OPPORTUNITY',
  ns:'2026-08-31 CONNECTED-OPPORTUNITY PROPAGATION',
  nm:'Green Bay traded for Johnson after Jacobs moved to the Commissioner’s Exempt List. The move creates a real near-term rotation and power-role opportunity, but Lloyd retains first claim on lead work.',
  na:'Raise the median modestly from onboarding while keeping Johnson behind Lloyd until regular-season snaps, routes, carries and goal-line work prove otherwise.',
  current_recommendation:'FAIR / LATE CONTINGENCY ADD — role improved, but Lloyd remains ahead entering Week 1',
  projection_context:{...(kaleb.projection_context||{}),prior_projected_ppr:96.5,recalibrated_projected_ppr:108.0,note:'Second-pass Green Bay backfield propagation after Jacobs Commissioner Exempt placement. Increased from initial trade-only median, but capped below Lloyd pending usage evidence.',material_downstream_change:true,old_production_tier:'Concern',new_production_tier:'Concern'}
});

for(const p of [jacobs,lloyd,kaleb]) p.s=Number((p.pd*.35+p.ce*.20+p.r*.15+p.e*.10+p.a*.10+p.rl*.05+p.su*.05).toFixed(3));

function reflow(field,moves){
  const names=Object.keys(moves);
  const ordered=[...P].sort((a,b)=>Number(a[field])-Number(b[field]));
  const picked=new Map(names.map(n=>[n,by.get(n)]));
  const slots=Array(TARGET).fill(null);
  for(const n of names){
    const t=moves[n];
    if(slots[t-1]) throw new Error(`Rank collision ${field} ${t}`);
    slots[t-1]=picked.get(n);
  }
  const rest=ordered.filter(p=>!picked.has(p.n)); let j=0;
  for(let i=0;i<TARGET;i++) if(!slots[i]) slots[i]=rest[j++];
  slots.forEach((p,i)=>p[field]=i+1);
}
reflow('o',{'Josh Jacobs':75,'MarShawn Lloyd':105,'Kaleb Johnson':132});
reflow('tr',{'Josh Jacobs':76,'MarShawn Lloyd':112,'Kaleb Johnson':143});
for(const pos of ['QB','RB','WR','TE']){
  P.filter(p=>p.p===pos).sort((a,b)=>a.o-b.o).forEach((p,i)=>p.pr=`${pos}${i+1}`);
  P.filter(p=>p.p===pos).sort((a,b)=>a.tr-b.tr).forEach((p,i)=>p.tp=`${pos}${i+1}`);
}

let off=0;
for(let i=0;i<14;i++){const n=shards[i].length;write(`players${i}.json`,P.slice(off,off+n));off+=n;}

if(fs.existsSync('current162patch-2026-08-24.json')){
  const d=read('current162patch-2026-08-24.json'); d.players=d.players||{};
  for(const p of P){
    const x=d.players[p.n]||{};
    x.o=p.o;x.tr=p.tr;x.pr=p.pr;x.tp=p.tp;
    if(['Josh Jacobs','MarShawn Lloyd','Kaleb Johnson'].includes(p.n)) Object.assign(x,{pd:p.pd,ce:p.ce,r:p.r,e:p.e,a:p.a,rl:p.rl,su:p.su,s:p.s,mp:p.mp,m:p.m,cl:p.cl,px:p.px,s6:p.s6,s7:p.s7,fw:p.fw,st:p.st,ns:p.ns,nm:p.nm,na:p.na,current_recommendation:p.current_recommendation});
    d.players[p.n]=x;
  }
  d.updated='2026-08-31'; d.packers_backfield_status='JACOBS_EXEMPT_PROPAGATED_LLOYD_UP_KALEB_UP';
  write('current162patch-2026-08-24.json',d);
}

if(fs.existsSync('injuryOverrides2026.json')){
  const d=read('injuryOverrides2026.json');d.updated='2026-08-31';d.players=d.players||{};d.rankMoves=d.rankMoves||{overall:{},trueValue:{}};d.rankMoves.overall=d.rankMoves.overall||{};d.rankMoves.trueValue=d.rankMoves.trueValue||{};
  for(const p of [jacobs,lloyd,kaleb]) d.players[p.n]={...(d.players[p.n]||{}),pd:p.pd,ce:p.ce,r:p.r,e:p.e,a:p.a,rl:p.rl,su:p.su,mp:p.mp,m:p.m,cl:p.cl,px:p.px,s6:p.s6,s7:p.s7,fw:p.fw,st:p.st,ns:p.ns,nm:p.nm,na:p.na,current_recommendation:p.current_recommendation};
  d.rankMoves.overall['Josh Jacobs']=75;d.rankMoves.overall['MarShawn Lloyd']=105;d.rankMoves.overall['Kaleb Johnson']=132;
  d.rankMoves.trueValue['Josh Jacobs']=76;d.rankMoves.trueValue['MarShawn Lloyd']=112;d.rankMoves.trueValue['Kaleb Johnson']=143;
  write('injuryOverrides2026.json',d);
}

if(fs.existsSync('lockedRanks2026.json')){
  const d=read('lockedRanks2026.json');d.players=d.players||{};for(const p of P)d.players[p.n]={...(d.players[p.n]||{}),trueValueRank:p.tr,trueValuePos:p.tp};d.updated='2026-08-31';d.active_players=TARGET;write('lockedRanks2026.json',d);
}

write('packers-jacobs-exempt-update-2026-08-31.json',{
  updated:'2026-08-31',decision:'CHANGE',active_players:TARGET,
  evidence:['NFL Commissioner Exempt — Jacobs cannot practice or attend games','Packers initial roster — Lloyd, Chris Brooks, Kaleb Johnson active; Jacobs exempt','ESPN estimated Jacobs return 2026-09-27; estimate is not a guaranteed NFL reinstatement date'],
  changes:[
    {player:'Josh Jacobs',projection:'245.5→202.0 PPR',overall:'49→75',true_value:'52→76',availability:'6.8→4.8',role:'8.7→7.8',market:'FADE→FADE'},
    {player:'MarShawn Lloyd',projection:'80.25→142.0 PPR',overall:'149→105',true_value:'140→112',role:'6.3→8.2',availability:'5.9→6.4',market:'BUY→BUY'},
    {player:'Kaleb Johnson',projection:'96.5→108.0 PPR',overall:'147→132',true_value:'150→143',role:'6.9→7.3',market:'FAIR→FAIR'}
  ],
  guardrail_note:'Projection changes reflect availability/opportunity mechanism only. Lloyd is not modeled as a monopoly; Johnson remains behind Lloyd pending regular-season usage.'
});

for(const f of ['o','tr']){const a=P.map(p=>p[f]).sort((a,b)=>a-b);a.forEach((v,i)=>{if(v!==i+1)throw new Error(`${f} rank gap at ${i+1}`)});}
console.log(JSON.stringify({
  passed:true,
  Josh_Jacobs:{o:jacobs.o,tr:jacobs.tr,pr:jacobs.pr,tp:jacobs.tp,mp:jacobs.mp,s:jacobs.s},
  MarShawn_Lloyd:{o:lloyd.o,tr:lloyd.tr,pr:lloyd.pr,tp:lloyd.tp,mp:lloyd.mp,s:lloyd.s},
  Kaleb_Johnson:{o:kaleb.o,tr:kaleb.tr,pr:kaleb.pr,tp:kaleb.tp,mp:kaleb.mp,s:kaleb.s}
},null,2));
