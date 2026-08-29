import fs from 'node:fs';

const shardFiles=fs.readdirSync('.').filter(f=>/^players\d+\.json$/.test(f)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
const players=shardFiles.flatMap(f=>JSON.parse(fs.readFileSync(f,'utf8')));
if(players.length!==162) throw new Error(`Expected 162 active players; found ${players.length}`);
const posByName=Object.fromEntries(players.map(p=>[p.n,p.p]));
const histDoc=JSON.parse(fs.readFileSync('historicalStats2026.json','utf8'));
const hist=histDoc.players||{};
const aliasDoc=JSON.parse(fs.readFileSync('history-alias-reconciliation-audit.json','utf8'));
const activeToHistorical=Object.fromEntries((aliasDoc.aliases_in_historical_file||[]).map(x=>[x.active,x.historical]));
const historicalToActive=Object.fromEntries((aliasDoc.aliases_in_historical_file||[]).map(x=>[x.historical,x.active]));

const num=v=>{if(v==null)return 0;const s=String(v).trim();if(!s||s==='—'||s==='-')return 0;const n=Number(s.replace(/,/g,'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
const get=(r,ks)=>{for(const k of ks)if(r?.[k]!=null)return num(r[k]);return 0};
const gp=r=>get(r,['Games','GP','G'])||17;
const season=r=>Number(r.Season??r.Year??0);
function ppr(row,pos){
  if(pos==='QB') return get(row,['Pass Yards','PassYds'])*.04+get(row,['Pass TD','PassTD'])*4-get(row,['INT'])*2+get(row,['Rush Yards','Rush Yds','RushYds'])*.1+get(row,['Rush TD','RushTD'])*6;
  return get(row,['Receptions','Rec','Rec.'])+get(row,['Receiving Yards','Rec Yds','RecYds','Rec. Yards'])*.1+get(row,['TD','Rec TD','RecTD','Rec. TD'])*6+get(row,['Rush Yards','Rush Yds','RushYds'])*.1+get(row,['Rush TD','RushTD'])*6;
}
const ppg=(row,pos)=>ppr(row,pos)/Math.max(1,gp(row));
function weightedPrior(rows,pos,targetSeason){
  const prior=rows.filter(r=>season(r)>0&&season(r)<targetSeason).sort((a,b)=>season(a)-season(b)).slice(-3);
  if(!prior.length)return null;
  const weights=prior.length===1?[1]:prior.length===2?[.35,.65]:[.2,.3,.5];
  let s=0,w=0,games=0;
  prior.forEach((r,i)=>{const x=ppg(r,pos);if(Number.isFinite(x)&&x>0){s+=x*weights[i];w+=weights[i];games+=gp(r)}});
  return w?{mean:s/w,games,seasons:prior.length}:null;
}
function activeNameForHistoryKey(k){return historicalToActive[k]||k}
function buildExamples(targetSeason){
  const cohort=[];
  for(const [histName,rows] of Object.entries(hist)){
    const active=activeNameForHistoryKey(histName);
    const pos=posByName[active];
    if(!pos)continue;
    const target=rows.find(r=>season(r)===targetSeason);
    if(!target)continue;
    const prior=weightedPrior(rows,pos,targetSeason);
    if(!prior)continue;
    const y=ppg(target,pos);
    if(!Number.isFinite(y)||y<=0)continue;
    cohort.push({name:active,pos,targetSeason,y,playerPrior:prior.mean,priorGames:prior.games,priorSeasons:prior.seasons});
  }
  const posMean={};
  for(const pos of ['QB','RB','WR','TE']){
    const xs=cohort.filter(x=>x.pos===pos).map(x=>x.playerPrior);
    if(xs.length)posMean[pos]=xs.reduce((a,b)=>a+b,0)/xs.length;
  }
  return cohort.filter(x=>Number.isFinite(posMean[x.pos])).map(x=>({...x,positionPrior:posMean[x.pos]}));
}
const predict=(x,k)=>(x.priorGames*x.playerPrior+k*x.positionPrior)/(x.priorGames+k);
const mae=(rows,key)=>rows.reduce((s,r)=>s+Math.abs(r[key]-r.y),0)/Math.max(1,rows.length);
const rmse=(rows,key)=>Math.sqrt(rows.reduce((s,r)=>s+(r[key]-r.y)**2,0)/Math.max(1,rows.length));
function ranks(vals){
  const arr=vals.map((v,i)=>({v,i})).sort((a,b)=>a.v-b.v);const out=Array(vals.length);let i=0;
  while(i<arr.length){let j=i;while(j+1<arr.length&&arr[j+1].v===arr[i].v)j++;const rank=(i+j)/2+1;for(let k=i;k<=j;k++)out[arr[k].i]=rank;i=j+1}return out;
}
function spearman(rows,key){
  if(rows.length<3)return null;const a=ranks(rows.map(r=>r[key])),b=ranks(rows.map(r=>r.y));
  const ma=a.reduce((s,x)=>s+x,0)/a.length,mb=b.reduce((s,x)=>s+x,0)/b.length;
  let nume=0,da=0,db=0;for(let i=0;i<a.length;i++){const x=a[i]-ma,y=b[i]-mb;nume+=x*y;da+=x*x;db+=y*y}
  return da&&db?nume/Math.sqrt(da*db):null;
}
function metrics(rows,key){return {n:rows.length,mae:mae(rows,key),rmse:rmse(rows,key),spearman:spearman(rows,key)}}

const train=buildExamples(2024);
const test=buildExamples(2025);
if(train.length<20)throw new Error(`Insufficient 2024 training examples: ${train.length}`);
if(test.length<30)throw new Error(`Insufficient 2025 holdout examples: ${test.length}`);
const kGrid=[0.5,1,2,4,8,12,17,25,34,51,68];
const grid=kGrid.map(k=>{
  const rows=train.map(x=>({...x,baseline:x.playerPrior,bayes:predict(x,k)}));
  return {k,...metrics(rows,'bayes')};
}).sort((a,b)=>a.mae-b.mae||a.rmse-b.rmse||a.k-b.k);
const selectedK=grid[0].k;

const testRows=test.map(x=>({...x,baseline:x.playerPrior,bayes:predict(x,selectedK)}));
const baseline=metrics(testRows,'baseline');
const bayes=metrics(testRows,'bayes');
const byPosition={};
for(const pos of ['QB','RB','WR','TE']){
  const rs=testRows.filter(x=>x.pos===pos);if(rs.length)byPosition[pos]={baseline:metrics(rs,'baseline'),bayes:metrics(rs,'bayes')};
}
const pct=(before,after)=>before?((before-after)/before)*100:null;
const maeImprovementPct=pct(baseline.mae,bayes.mae);
const rmseImprovementPct=pct(baseline.rmse,bayes.rmse);
const rankDelta=(bayes.spearman??0)-(baseline.spearman??0);
const meanAccuracyImproved=bayes.mae<baseline.mae&&bayes.rmse<baseline.rmse;
const noRankCollapse=rankDelta>=-0.01;
const phaseConclusion=meanAccuracyImproved&&noRankCollapse?'MEAN_SHRINKAGE_SIGNAL_PASSES_PHASE1':'NO_PROMOTION_SIGNAL';

const worst=testRows.map(r=>({...r,baseline_abs_error:Math.abs(r.baseline-r.y),bayes_abs_error:Math.abs(r.bayes-r.y),error_change:Math.abs(r.bayes-r.y)-Math.abs(r.baseline-r.y)})).sort((a,b)=>b.error_change-a.error_change).slice(0,20);
const best=testRows.map(r=>({...r,baseline_abs_error:Math.abs(r.baseline-r.y),bayes_abs_error:Math.abs(r.bayes-r.y),error_change:Math.abs(r.bayes-r.y)-Math.abs(r.baseline-r.y)})).sort((a,b)=>a.error_change-b.error_change).slice(0,20);

const report={
  generated_at:new Date().toISOString(),step:'STEP_3B_BAYESIAN_WALKFORWARD_PHASE1',status:'SHADOW_ONLY',live_weight:0,live_projection_movement:0,live_rank_movement:0,
  hypothesis:'Empirical-Bayes shrinkage of player history toward a position prior can improve held-out next-season PPR-per-game prediction versus player-history-only forecasting.',
  leakage_controls:{training_target:2024,holdout_target:2025,prior_rows_must_precede_target_season:true,sportsbook_used:false,adp_used:false,current_2026_outcomes_used:false},
  candidate_formula:'posterior_mean = (prior_games * player_history_mean + k * position_prior_mean) / (prior_games + k)',
  tuning:{method:'grid search on 2024 training MAE, RMSE tiebreaker; selected k then frozen for 2025 holdout',k_grid:kGrid,selected_k_pseudogames:selectedK,training_examples:train.length,grid_results:grid},
  holdout:{season:2025,examples:testRows.length,baseline, bayes,mae_improvement_pct:maeImprovementPct,rmse_improvement_pct:rmseImprovementPct,spearman_delta:rankDelta,by_position:byPosition},
  conclusion:phaseConclusion,
  promotion_status:'BLOCKED_PENDING_DISTRIBUTION_CALIBRATION_AND_USER_REVIEW',
  rationale:phaseConclusion==='MEAN_SHRINKAGE_SIGNAL_PASSES_PHASE1'?'Bayesian mean shrinkage improved both MAE and RMSE on the held-out season without material rank-correlation degradation. This validates continued shadow testing only; it does not grant live influence.':'The candidate did not clear the Phase 1 held-out mean-forecast test. Keep live influence at zero and revise or reject the candidate.',
  pathological_review:{largest_degradations:worst,largest_improvements:best},
  next_required_tests:['prediction interval coverage','probability calibration','rookie/no-history prior validation','injury and regime-change subgroup audit','team/QB/coach change subgroup audit','extreme disagreement audit','full Guardrail QA']
};
fs.mkdirSync('guardrails',{recursive:true});
fs.writeFileSync('guardrails/step3b-bayesian-walkforward-backtest.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({conclusion:phaseConclusion,selectedK,trainN:train.length,testN:testRows.length,baseline,bayes,maeImprovementPct,rmseImprovementPct,rankDelta},null,2));
