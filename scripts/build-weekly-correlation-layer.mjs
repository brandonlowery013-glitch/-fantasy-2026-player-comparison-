import fs from 'node:fs';
import path from 'node:path';
import {repairCorrelationMatrix,gaussianCopulaJointProbability,conditionTdProbabilityOnTeamScoring,finite} from './lib/correlation-modeling.mjs';

const root=process.cwd(),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const modelPath='data/probability/generated/correlation-model-2021-2025.json';
if(!fs.existsSync(path.join(root,modelPath)))throw new Error('Run build-correlation-model.mjs before weekly Step 3C layer');
const model=read(modelPath),projectionInput=read('data/probability/weekly-projection-inputs-2026.json'),comboInput=read('data/probability/weekly-correlation-inputs-2026.json'),sourceOfTruth=read('MODEL_SOURCE_OF_TRUTH.json');
const authoritativePlayerCount=Number(sourceOfTruth.active_player_model),runtimePlayerShards=Number(sourceOfTruth.runtime_player_shards);
if(!Number.isInteger(authoritativePlayerCount)||authoritativePlayerCount<=0)throw new Error(`invalid authoritative player count ${sourceOfTruth.active_player_model}`);
if(!Number.isInteger(runtimePlayerShards)||runtimePlayerShards<=0)throw new Error(`invalid runtime shard count ${sourceOfTruth.runtime_player_shards}`);
const runtimePlayers=[];
for(let i=0;i<runtimePlayerShards;i++){
  const shard=`players${i}.json`;
  if(!fs.existsSync(path.join(root,shard)))throw new Error(`missing runtime shard ${shard}`);
  runtimePlayers.push(...read(shard));
}
const runtimeSeen=new Set(runtimePlayers.map(p=>p.n));
const rel=model.relationships||{},rho=k=>rel[k]?.status==='SHADOW_ONLY'&&finite(rel[k].rho)?Number(rel[k].rho):null;
const projectionEntries=Object.entries(projectionInput.players||{});
const projectionPlayers=Object.fromEntries(projectionEntries.map(([name,p])=>[name,{name,team:p.team||p.signals?.team_environment?.team||null,position:String(p.position||'').toUpperCase()}]));
const runtimeMetadata=Object.fromEntries(runtimePlayers.map(p=>[p.n,{name:p.n,team:p.t||p.team||null,position:String(p.p||p.position||'').toUpperCase()}]));
const players={...runtimeMetadata,...projectionPlayers};
const meta=leg=>({team:leg.team||players[leg.player]?.team||null,position:String(leg.position||players[leg.player]?.position||'').toUpperCase()});
const statAliases={passing_yards:'pass_yards',passing_tds:'pass_tds',rushing_attempts:'rush_attempts',rushing_yards:'rush_yards',carries:'rush_attempts',targets:'targets',receptions:'receptions',receiving_yards:'receiving_yards',receiving_tds:'receiving_tds',pass_yards:'pass_yards',pass_tds:'pass_tds',rush_attempts:'rush_attempts',rush_yards:'rush_yards'};
export const normalizeStat=stat=>statAliases[String(stat||'').toLowerCase()]||String(stat||'').toLowerCase();

export function pairCorrelation(a,b){
  if(!a||!b)return 0;
  const as=normalizeStat(a.stat),bs=normalizeStat(b.stat);
  if(a.player===b.player){
    const key=[as,bs].sort().join('|');
    if(key==='receptions|targets')return rho('TARGETS__RECEPTIONS')??0;
    if(key==='receiving_yards|targets')return rho('TARGETS__RECEIVING_YARDS')??0;
    if(key==='receptions|receiving_yards')return rho('RECEPTIONS__RECEIVING_YARDS')??0;
    if(key==='rush_attempts|rush_yards')return rho('CARRIES__RUSHING_YARDS')??0;
  }
  const pa=meta(a),pb=meta(b);
  if(pa.team&&pa.team===pb.team){
    const qbA=pa.position==='QB',qbB=pb.position==='QB',recA=['WR','TE'].includes(pa.position),recB=['WR','TE'].includes(pb.position);
    if((qbA&&recB)||(qbB&&recA)){
      const q=qbA?{...a,stat:as}:{...b,stat:bs},r=qbA?{...b,stat:bs}:{...a,stat:as};
      if(q.stat==='pass_yards'&&r.stat==='receiving_yards')return rho('QB_PASS_YARDS__RECEIVER_YARDS')??0;
      if(q.stat==='pass_tds'&&r.stat==='receiving_tds')return rho('QB_PASS_TDS__RECEIVER_TDS')??0;
    }
  }
  return 0;
}

