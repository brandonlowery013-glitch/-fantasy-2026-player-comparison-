import fs from 'node:fs';
import path from 'node:path';
import {estimateCorrelation,finite} from './lib/correlation-modeling.mjs';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const contract=read('data/sources/correlation-modeling-2026.json');
const histPath='data/probability/generated/historical-enriched-2021-2025.json';
if(!fs.existsSync(path.join(root,histPath)))throw new Error('Run historical enrichment before Step 3C correlation calibration');
const hist=read(histPath),rows=(hist.rows||[]).filter(r=>r.played!==false&&r.inactive!==true);
const outDir=path.join(root,'data/probability/generated');fs.mkdirSync(outDir,{recursive:true});fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});
const cfg={strength:Number(contract.estimator.shrinkage_strength),minN:Number(contract.estimator.minimum_pair_observations),maxAbs:Number(contract.estimator.maximum_absolute_correlation)};
const pair=(a,b)=>finite(a)&&finite(b)?[Number(a),Number(b)]:null;

const byGame=new Map();
for(const r of rows){if(!r.team)continue;const k=`${r.season}|${r.week}|${r.team}`;if(!byGame.has(k))byGame.set(k,[]);byGame.get(k).push(r);}
const qbRecY=[],qbRecTd=[];
for(const gameRows of byGame.values()){
  const qbs=gameRows.filter(r=>r.position==='QB'&&finite(r.pass_attempts)).sort((a,b)=>Number(b.pass_attempts)-Number(a.pass_attempts));
  const qb=qbs[0];if(!qb)continue;
  for(const r of gameRows.filter(x=>['WR','TE'].includes(x.position))){const y=pair(qb.pass_yards,r.receiving_yards);if(y)qbRecY.push(y);const td=pair(qb.pass_tds,r.receiving_tds);if(td)qbRecTd.push(td);}
}

const targetRec=[],targetYards=[],recYards=[],carryYards=[],teamPointsTds=[];
const byPosition={QB:[],RB:[],WR:[],TE:[]};
for(const r of rows){
  let p=pair(r.targets,r.receptions);if(p)targetRec.push(p);
  p=pair(r.targets,r.receiving_yards);if(p)targetYards.push(p);
  p=pair(r.receptions,r.receiving_yards);if(p)recYards.push(p);
  p=pair(r.rush_attempts,r.rush_yards);if(p)carryYards.push(p);
  const playerTds=(finite(r.rush_tds)?Number(r.rush_tds):0)+(finite(r.receiving_tds)?Number(r.receiving_tds):0)+(r.position==='QB'&&finite(r.pass_tds)?Number(r.pass_tds):0);
  p=pair(r.team_points,playerTds);if(p){teamPointsTds.push(p);if(byPosition[r.position])byPosition[r.position].push(p);}
}

const estimate=pairs=>estimateCorrelation(pairs,cfg);
const relationships={
  QB_PASS_YARDS__RECEIVER_YARDS:estimate(qbRecY),
  QB_PASS_TDS__RECEIVER_TDS:estimate(qbRecTd),
  TARGETS__RECEPTIONS:estimate(targetRec),
  TARGETS__RECEIVING_YARDS:estimate(targetYards),
  RECEPTIONS__RECEIVING_YARDS:estimate(recYards),
  CARRIES__RUSHING_YARDS:estimate(carryYards),
  TEAM_POINTS__PLAYER_TDS:estimate(teamPointsTds)
};
const teamPointsPlayerTdsByPosition=Object.fromEntries(Object.entries(byPosition).map(([pos,pairs])=>[pos,estimate(pairs)]));
const blocked=[];
for(const rel of contract.relationships||[]){const x=relationships[rel];if(!x)blocked.push(`missing relationship ${rel}`);else if(x.status!=='SHADOW_ONLY')blocked.push(`${rel} has insufficient observations: ${x.n}`);else if(!finite(x.rho)||Math.abs(x.rho)>1)blocked.push(`${rel} invalid shrunk correlation ${x.rho}`);}
if(hist.market_inputs_used!==false)blocked.push('historical enrichment must explicitly declare market_inputs_used=false');

const generatedAt=new Date().toISOString();
const model={schema_version:'1.0.0',season_target:2026,history_window:contract.historical_window,generated_at:generatedAt,status:'STEP_3C_CORRELATION_MODELING_LOCKED',mode:'SHADOW_ONLY',actionable:false,sportsbook_inputs_used:false,source:histPath,estimator:contract.estimator,relationships,team_points_player_tds_by_position:teamPointsPlayerTdsByPosition,step_3b_marginals_mutated:false};
const report={generated_at:generatedAt,result:blocked.length?'BLOCKED':'PASS',mode:'SHADOW_ONLY',actionable:false,rows_considered:rows.length,team_games:byGame.size,relationships:Object.fromEntries(Object.entries(relationships).map(([k,v])=>[k,{n:v.n,raw:v.raw,rho:v.rho,status:v.status}])),sportsbook_inputs_used:false,step_3b_marginals_mutated:false,blocked,notes:['QB/receiver relationships are paired within the same team-game.','Volume-to-efficiency relationships are paired within player-games.','Raw Pearson estimates are shrunk toward zero before use in joint probability modeling.','Step 3B marginal distributions and exact tail probabilities remain authoritative and unchanged.']};
fs.writeFileSync(path.join(outDir,'correlation-model-2021-2025.json'),JSON.stringify(model,null,2)+'\n');
fs.writeFileSync(path.join(root,'guardrails/correlation-model-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(blocked.length)process.exit(1);
