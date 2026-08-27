import fs from 'node:fs';
import path from 'node:path';
import {repairCorrelationMatrix,gaussianCopulaJointProbability,conditionTdProbabilityOnTeamScoring,finite} from './lib/correlation-modeling.mjs';

const root=process.cwd(),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const modelPath='data/probability/generated/correlation-model-2021-2025.json';
if(!fs.existsSync(path.join(root,modelPath)))throw new Error('Run build-correlation-model.mjs before weekly Step 3C layer');
const model=read(modelPath),projectionInput=read('data/probability/weekly-projection-inputs-2026.json'),comboInput=read('data/probability/weekly-correlation-inputs-2026.json');
const rel=model.relationships||{},rho=k=>rel[k]?.status==='SHADOW_ONLY'&&finite(rel[k].rho)?Number(rel[k].rho):null;
const playerEntries=Object.entries(projectionInput.players||{}),players=Object.fromEntries(playerEntries.map(([name,p])=>[name,{name,team:p.team||p.signals?.team_environment?.team||null,position:String(p.position||'').toUpperCase()}]));
const meta=leg=>({team:leg.team||players[leg.player]?.team||null,position:String(leg.position||players[leg.player]?.position||'').toUpperCase()});

export function pairCorrelation(a,b){
  if(!a||!b)return 0;
  if(a.player===b.player){
    const key=[a.stat,b.stat].sort().join('|');
    if(key==='receptions|targets')return rho('TARGETS__RECEPTIONS')??0;
    if(key==='receiving_yards|targets')return rho('TARGETS__RECEIVING_YARDS')??0;
    if(key==='receptions|receiving_yards')return rho('RECEPTIONS__RECEIVING_YARDS')??0;
    if(key==='rush_attempts|rush_yards')return rho('CARRIES__RUSHING_YARDS')??0;
  }
  const pa=meta(a),pb=meta(b);
  if(pa.team&&pa.team===pb.team){
    const qbA=pa.position==='QB',qbB=pb.position==='QB',recA=['WR','TE'].includes(pa.position),recB=['WR','TE'].includes(pb.position);
    if((qbA&&recB)||(qbB&&recA)){
      const q=qbA?a:b,r=qbA?b:a;
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
  return {...gaussianCopulaJointProbability(probabilities,corr.matrix,opts),legs:legs.map(x=>({player:x.player,team:meta(x).team,position:meta(x).position,stat:x.stat,probability:Number(x.probability)})),correlation_source:modelPath,step_3b_marginals_preserved:true};
}

export function conditionPlayerTdProbability({player,position,baseProbability,teamPointsZ}){
  const pos=String(position||players[player]?.position||'').toUpperCase(),byPos=model.team_points_player_tds_by_position?.[pos],r=byPos?.status==='SHADOW_ONLY'?Number(byPos.rho):rho('TEAM_POINTS__PLAYER_TDS');
  if(!finite(r))return {probability:Number(baseProbability),rho:null,status:'INDEPENDENCE_FALLBACK_NO_MODELED_RELATIONSHIP'};
  return {probability:conditionTdProbabilityOnTeamScoring(baseProbability,teamPointsZ,r),rho:r,status:'SHADOW_ONLY',team_scoring_input:'FOOTBALL_SIDE_Z_SCORE_ONLY'};
}

const blocked=[],results=[];
if(comboInput.sportsbook_inputs_used_in_correlation_estimation!==false)blocked.push('sportsbook inputs may not enter correlation estimation');
for(const c of comboInput.combinations||[]){
  try{
    if(!Array.isArray(c.legs)||c.legs.length<2)throw new Error('combination requires at least two legs');
    const joint=jointHitProbability(c.legs,{samples:Number(c.samples||32768),seed:Number(c.seed||20260303)});
    results.push({id:c.id||null,status:'SHADOW_ONLY',...joint});
  }catch(e){blocked.push(`${c.id||'UNNAMED_COMBINATION'}: ${e.message}`);}
}
const generatedAt=new Date().toISOString(),out={schema_version:'1.1.0',season:2026,week:comboInput.week??projectionInput.week,generated_at:generatedAt,status:comboInput.status,mode:'SHADOW_ONLY',actionable:false,sportsbook_inputs_used_in_correlation_estimation:false,correlation_source:modelPath,step_3b_marginals_preserved:true,available_players:Object.keys(players).length,combinations:results,blocked};
fs.mkdirSync(path.join(root,'data/probability/generated'),{recursive:true});fs.writeFileSync(path.join(root,'data/probability/generated/weekly-correlation-layer-2026.json'),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out,null,2));if(blocked.length)process.exit(1);
