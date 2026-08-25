import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const ref=read('data/probability/generated/historical-reference-population-2021-2025.json');
const rows=(ref.rows||[]).filter(r=>r.played!==false&&['RB','WR','TE'].includes(r.position));
const normalize=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

function summarize(rs){
  let targets=0,receptions=0,games=0;
  for(const r of rs){const t=Number(r.targets),y=Number(r.receptions);if(!Number.isFinite(t)||!Number.isFinite(y)||t<0||y<0||y>t)continue;targets+=t;receptions+=y;games++;}
  const p=targets>0?receptions/targets:null;
  let num=0,den=0;
  if(p!=null&&p>0&&p<1){for(const r of rs){const n=Number(r.targets),y=Number(r.receptions);if(!Number.isFinite(n)||!Number.isFinite(y)||n<=1||y<0||y>n)continue;const base=n*p*(1-p);num+=(y-n*p)**2-base;den+=base*(n-1);}}
  const rho=den>0?clamp(num/den,.001,.5):.02;
  return {games,targets,receptions,catch_rate:p,rho};
}

const position_priors={};
for(const pos of ['RB','WR','TE']) position_priors[pos]=summarize(rows.filter(r=>r.position===pos));

const groups=new Map();
for(const r of rows){const key=`${r.position}|${normalize(r.player)}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
const player_priors=[];
for(const rs of groups.values()){
  const pos=rs[0].position,raw=summarize(rs),pp=position_priors[pos];
  if(raw.catch_rate==null||pp.catch_rate==null)continue;
  const weight=clamp(raw.games/30,0,1);
  const catch_rate=weight*raw.catch_rate+(1-weight)*pp.catch_rate;
  player_priors.push({player:rs[0].player,player_key:normalize(rs[0].player),position:pos,games:raw.games,targets:raw.targets,receptions:raw.receptions,raw_catch_rate:raw.catch_rate,player_weight:weight,shrunk_catch_rate:catch_rate,rho:pp.rho,dispersion_source:'position_prior'});
}

const blocked=[];
for(const [pos,p] of Object.entries(position_priors)){
  if(p.games<500)blocked.push(`${pos} catch-rate sample too small: ${p.games}`);
  if(!(p.catch_rate>0&&p.catch_rate<1))blocked.push(`${pos} invalid catch rate`);
  if(!(p.rho>0&&p.rho<=.5))blocked.push(`${pos} invalid rho`);
}
for(const p of player_priors)if(!(p.shrunk_catch_rate>0&&p.shrunk_catch_rate<1))blocked.push(`${p.player} invalid shrunk catch rate`);
if(ref.live_player_universe_count!==162)blocked.push('live player universe changed');

const generated_at=new Date().toISOString();
const output={schema_version:'1.0.0',generated_at,mode:'SHADOW_ONLY',actionable:false,history_window:[2021,2022,2023,2024,2025],sportsbook_inputs_used:false,method:{catch_rate:'player catch rate shrunk toward position prior by games/30, capped at 1.0',dispersion:'position-level beta-binomial rho estimated from prior game residual overdispersion',sample_policy:'30+ games player-specific catch rate; 15-29 blended; <15 prior-dominant'},position_priors,player_priors};
const report={generated_at,result:blocked.length?'BLOCKED':'PASS',mode:'SHADOW_ONLY',actionable:false,players:player_priors.length,position_priors,blocked,sportsbook_inputs_used:false};
fs.writeFileSync(path.join(root,'data/probability/generated/catch-rate-priors-2021-2025.json'),JSON.stringify(output,null,2)+'\n');
fs.writeFileSync(path.join(root,'guardrails/catch-rate-priors-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);