export function buildLegCorrelationMatrix(legs){
  const n=legs.length,m=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?1:pairCorrelation(legs[i],legs[j])));
  return repairCorrelationMatrix(m);
}

export function jointHitProbability(legs,opts={}){
  const probabilities=legs.map(x=>Number(x.probability));
  if(probabilities.some(p=>!finite(p)||p<0||p>1))throw new Error('Every leg requires Step 3B marginal event probability in [0,1]');
  const corr=buildLegCorrelationMatrix(legs);
  return {...gaussianCopulaJointProbability(probabilities,corr.matrix,opts),legs:legs.map(x=>({player:x.player,team:meta(x).team,position:meta(x).position,stat:normalizeStat(x.stat),probability:Number(x.probability)})),correlation_source:modelPath,step_3b_marginals_preserved:true};
}

export function conditionPlayerTdProbability({player,position,baseProbability,teamPointsZ}){
  const pos=String(position||players[player]?.position||'').toUpperCase(),byPos=model.team_points_player_tds_by_position?.[pos],r=byPos?.status==='SHADOW_ONLY'?Number(byPos.rho):rho('TEAM_POINTS__PLAYER_TDS');
  if(!finite(r))return {probability:Number(baseProbability),rho:null,status:'INDEPENDENCE_FALLBACK_NO_MODELED_RELATIONSHIP'};
  return {probability:conditionTdProbabilityOnTeamScoring(baseProbability,teamPointsZ,r),rho:r,status:'SHADOW_ONLY',team_scoring_input:'FOOTBALL_SIDE_Z_SCORE_ONLY'};
}

const blocked=[],results=[];
if(runtimePlayers.length!==authoritativePlayerCount)blocked.push(`runtime player count mismatch: expected ${authoritativePlayerCount}, found ${runtimePlayers.length}`);
if(runtimeSeen.size!==authoritativePlayerCount)blocked.push(`runtime unique player count mismatch: expected ${authoritativePlayerCount}, found ${runtimeSeen.size}`);
const unknownProjectionPlayers=projectionEntries.map(([name])=>name).filter(name=>!runtimeSeen.has(name));
if(unknownProjectionPlayers.length)blocked.push(`projection input contains ${unknownProjectionPlayers.length} players outside authoritative universe: ${unknownProjectionPlayers.slice(0,5).join(', ')}`);
if(comboInput.sportsbook_inputs_used_in_correlation_estimation!==false)blocked.push('sportsbook inputs may not enter correlation estimation');
for(const c of comboInput.combinations||[]){
  try{
    if(!Array.isArray(c.legs)||c.legs.length<2)throw new Error('combination requires at least two legs');
    for(const leg of c.legs)if(!runtimeSeen.has(leg.player))throw new Error(`player outside authoritative universe: ${leg.player}`);
    const joint=jointHitProbability(c.legs,{samples:Number(c.samples||32768),seed:Number(c.seed||20260303)});
    results.push({id:c.id||null,status:'SHADOW_ONLY',...joint});
  }catch(e){blocked.push(`${c.id||'UNNAMED_COMBINATION'}: ${e.message}`);}
}
const generatedAt=new Date().toISOString(),out={schema_version:'1.2.1',season:2026,week:comboInput.week??projectionInput.week,generated_at:generatedAt,status:comboInput.status,mode:'SHADOW_ONLY',actionable:false,sportsbook_inputs_used_in_correlation_estimation:false,correlation_source:modelPath,step_3b_marginals_preserved:true,authoritative_player_count:authoritativePlayerCount,runtime_player_shards:runtimePlayerShards,available_players:runtimeSeen.size,projection_input_players:projectionEntries.length,combinations:results,blocked};
fs.mkdirSync(path.join(root,'data/probability/generated'),{recursive:true});fs.writeFileSync(path.join(root,'data/probability/generated/weekly-correlation-layer-2026.json'),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out,null,2));if(blocked.length)process.exit(1);
