import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const ref=read('data/probability/generated/historical-reference-population-2021-2025.json');
const roles=read('data/probability/generated/role-cohort-priors-2021-2025.json');
const sourceOfTruth=read('MODEL_SOURCE_OF_TRUTH.json');
const guardrailConfig=read('guardrails/guardrails-config.json');
const authoritativeUniverse=Number(guardrailConfig.authoritative_player_count);
const modelUniverse=Number(sourceOfTruth.active_player_model);
const rows=(ref.rows||[]).filter(r=>r.played!==false&&['RB','WR','TE'].includes(r.position));
const normalize=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const TARGET_SHRINKAGE_STRENGTH=75;
const RB_PROXY={min_targets:30,min_target_games:10,min_targets_per_target_game:2.5,label:'RECEIVING_BACK_ROLE_PROXY'};

const observedRoleKeys=new Set();
for(const m of roles.memberships||[]){
  if((m.cohort==='WR_FULL_TIME'&&m.position==='WR')||(m.cohort==='TE_RECEIVING'&&m.position==='TE'))observedRoleKeys.add(`${m.player_id}|${m.season}`);
}

function summarize(rs){
  let targets=0,receptions=0,games=0,targetGames=0;
  for(const r of rs){const t=Number(r.targets),y=Number(r.receptions);if(!Number.isFinite(t)||!Number.isFinite(y)||t<0||y<0||y>t)continue;targets+=t;receptions+=y;games++;if(t>0)targetGames++;}
  const p=targets>0?receptions/targets:null;const tptg=targetGames>0?targets/targetGames:0;let num=0,den=0;
  if(p!=null&&p>0&&p<1)for(const r of rs){const n=Number(r.targets),y=Number(r.receptions);if(!Number.isFinite(n)||!Number.isFinite(y)||n<=1||y<0||y>n)continue;const base=n*p*(1-p);num+=(y-n*p)**2-base;den+=base*(n-1);}
  const rho=den>0?clamp(num/den,.001,.5):.02;return {games,target_games:targetGames,targets,receptions,targets_per_target_game:tptg,catch_rate:p,rho};
}

const seasonGroups=new Map();
for(const r of rows){const key=`${r.position}|${r.player_id}|${r.season}`;if(!seasonGroups.has(key))seasonGroups.set(key,[]);seasonGroups.get(key).push(r);}
const playerSeasons=[];
for(const rs of seasonGroups.values()){
  const summary=summarize(rs),position=rs[0].position,playerId=rs[0].player_id,season=Number(rs[0].season);let eligible=false,role_basis='';
  if(position==='WR'){eligible=observedRoleKeys.has(`${playerId}|${season}`);role_basis='WR_FULL_TIME_OBSERVED_PASS_PLAY_ROLE';}
  else if(position==='TE'){eligible=observedRoleKeys.has(`${playerId}|${season}`);role_basis='TE_RECEIVING_OBSERVED_PASS_PLAY_ROLE';}
  else {eligible=summary.targets>=RB_PROXY.min_targets&&summary.target_games>=RB_PROXY.min_target_games&&summary.targets_per_target_game>=RB_PROXY.min_targets_per_target_game;role_basis=RB_PROXY.label;}
  playerSeasons.push({position,player:rs[0].player,player_id:playerId,player_key:normalize(rs[0].player),season,rows:rs,summary,eligible,role_basis});
}
const eligibleSeasons=playerSeasons.filter(x=>x.eligible),excludedSeasons=playerSeasons.filter(x=>!x.eligible);
const position_priors={};
for(const pos of ['RB','WR','TE']){
  const ps=eligibleSeasons.filter(x=>x.position===pos),eligibleRows=ps.flatMap(x=>x.rows);position_priors[pos]=summarize(eligibleRows);position_priors[pos].eligible_player_seasons=ps.length;position_priors[pos].eligible_unique_players=new Set(ps.map(x=>x.player_id)).size;position_priors[pos].excluded_player_seasons=excludedSeasons.filter(x=>x.position===pos).length;position_priors[pos].role_basis=pos==='WR'?'WR_FULL_TIME_OBSERVED_PASS_PLAY_ROLE':pos==='TE'?'TE_RECEIVING_OBSERVED_PASS_PLAY_ROLE':RB_PROXY.label;
}
const eligiblePlayerGroups=new Map();
for(const s of eligibleSeasons){const key=`${s.position}|${s.player_id}`;if(!eligiblePlayerGroups.has(key))eligiblePlayerGroups.set(key,[]);eligiblePlayerGroups.get(key).push(...s.rows);}
const player_priors=[];
for(const [key,rs] of eligiblePlayerGroups){const [pos,playerId]=key.split('|');const raw=summarize(rs),pp=position_priors[pos];if(raw.catch_rate==null||pp.catch_rate==null)continue;const weight=clamp(raw.targets/(raw.targets+TARGET_SHRINKAGE_STRENGTH),0,1);const catch_rate=weight*raw.catch_rate+(1-weight)*pp.catch_rate;const seasons=[...new Set(rs.map(r=>Number(r.season)))].sort();player_priors.push({player:rs[0].player,player_id:playerId,player_key:normalize(rs[0].player),position:pos,eligible_seasons:seasons,games:raw.games,target_games:raw.target_games,targets:raw.targets,receptions:raw.receptions,raw_catch_rate:raw.catch_rate,player_weight:weight,shrunk_catch_rate:catch_rate,rho:pp.rho,dispersion_source:'role-filtered_position_prior',role_basis:pp.role_basis});}

