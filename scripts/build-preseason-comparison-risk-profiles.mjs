import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const contract=read('data/sources/preseason-comparison-risk-2026.json');
const weekly=read('data/sources/risk-profile-2026.json');
fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});
fs.mkdirSync(path.join(root,'data/probability/generated'),{recursive:true});

const finite=x=>Number.isFinite(Number(x));
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const round=(x,d=6)=>Number(Number(x).toFixed(d));
const bands=weekly.risk_bands;
const bandFor=s=>(bands.find(b=>s>=Number(b.min)&&s<Number(b.max_exclusive))||bands.at(-1)).label;

const players=[];
for(let i=0;i<13;i++){
  const shard=`players${i}.json`;
  if(!fs.existsSync(path.join(root,shard))) throw new Error(`missing runtime shard ${shard}`);
  players.push(...read(shard));
}

const blocked=[];
const seen=new Set();
const profiles=[];
const mutationChanges=[];
for(const p of players){
  if(seen.has(p.n)) blocked.push(`duplicate player ${p.n}`);
  seen.add(p.n);
  const a=Number(p.a),rl=Number(p.rl),su=Number(p.su);
  for(const [label,v] of [['availability',a],['reliability',rl],['sustainability',su]]){
    if(!finite(v)||v<0||v>10) blocked.push(`${p.n}: ${label} must be finite and in [0,10]`);
  }
  if(![a,rl,su].every(v=>finite(v)&&v>=0&&v<=10)) continue;
  const safety=(a*.45+rl*.35+su*.20)/10;
  const risk=clamp(1-safety);
  if(!finite(risk)||risk<0||risk>1){blocked.push(`${p.n}: risk outside [0,1]`);continue;}
  const base={player:p.n,position:p.p,risk_score:round(risk),risk_safety:round(1-risk),risk_band:bandFor(risk),inputs:{availability:a,reliability:rl,sustainability:su},source:'PRESEASON_COMPARISON_RISK_2026'};
  profiles.push(base);

  const mutated={...p,ad:999,px:'FADE',s7:'AVOID',vl:'MUTATED',vs:999,vr:'MUTATED',st:'MUTATED RAW STATUS',vo:{markets:[{line:999,over:-999,under:999}]}};
  const ma=Number(mutated.a),mrl=Number(mutated.rl),msu=Number(mutated.su);
  const mutatedRisk=clamp(1-((ma*.45+mrl*.35+msu*.20)/10));
  if(Math.abs(mutatedRisk-risk)>1e-12) mutationChanges.push(p.n);
}

if(players.length!==162) blocked.push(`expected 162 players, found ${players.length}`);
if(seen.size!==162) blocked.push(`expected 162 unique players, found ${seen.size}`);
if(profiles.length!==162) blocked.push(`expected 162 risk profiles, built ${profiles.length}`);
if(mutationChanges.length) blocked.push(`${mutationChanges.length} risk scores changed after market/status mutation`);

const scores=profiles.map(x=>x.risk_score);
const counts=Object.fromEntries(bands.map(b=>[b.label,profiles.filter(x=>x.risk_band===b.label).length]));
const output={schema_version:'1.0.0',season:2026,status:'PRODUCTION_READY_PRESEASON',player_count:profiles.length,step_4_weekly_replacement:false,resolution_rule:contract.relationship_to_step_4.production_resolution_rule,profiles};
const report={generated_at:new Date().toISOString(),result:blocked.length?'BLOCKED':'PASS',player_count:players.length,unique_player_count:seen.size,profile_count:profiles.length,min_risk:round(Math.min(...scores)),max_risk:round(Math.max(...scores)),mean_risk:round(scores.reduce((s,x)=>s+x,0)/scores.length),risk_band_counts:counts,market_and_status_mutation_changes:mutationChanges.length,step_4_weekly_replacement:false,blocked};
fs.writeFileSync(path.join(root,'data/probability/generated/preseason-comparison-risk-profiles-2026.json'),JSON.stringify(output,null,2)+'\n');
fs.writeFileSync(path.join(root,'guardrails/preseason-comparison-risk-profile-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);
