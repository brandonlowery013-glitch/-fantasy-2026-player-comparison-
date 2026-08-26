import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const ref=read('data/probability/generated/historical-reference-population-2021-2025.json');
const uncertainty=read('data/probability/generated/historical-uncertainty-priors-2021-2025.json');
const contract=read('data/sources/projection-error-model-2026.json');
const rows=(ref.rows||[]).filter(r=>r.played!==false);
const outDir=path.join(root,'data/probability/generated');
fs.mkdirSync(outDir,{recursive:true});
fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});

const statsByPos={QB:['pass_yards','pass_tds','rush_yards'],RB:['rush_yards','targets','receiving_yards','receptions'],WR:['targets','receiving_yards','receptions'],TE:['targets','receiving_yards','receptions']};
const tuneSeasons=new Set(contract.windows.projection_error_tuning||[2023,2024]);
const evalSeasons=new Set(contract.windows.final_holdout||[2025]);
const finite=x=>Number.isFinite(Number(x));
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const variance=a=>{if(a.length<2)return null;const m=avg(a);return a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1)};
const rmse=a=>a.length?Math.sqrt(avg(a.map(x=>x*x))):null;
const mae=a=>a.length?avg(a.map(Math.abs)):null;
const erf=x=>{const sign=x<0?-1:1,ax=Math.abs(x),t=1/(1+0.3275911*ax);const y=1-(((((1.061405429*t-1.453152027)*t+1.421413741)*t-0.284496736)*t+0.254829592)*t)*Math.exp(-ax*ax);return sign*y};
const cdf=x=>0.5*(1+erf(x/Math.SQRT2));
const gaussianNll=(y,mu,sigma)=>0.5*Math.log(2*Math.PI*sigma*sigma)+((y-mu)**2)/(2*sigma*sigma);
const keyTime=r=>Number(r.season)*100+Number(r.week);
const val=(r,stat)=>{const x=Number(r[stat]);return Number.isFinite(x)?x:null};
const fresh=()=>({n:0,sum:0,sumsq:0});
const add=(s,x)=>{s.n++;s.sum+=x;s.sumsq+=x*x};
const mean=s=>s.n?s.sum/s.n:null;
const sdev=s=>{if(s.n<2)return null;const v=(s.sumsq-(s.sum*s.sum)/s.n)/(s.n-1);return Math.sqrt(Math.max(0,v))};
const selectedK=(pos,stat)=>Number(uncertainty.tuning?.[pos]?.[stat]?.selected_k||5);

function makePred(posS,playerS,k){
  if(posS.n<50)return null;
  const pm=mean(posS),ps=sdev(posS)||0,n=playerS?.n||0,w=n/(n+k),xm=n?mean(playerS):pm,xs=n>=2?(sdev(playerS)||ps):ps;
  const mu=w*xm+(1-w)*pm;
  const performanceSd=Math.max(Math.sqrt(Math.max(1e-9,w*xs*xs+(1-w)*ps*ps)),Math.max(1e-6,ps*0.35));
  return {mu,performance_sd:performanceSd,player_games_before:n,position_games_before:posS.n,player_weight:w,position_mean:pm,position_sd:ps};
}

rows.sort((a,b)=>keyTime(a)-keyTime(b)||String(a.player_id).localeCompare(String(b.player_id)));
const weeks=[];let bucket=null;
for(const r of rows){const t=keyTime(r);if(!bucket||bucket.t!==t){bucket={t,season:Number(r.season),week:Number(r.week),rows:[]};weeks.push(bucket)}bucket.rows.push(r)}

