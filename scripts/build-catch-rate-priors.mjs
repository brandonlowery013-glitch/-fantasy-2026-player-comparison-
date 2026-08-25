import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const ref=read('data/probability/generated/historical-reference-population-2021-2025.json');
const rows=(ref.rows||[]).filter(r=>r.played!==false&&['RB','WR','TE'].includes(r.position));
const normalize=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

// Until full historical route participation is available, use a deliberately strict
// player-season receiving-workload proxy. This is not labeled as actual full-time route share.
const ROLE_PROXY={
  WR:{min_targets:70,min_target_games:12,min_targets_per_target_game:4.5,label:'FULL_TIME_RECEIVING_ROLE_PROXY'},
  TE:{min_targets:45,min_target_games:10,min_targets_per_target_game:3.5,label:'RECEIVING_TE_ROLE_PROXY'},
  RB:{min_targets:30,min_target_games:10,min_targets_per_target_game:2.5,label:'RECEIVING_BACK_ROLE_PROXY'}
};
const TARGET_SHRINKAGE_STRENGTH=75;

function summarize(rs){
  let targets=0,receptions=0,games=0,targetGames=0;
  for(const r of rs){
    const t=Number(r.targets),y=Number(r.receptions);
    if(!Number.isFinite(t)||!Number.isFinite(y)||t<0||y<0||y>t)continue;
    targets+=t;receptions+=y;games++;
    if(t>0)targetGames++;
  }
  const p=targets>0?receptions/targets:null;
  const tptg=targetGames>0?targets/targetGames:0;
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
  return {games,target_games:targetGames,targets,receptions,targets_per_target_game:tptg,catch_rate:p,rho};
}

const seasonGroups=new Map();
for(const r of rows){
  const key=`${r.position}|${normalize(r.player)}|${r.season}`;
  if(!seasonGroups.has(key))seasonGroups.set(key,[]);
  seasonGroups.get(key).push(r);
}

const playerSeasons=[];
for(const rs of seasonGroups.values()){
  const summary=summarize(rs),position=rs[0].position,rule=ROLE_PROXY[position];
  const eligible=summary.targets>=rule.min_targets&&summary.target_games>=rule.min_target_games&&summary.targets_per_target_game>=rule.min_targets_per_target_game;
  playerSeasons.push({position,player:rs[0].player,player_key:normalize(rs[0].player),season:Number(rs[0].season),rows:rs,summary,eligible,role_proxy:rule.label});
}

const eligibleSeasons=playerSeasons.filter(x=>x.eligible);
const excludedSeasons=playerSeasons.filter(x=>!x.eligible);

const position_priors={};
for(const pos of ['RB','WR','TE']){
  const eligibleRows=eligibleSeasons.filter(x=>x.position===pos).flatMap(x=>x.rows);
  position_priors[pos]=summarize(eligibleRows);
  position_priors[pos].eligible_player_seasons=eligibleSeasons.filter(x=>x.position===pos).length;
  position_priors[pos].eligible_unique_players=new Set(eligibleSeasons.filter(x=>x.position===pos).map(x=>x.player_key)).size;
  position_priors[pos].excluded_player_seasons=excludedSeasons.filter(x=>x.position===pos).length;
  position_priors[pos].role_proxy=ROLE_PROXY[pos];
}

// Player-specific priors use only seasons in which that player met the receiving-role proxy.
// Fringe seasons are deliberately excluded rather than diluting a meaningful-role prior.
const eligiblePlayerGroups=new Map();
for(const s of eligibleSeasons){
  const key=`${s.position}|${s.player_key}`;
  if(!eligiblePlayerGroups.has(key))eligiblePlayerGroups.set(key,[]);
  eligiblePlayerGroups.get(key).push(...s.rows);
}

const player_priors=[];
for(const [key,rs] of eligiblePlayerGroups){
  const [pos,playerKey]=key.split('|');
  const raw=summarize(rs),pp=position_priors[pos];
  if(raw.catch_rate==null||pp.catch_rate==null)continue;
  const weight=clamp(raw.targets/(raw.targets+TARGET_SHRINKAGE_STRENGTH),0,1);
  const catch_rate=weight*raw.catch_rate+(1-weight)*pp.catch_rate;
  const seasons=[...new Set(rs.map(r=>Number(r.season)))].sort();
  player_priors.push({
    player:rs[0].player,player_key:playerKey,position:pos,eligible_seasons:seasons,
    games:raw.games,target_games:raw.target_games,targets:raw.targets,receptions:raw.receptions,
    raw_catch_rate:raw.catch_rate,player_weight:weight,shrunk_catch_rate:catch_rate,
    rho:pp.rho,dispersion_source:'receiving-role-filtered_position_prior',role_proxy:ROLE_PROXY[pos].label
  });
}