const blocked=[];
for(const [pos,p] of Object.entries(position_priors)){if(p.eligible_player_seasons<25)blocked.push(`${pos} receiving-role player-season sample too small: ${p.eligible_player_seasons}`);if(p.eligible_unique_players<15)blocked.push(`${pos} receiving-role unique-player sample too small: ${p.eligible_unique_players}`);if(p.targets<1000)blocked.push(`${pos} receiving-role target sample too small: ${p.targets}`);if(!(p.catch_rate>0&&p.catch_rate<1))blocked.push(`${pos} invalid catch rate`);if(!(p.rho>0&&p.rho<=.5))blocked.push(`${pos} invalid rho`);}
for(const p of player_priors)if(!(p.shrunk_catch_rate>0&&p.shrunk_catch_rate<1))blocked.push(`${p.player} invalid shrunk catch rate`);
if(!Number.isInteger(authoritativeUniverse)||authoritativeUniverse<=0)blocked.push('invalid authoritative player universe');
if(modelUniverse!==authoritativeUniverse)blocked.push(`model source of truth universe ${modelUniverse} does not match authoritative universe ${authoritativeUniverse}`);
if(ref.live_player_universe_count!==authoritativeUniverse)blocked.push(`historical reference universe ${ref.live_player_universe_count} does not match authoritative universe ${authoritativeUniverse}`);
if(roles.live_player_universe_count!==authoritativeUniverse)blocked.push(`role cohort universe ${roles.live_player_universe_count} does not match authoritative universe ${authoritativeUniverse}`);
if(roles.sportsbook_inputs_used!==false)blocked.push('role cohort unexpectedly uses sportsbook inputs');

const generated_at=new Date().toISOString();
const role_method={WR:'Only player-seasons classified WR_FULL_TIME by observed nflverse pass-play participation plus meaningful receiving involvement define the WR catch-rate prior.',TE:'Only player-seasons classified TE_RECEIVING by observed nflverse pass-play participation plus meaningful receiving involvement define the TE catch-rate prior.',RB:'RB remains separately stratified with the receiving-back workload proxy pending broad RB pass-down role enrichment.'};
const output={schema_version:'2.0.1',generated_at,mode:'SHADOW_ONLY',actionable:false,history_window:[2021,2022,2023,2024,2025],sportsbook_inputs_used:false,authoritative_player_universe:authoritativeUniverse,method:{cohort_unit:'player-season, not career accumulation',...role_method,metric_integrity:'WR/TE pass-play participation is observed on-field dropback participation and is never called route participation.',catch_rate:'position prior is opportunity-weighted across eligible role seasons',player_shrinkage:`player catch rate uses only eligible-role seasons and shrinks toward the role-filtered position prior via targets/(targets+${TARGET_SHRINKAGE_STRENGTH})`,dispersion:'beta-binomial rho is estimated only from eligible receiving-role player-games',excluded_population:'fringe/rotational WR/TE seasons remain in historical storage but do not shape foundational catch-rate priors'},rb_role_proxy:RB_PROXY,target_shrinkage_strength:TARGET_SHRINKAGE_STRENGTH,position_priors,player_priors,excluded_player_seasons:excludedSeasons.map(x=>({player:x.player,position:x.position,season:x.season,targets:x.summary.targets,target_games:x.summary.target_games,targets_per_target_game:x.summary.targets_per_target_game,role_basis:x.role_basis}))};
const report={generated_at,result:blocked.length?'BLOCKED':'PASS',mode:'SHADOW_ONLY',actionable:false,authoritative_player_universe:authoritativeUniverse,model_source_of_truth_universe:modelUniverse,reference_live_player_universe:ref.live_player_universe_count,role_cohort_live_player_universe:roles.live_player_universe_count,eligible_player_priors:player_priors.length,eligible_player_seasons:eligibleSeasons.length,excluded_player_seasons:excludedSeasons.length,role_method,position_priors,blocked,sportsbook_inputs_used:false,safeguards:['WR catch-rate prior is now defined by observed full-time pass-play role seasons, not target totals alone.','TE catch-rate prior is now defined by observed receiving-role pass-play seasons, excluding rotational/blocking-only usage through role plus receiving-involvement filters.','Career accumulation cannot qualify a fringe player; eligibility is player-season based.','RB reception priors remain separately receiving-role filtered rather than sharing WR/TE logic.','Pass-play participation is not mislabeled as true route participation.','Live-universe integrity requires guardrail authoritative count, MODEL_SOURCE_OF_TRUTH, historical reference population, and role-cohort priors to match exactly.','No sportsbook data is used.']};
fs.writeFileSync(path.join(root,'data/probability/generated/catch-rate-priors-2021-2025.json'),JSON.stringify(output,null,2)+'\n');
fs.writeFileSync(path.join(root,'guardrails/catch-rate-priors-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(blocked.length)process.exit(1);
