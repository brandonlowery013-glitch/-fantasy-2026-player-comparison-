import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const ref=read('data/probability/generated/historical-reference-population-2021-2025.json');
const rows=(ref.rows||[]).filter(r=>r.played!==false&&['RB','WR','TE'].includes(r.position));
const normalize=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

const MIN_PLAYER_TARGETS_FOR_PRIOR=25;
const MIN_TARGET_GAMES_FOR_PRIOR=5;
const TARGET_SHRINKAGE_STRENGTH=50;

function summarize(rs){
  let targets=0,receptions=0,games=0,targetGames=0;
  for(const r of rs){
    const t=Number(r.targets),y=Number(r.receptions);
    if(!Number.isFinite(t)||!Number.isFinite(y)||t<0||y<0||y>t)continue;
    targets+=t;receptions+=y;games++;
    if(t>0)targetGames++;
  }
  const p=targets>0?receptions/targets:null;
  let num=0,den=0;
  if(p!=null&&p>0&&p<1){
    for(const r of rs){
      const n=Number(r.targets),y=Number(r.receptions);
      if(!Number.isFinite(n)||!Number.isFinite(y)||n<=1||y<0||y>n)continue;
      const base=n*p*(1-p);
      num+=(y-n*p)**2-base;
      den+=base*(n-1);
    }
  }
  const rho=den>0?clamp(num/den,.001,.5):.02;
  return {games,target_games:targetGames,targets,receptions,catch_rate:p,rho};
}

const groups=new Map();
for(const r of rows){
  const key=`${r.position}|${normalize(r.player)}`;
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(r);
}

const groupSummaries=[];
for(const rs of groups.values()){
  const summary=summarize(rs);
  groupSummaries.push({position:rs[0].position,player:rs[0].player,player_key:normalize(rs[0].player),rows:rs,summary});
}

const eligibleGroups=groupSummaries.filter(g=>g.summary.targets>=MIN_PLAYER_TARGETS_FOR_PRIOR&&g.summary.target_games>=MIN_TARGET_GAMES_FOR_PRIOR);
const excludedLowOpportunity=groupSummaries.filter(g=>!eligibleGroups.includes(g));

const position_priors={};
for(const pos of ['RB','WR','TE']){
  const eligibleRows=eligibleGroups.filter(g=>g.position===pos).flatMap(g=>g.rows);
  position_priors[pos]=summarize(eligibleRows);
  position_priors[pos].eligible_players=eligibleGroups.filter(g=>g.position===pos).length;
  position_priors[pos].excluded_low_opportunity_players=excludedLowOpportunity.filter(g=>g.position===pos).length;
}

const player_priors=[];
for(const g of eligibleGroups){
  const pos=g.position,raw=g.summary,pp=position_priors[pos];
  if(raw.catch_rate==null||pp.catch_rate==null)continue;
  const weight=clamp(raw.targets/(raw.targets+TARGET_SHRINKAGE_STRENGTH),0,1);
  const catch_rate=weight*raw.catch_rate+(1-weight)*pp.catch_rate;
  player_priors.push({
    player:g.player,player_key:g.player_key,position:pos,
    games:raw.games,target_games:raw.target_games,targets:raw.targets,receptions:raw.receptions,
    raw_catch_rate:raw.catch_rate,player_weight:weight,shrunk_catch_rate:catch_rate,
    rho:pp.rho,dispersion_source:'role-filtered_position_prior',
    eligibility:{min_targets:MIN_PLAYER_TARGETS_FOR_PRIOR,min_target_games:MIN_TARGET_GAMES_FOR_PRIOR}
  });
}

const blocked=[];
for(const [pos,p] of Object.entries(position_priors)){
  if(p.eligible_players<25)blocked.push(`${pos} eligible catch-rate player sample too small: ${p.eligible_players}`);
  if(p.targets<500)blocked.push(`${pos} eligible catch-rate target sample too small: ${p.targets}`);
  if(!(p.catch_rate>0&&p.catch_rate<1))blocked.push(`${pos} invalid catch rate`);
  if(!(p.rho>0&&p.rho<=.5))blocked.push(`${pos} invalid rho`);
}
for(const p of player_priors){
  if(!(p.shrunk_catch_rate>0&&p.shrunk_catch_rate<1))blocked.push(`${p.player} invalid shrunk catch rate`);
  if(p.targets<MIN_PLAYER_TARGETS_FOR_PRIOR)blocked.push(`${p.player} below target eligibility threshold`);
}
if(ref.live_player_universe_count!==162)blocked.push('live player universe changed');

const generated_at=new Date().toISOString();
const output={
  schema_version:'1.1.0',generated_at,mode:'SHADOW_ONLY',actionable:false,
  history_window:[2021,2022,2023,2024,2025],sportsbook_inputs_used:false,
  method:{
    eligibility:`player-specific and position-prior pool requires >=${MIN_PLAYER_TARGETS_FOR_PRIOR} career targets and >=${MIN_TARGET_GAMES_FOR_PRIOR} games with at least one target`,
    catch_rate:'position prior is opportunity-weighted by targets because it is computed from aggregate eligible-player targets/receptions',
    player_shrinkage:`player catch rate shrunk toward filtered position prior using targets/(targets+${TARGET_SHRINKAGE_STRENGTH})`,
    dispersion:'position-level beta-binomial rho estimated only from eligible receiving-role player-games',
    low_opportunity_policy:'players below the eligibility threshold do not influence the filtered position prior or receive a player-specific catch-rate prior; downstream models must use the position prior until sufficient receiving opportunity exists'
  },
  thresholds:{min_player_targets_for_prior:MIN_PLAYER_TARGETS_FOR_PRIOR,min_target_games_for_prior:MIN_TARGET_GAMES_FOR_PRIOR,target_shrinkage_strength:TARGET_SHRINKAGE_STRENGTH},
  position_priors,player_priors,
  excluded_low_opportunity_players:excludedLowOpportunity.map(g=>({player:g.player,position:g.position,targets:g.summary.targets,target_games:g.summary.target_games}))
};
const report={
  generated_at,result:blocked.length?'BLOCKED':'PASS',mode:'SHADOW_ONLY',actionable:false,
  eligible_players:player_priors.length,excluded_low_opportunity_players:excludedLowOpportunity.length,
  thresholds:output.thresholds,position_priors,blocked,sportsbook_inputs_used:false,
  safeguards:[
    'Fringe players with trivial receiving opportunity are excluded from both player-specific priors and the position-prior estimation pool.',
    'Receiving opportunity, not games appeared, determines player-specific confidence.',
    'Position catch rate is target-weighted, so high-volume receiving roles contribute proportionally more than low-volume roles.',
    'Low-opportunity players fall back to the filtered position prior rather than creating unstable player-specific estimates.',
    'No sportsbook data is used.'
  ]
};
fs.writeFileSync(path.join(root,'data/probability/generated/catch-rate-priors-2021-2025.json'),JSON.stringify(output,null,2)+'\n');
fs.writeFileSync(path.join(root,'guardrails/catch-rate-priors-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);