const blocked=[];
for(const [pos,p] of Object.entries(position_priors)){
  if(p.eligible_player_seasons<25)blocked.push(`${pos} receiving-role player-season sample too small: ${p.eligible_player_seasons}`);
  if(p.eligible_unique_players<15)blocked.push(`${pos} receiving-role unique-player sample too small: ${p.eligible_unique_players}`);
  if(p.targets<1000)blocked.push(`${pos} receiving-role target sample too small: ${p.targets}`);
  if(!(p.catch_rate>0&&p.catch_rate<1))blocked.push(`${pos} invalid catch rate`);
  if(!(p.rho>0&&p.rho<=.5))blocked.push(`${pos} invalid rho`);
}
for(const p of player_priors)if(!(p.shrunk_catch_rate>0&&p.shrunk_catch_rate<1))blocked.push(`${p.player} invalid shrunk catch rate`);
if(ref.live_player_universe_count!==162)blocked.push('live player universe changed');

const generated_at=new Date().toISOString();
const output={
  schema_version:'1.2.0',generated_at,mode:'SHADOW_ONLY',actionable:false,
  history_window:[2021,2022,2023,2024,2025],sportsbook_inputs_used:false,
  method:{
    cohort_unit:'player-season, not career accumulation',
    role_proxy:'Until broad historical route-share coverage is available, strict target workload by player-season is used only as a receiving-role proxy. It must not be described as observed full-time route participation.',
    wr:'WR prior includes only seasons with >=70 targets, >=12 games with a target, and >=4.5 targets per target-game.',
    te:'TE prior includes only seasons with >=45 targets, >=10 games with a target, and >=3.5 targets per target-game.',
    rb:'RB reception prior uses a receiving-back cohort only: >=30 targets, >=10 games with a target, and >=2.5 targets per target-game.',
    catch_rate:'position prior is opportunity-weighted because it is computed from aggregate eligible-role targets and receptions',
    player_shrinkage:`player catch rate uses only eligible-role seasons and shrinks toward the role-filtered position prior via targets/(targets+${TARGET_SHRINKAGE_STRENGTH})`,
    dispersion:'beta-binomial rho is estimated only from eligible receiving-role player-games',
    excluded_population:'fringe/rotational player-seasons remain in the historical database for other uses but do not shape this catch-rate/reception prior'
  },
  role_proxy_thresholds:ROLE_PROXY,
  target_shrinkage_strength:TARGET_SHRINKAGE_STRENGTH,
  position_priors,player_priors,
  excluded_player_seasons:excludedSeasons.map(x=>({player:x.player,position:x.position,season:x.season,targets:x.summary.targets,target_games:x.summary.target_games,targets_per_target_game:x.summary.targets_per_target_game}))
};
const report={
  generated_at,result:blocked.length?'BLOCKED':'PASS',mode:'SHADOW_ONLY',actionable:false,
  eligible_player_priors:player_priors.length,eligible_player_seasons:eligibleSeasons.length,excluded_player_seasons:excludedSeasons.length,
  role_proxy_thresholds:ROLE_PROXY,position_priors,blocked,sportsbook_inputs_used:false,
  safeguards:[
    'Catch-rate priors are built from meaningful receiving-role player-seasons, not every historical WR/RB/TE.',
    'Career accumulation cannot qualify a fringe player; eligibility is evaluated separately for each season.',
    'WR and TE fringe/rotational seasons are excluded from the foundational catch-rate cohort.',
    'RB reception priors use a receiving-back cohort rather than all RBs or a generic full-time-RB pool.',
    'Player-specific catch rates use only seasons that met the role proxy and remain shrunk toward the role-filtered position prior.',
    'The target-workload proxy is temporary and explicitly not called observed route participation.',
    'No sportsbook data is used.'
  ]
};
fs.writeFileSync(path.join(root,'data/probability/generated/catch-rate-priors-2021-2025.json'),JSON.stringify(output,null,2)+'\n');
fs.writeFileSync(path.join(root,'guardrails/catch-rate-priors-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);
