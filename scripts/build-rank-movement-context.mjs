import fs from 'node:fs';
import cp from 'node:child_process';

const currentRef=process.argv[2]||null;
const baselineRef=process.argv[3]||process.env.RANK_BASE_REF||'HEAD^';
const readJson=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const show=(ref,p)=>JSON.parse(cp.execFileSync('git',['show',`${ref}:${p}`],{encoding:'utf8'}));
const shardPaths=()=>fs.readdirSync('.').filter(x=>/^players\d+\.json$/.test(x)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));

function loadCurrent(){
  const players=shardPaths().flatMap(readJson).map(x=>({...x}));
  const overrides=fs.existsSync('injuryOverrides2026.json')?readJson('injuryOverrides2026.json'):{players:{},rankMoves:{}};
  return effective(players,overrides);
}
function loadRef(ref){
  const paths=shardPaths();
  const players=[];
  for(const p of paths){try{players.push(...show(ref,p));}catch{/* shard did not exist in baseline */}}
  let overrides={players:{},rankMoves:{}};
  try{overrides=show(ref,'injuryOverrides2026.json')}catch{}
  return effective(players.map(x=>({...x})),overrides);
}
function reflow(P,field,moves={}){
  const names=Object.keys(moves||{}).filter(n=>P.some(p=>p.n===n));
  if(!names.length)return;
  const ordered=[...P].sort((a,b)=>(a[field]??9999)-(b[field]??9999));
  const picked=new Map(ordered.filter(p=>names.includes(p.n)).map(p=>[p.n,p]));
  const slots=Array(ordered.length).fill(null);
  for(const n of names){
    const t=Math.max(1,Math.min(ordered.length,Math.round(Number(moves[n]))));
    if(slots[t-1])throw new Error(`rank collision ${field} ${t}`);
    slots[t-1]=picked.get(n);
  }
  const rest=ordered.filter(p=>!names.includes(p.n)); let j=0;
  for(let i=0;i<slots.length;i++)if(!slots[i])slots[i]=rest[j++];
  slots.forEach((p,i)=>p[field]=i+1);
}
function effective(players,overrides){
  const by=new Map(players.map(p=>[p.n,p]));
  for(const [n,x] of Object.entries(overrides.players||{}))if(by.has(n))Object.assign(by.get(n),x);
  reflow(players,'o',overrides.rankMoves?.overall||{});
  reflow(players,'tr',overrides.rankMoves?.trueValue||{});
  return players;
}
const cur=loadCurrent(), base=loadRef(baselineRef);
const baseBy=new Map(base.map(p=>[p.n,p]));
const direction=(from,to)=>from==null?'NEW':to<from?'UP':to>from?'DOWN':'HOLD';
const movement=(from,to)=>({from:from??null,to:to??null,delta:from==null?null:Math.abs(Number(to)-Number(from)),direction:direction(from,to)});
const rows=[];
for(const p of cur){
  const b=baseBy.get(p.n);
  const overall=movement(b?.o,p.o), trueValue=movement(b?.tr,p.tr);
  const newsSource=p.ns||null, newsSummary=p.nm||null, actionNote=p.na||null, status=p.st||null;
  const moved=overall.direction!=='HOLD'||trueValue.direction!=='HOLD';
  const hasNews=Boolean(newsSource||newsSummary||actionNote||(status&&status!=='PASS'));
  if(!moved&&!hasNews)continue;
  rows.push({
    player:p.n,position:p.p,team:p.t,
    overall,true_value:trueValue,
    material_rank_move:Math.max(overall.delta||0,trueValue.delta||0)>=5,
    news:{source:newsSource,summary:newsSummary,action:actionNote,status},
    market:{label:p.px||null,preferred_range:p.fw||null},
    generated_from:{baseline:baselineRef,current:currentRef||'WORKTREE'}
  });
}
rows.sort((a,b)=>(a.overall.to??9999)-(b.overall.to??9999));
const out={
  season:2026,
  generated_at:new Date().toISOString(),
  baseline_ref:baselineRef,
  active_players:cur.length,
  rule:'Arrows represent actual saved rank movement only; HOLD news gets context without a directional arrow.',
  players:rows
};
fs.writeFileSync('rankMovement2026.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({active_players:cur.length,context_players:rows.length,movers:rows.filter(x=>x.overall.direction!=='HOLD'||x.true_value.direction!=='HOLD').length,output:'rankMovement2026.json'},null,2));
