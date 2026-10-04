import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {parseCSV,canon,ridge,pred} from '../lib/game-scoring-calibration.mjs';
import {candidateRows,fitCandidate,metrics,passesGate,matchupFeatures} from '../lib/matchup-score-candidate.mjs';
const root='.cache/matchup-context/',read=n=>parseCSV(fs.readFileSync(root+n,'utf8'));
const games=read('games.csv').filter(r=>r.game_type==='REG'&&+r.season>=2020&&+r.season<=2025&&r.home_score!==''&&r.away_score!=='').map(r=>({season:+r.season,week:+r.week,id:r.game_id,home:canon(r.home_team),away:canon(r.away_team),hs:+r.home_score,as:+r.away_score,hr:+r.home_rest,ar:+r.away_rest,neutral:r.location==='Neutral'}));
const teams=Array.from({length:6},(_,i)=>read(`stats_team_week_${2020+i}.csv`)).flat();
const contract=JSON.parse(fs.readFileSync('data/sources/step6-5d-game-spread-total-calibration-2026.json'));
const sets=new Map(contract.prior_decay.candidate_half_life_games.map(h=>[h,candidateRows(games,teams,[],h,'matchup')]));
const baselineSets=new Map([...sets].map(([h,rows])=>[h,rows.map(r=>({...r,xm:[r.xm[0]],xt:[r.xt[0]]}))]));
const baselines=contract.held_out_test_seasons.map(y=>fitCandidate(baselineSets,contract,y));
const summarize=folds=>({folds:folds.map((f,i)=>({season:contract.held_out_test_seasons[i],metrics:metrics(f.predictions)})),pooled:metrics(folds.flatMap(f=>f.predictions))});
const baseline=summarize(baselines),results={};
function confidence(candidate,base){
 const deltas=candidate.map((r,i)=>Math.abs(base[i].ym-base[i].predictedMargin)+Math.abs(base[i].yt-base[i].predictedTotal)-Math.abs(r.ym-r.predictedMargin)-Math.abs(r.yt-r.predictedTotal));
 // Deterministic paired resampling; conservative one-sided family-wise bound for 8 trials.
 let seed=20261004;const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};const samples=[];
 for(let b=0;b<2000;b++){let sum=0;for(let i=0;i<deltas.length;i++)sum+=deltas[Math.floor(rand()*deltas.length)];samples.push(sum/deltas.length);}samples.sort((a,b)=>a-b);
 return {games:deltas.length,mean_combined_error_improvement:deltas.reduce((a,b)=>a+b,0)/deltas.length,lower_bound:samples[Math.floor(samples.length*.05/8)],method:'Paired game bootstrap, one-sided 95% Bonferroni bound across eight candidates; descriptive, not prospective proof'};
}
// Fixed cap limits each trial; no candidate or combination is automatically promoted.
for(let j=0;j<matchupFeatures.length;j++){
 const folds=baselines.map((base,i)=>{
  const year=contract.held_out_test_seasons[i],rows=sets.get(base.half_life_games),validation=year-1;
  function residualModel(train,kind,l){const key=kind==='margin'?'xm':'xt',target=kind==='margin'?'ym':'yt';
   const core=ridge(train.map(r=>[r[key][0]]),train.map(r=>r[target]),base.ridge_lambda);
   const mod=ridge(train.map(r=>[r[key][j+2]]),train.map(r=>r[target]-pred(core,[[r[key][0]]])[0]),l);
   return {core,mod,key};}
  const train=rows.filter(r=>r.season<validation),val=rows.filter(r=>r.season===validation);let chosen=null;
  const apply=(m,r)=>Math.max(-2,Math.min(2,pred(m.mod,[[r[m.key][j+2]]])[0]));
  for(const l of contract.walk_forward.ridge_lambda_grid){const m=residualModel(train,'margin',l),t=residualModel(train,'total',l);const error=val.reduce((s,r)=>s+Math.abs(r.ym-pred(m.core,[[r.xm[0]]])[0]-apply(m,r))+Math.abs(r.yt-pred(t.core,[[r.xt[0]]])[0]-apply(t,r)),0)/val.length;if(!chosen||error<chosen.error)chosen={l,error};}
  const tr=rows.filter(r=>r.season<year),te=new Map(rows.filter(r=>r.season===year).map(r=>[r.id,r]));const m=residualModel(tr,'margin',chosen.l),t=residualModel(tr,'total',chosen.l);
  return {predictions:base.predictions.map(r=>({...r,predictedMargin:r.predictedMargin+apply(m,te.get(r.id)),predictedTotal:r.predictedTotal+apply(t,te.get(r.id))})),lambda:chosen.l};
 });
 const result=summarize(folds);const uncertainty=confidence(folds.flatMap(f=>f.predictions),baselines.flatMap(f=>f.predictions));results[matchupFeatures[j]==='pass_protection_pressure'?'sack_rate_matchup':matchupFeatures[j]]={...result,uncertainty,passes_existing_gate:passesGate(result,baseline),eligible_for_review:passesGate(result,baseline)&&uncertainty.lower_bound>0,production_numeric_authority:0};
}
const report={generated_at:new Date().toISOString(),status:'RESEARCH_ONLY',automatic_promotion:false,baseline:'Scoring matchup with no rest, fitted only on earlier seasons',test_seasons:contract.held_out_test_seasons,cap_points:2,scope:'One residual modifier at a time; no combined factors; no 2026 results',baseline,results,sources:['games.csv',...Array.from({length:6},(_,i)=>`stats_team_week_${2020+i}.csv`)].map(file=>({file,sha256:createHash('sha256').update(fs.readFileSync(root+file)).digest('hex')}))};
fs.writeFileSync('data/probability/generated/single-matchup-modifier-validation-2026.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(Object.fromEntries(Object.entries(results).map(([k,v])=>[k,{passes:v.passes_existing_gate,margin:v.pooled.margin_mae-baseline.pooled.margin_mae,total:v.pooled.total_mae-baseline.pooled.total_mae}]))));