const snapshots=[];
for(const [pos,stats] of Object.entries(statsByPos)){
  for(const stat of stats){
    const posS=fresh(),players=new Map(),k=selectedK(pos,stat);
    for(const wk of weeks){
      const targets=wk.rows.filter(r=>r.position===pos);
      for(const target of targets){
        const y=val(target,stat);if(y==null)continue;
        const ps=players.get(target.player_id)||fresh();
        const p=makePred(posS,ps,k);if(!p)continue;
        if(tuneSeasons.has(target.season)||evalSeasons.has(target.season)){
          snapshots.push({snapshot_type:'WALK_FORWARD_RECONSTRUCTION',season:Number(target.season),week:Number(target.week),player_id:target.player_id,player:target.player,position:pos,stat,actual:y,reconstructed_mean:p.mu,performance_sd:p.performance_sd,residual:y-p.mu,residual_sq:(y-p.mu)**2,performance_variance:p.performance_sd**2,player_games_before:p.player_games_before,position_games_before:p.position_games_before,shrinkage_k:k,player_weight:p.player_weight,source:'football-only prior games',sportsbook_inputs_used:false});
        }
      }
      for(const r of targets){const x=val(r,stat);if(x==null)continue;add(posS,x);if(!players.has(r.player_id))players.set(r.player_id,fresh());add(players.get(r.player_id),x);}
    }
  }
}

function metrics(a,projectionErrorSd=0){
  if(!a.length)return null;
  const residuals=a.map(x=>x.residual),perfVar=a.map(x=>x.performance_variance);
  const rawNll=avg(a.map(x=>gaussianNll(x.actual,x.reconstructed_mean,x.performance_sd)));
  const combinedNll=avg(a.map(x=>gaussianNll(x.actual,x.reconstructed_mean,Math.sqrt(x.performance_variance+projectionErrorSd**2))));
  const rawCoverage80=avg(a.map(x=>Math.abs(x.residual)<=1.281551566*x.performance_sd?1:0));
  const combinedCoverage80=avg(a.map(x=>Math.abs(x.residual)<=1.281551566*Math.sqrt(x.performance_variance+projectionErrorSd**2)?1:0));
  const rawCoverage50=avg(a.map(x=>Math.abs(x.residual)<=0.67448975*x.performance_sd?1:0));
  const combinedCoverage50=avg(a.map(x=>Math.abs(x.residual)<=0.67448975*Math.sqrt(x.performance_variance+projectionErrorSd**2)?1:0));
  return {sample:a.length,bias:avg(residuals),mae:mae(residuals),rmse:rmse(residuals),residual_variance:variance(residuals),mean_performance_variance:avg(perfVar),mean_performance_sd:avg(a.map(x=>x.performance_sd)),raw_gaussian_nll:rawNll,combined_gaussian_nll:combinedNll,raw_50_interval_coverage:rawCoverage50,combined_50_interval_coverage:combinedCoverage50,raw_80_interval_coverage:rawCoverage80,combined_80_interval_coverage:combinedCoverage80};
}

const models={};const holdout={};let tuneTotal=0,evalTotal=0;
for(const [pos,stats] of Object.entries(statsByPos)){
  models[pos]={};holdout[pos]={};
  for(const stat of stats){
    const tune=snapshots.filter(x=>x.position===pos&&x.stat===stat&&tuneSeasons.has(x.season));
    const evals=snapshots.filter(x=>x.position===pos&&x.stat===stat&&evalSeasons.has(x.season));
    tuneTotal+=tune.length;evalTotal+=evals.length;
    const residuals=tune.map(x=>x.residual),resVar=variance(residuals)||0,perfVar=avg(tune.map(x=>x.performance_variance))||0;
    const projectionErrorVar=Math.max(0,resVar-perfVar),projectionErrorSd=Math.sqrt(projectionErrorVar),bias=avg(residuals)||0;
    models[pos][stat]={sample:tune.length,projection_bias:bias,residual_variance:resVar,mean_performance_variance:perfVar,projection_error_variance:projectionErrorVar,projection_error_sd:projectionErrorSd,variance_decomposition:'combined_variance = performance_variance + projection_error_variance',bias_application:'DIAGNOSTIC_ONLY_NOT_APPLIED_TO_WEEKLY_MEAN',sportsbook_inputs_used:false};
    holdout[pos][stat]={...metrics(evals,projectionErrorSd),projection_error_sd_from_2023_2024:projectionErrorSd,evaluation_window:[...evalSeasons],tuning_window:[...tuneSeasons],note:'2025 is evaluated with the projection-error SD frozen from 2023-2024. No 2025 result is used to tune this term.'};
  }
}

const blocked=[];
if(ref.live_player_universe_count!==162)blocked.push(`live universe changed: ${ref.live_player_universe_count}`);
if(contract.sportsbook_inputs_allowed!==false)blocked.push('projection error contract unexpectedly permits sportsbook inputs');
if(contract.snapshot_policy?.archived_exact_model_snapshots_available!==false)blocked.push('archived exact snapshot flag must remain false');
if(tuneTotal<5000)blocked.push(`projection-error tuning sample unexpectedly small: ${tuneTotal}`);
if(evalTotal<3000)blocked.push(`2025 holdout sample unexpectedly small: ${evalTotal}`);
for(const [pos,stats] of Object.entries(models))for(const [stat,m] of Object.entries(stats)){
  if(m.sample<150)blocked.push(`${pos} ${stat} tuning sample <150`);
  if(!finite(m.projection_error_sd)||m.projection_error_sd<0)blocked.push(`${pos} ${stat} invalid projection_error_sd`);
  const h=holdout[pos][stat];if(!h||h.sample<100)blocked.push(`${pos} ${stat} holdout sample <100`);
  if(h&&(!finite(h.raw_gaussian_nll)||!finite(h.combined_gaussian_nll)))blocked.push(`${pos} ${stat} invalid holdout NLL`);
}

const generated_at=new Date().toISOString();
const output={schema_version:'1.0.0',generated_at,mode:'SHADOW_ONLY',actionable:false,status:blocked.length?'BLOCKED':'STEP_2H_PROJECTION_ERROR_MODEL_BUILT',snapshot_type:'WALK_FORWARD_RECONSTRUCTION',archived_exact_model_snapshots_available:false,history_window:contract.windows.history,tuning_window:[...tuneSeasons],evaluation_window:[...evalSeasons],sportsbook_inputs_used:false,models,holdout_2025:holdout,snapshot_count:snapshots.length,snapshots,limitations:['These are leakage-safe reconstructed forecasts, not archived outputs from the exact historical 2026 model architecture.','Projection-error variance is estimated as excess residual variance after modeled performance variance and is therefore an approximate aleatoric/epistemic decomposition, not a uniquely identified causal split.','Projection bias is reported but not automatically applied to future weekly means in Step 2H.','If excess residual variance is not positive, projection_error_sd remains zero rather than forcing additional uncertainty.']};
const report={generated_at,result:blocked.length?'BLOCKED':'PASS',mode:'SHADOW_ONLY',actionable:false,tuning_predictions:tuneTotal,holdout_predictions:evalTotal,total_snapshots:snapshots.length,models,holdout_2025:holdout,blocked,sportsbook_inputs_used:false,safeguards:['Every reconstructed forecast is made before the target week is added to state.','Same-week rows are scored before any same-week outcomes update historical state.','2023-2024 estimate the projection-error term; 2025 remains untouched final holdout.','Performance SD is preserved separately from projection-error SD and combined SD.','No sportsbook threshold, price, spread, total, or implied probability is used.','No positive projection-error variance is forced when residual variance does not exceed modeled performance variance.']};
fs.writeFileSync(path.join(outDir,'historical-projection-error-model-2021-2025.json'),JSON.stringify(output,null,2)+'\n');
fs.writeFileSync(path.join(root,'guardrails/historical-projection-error-model-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({result:report.result,tuning_predictions:tuneTotal,holdout_predictions:evalTotal,blocked,projection_error_sd:Object.fromEntries(Object.entries(models).map(([p,s])=>[p,Object.fromEntries(Object.entries(s).map(([st,x])=>[st,x.projection_error_sd]))]))},null,2));
if(blocked.length)process.exit(1);
