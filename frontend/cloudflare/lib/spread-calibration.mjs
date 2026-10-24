// Research only. None of these functions write or promote production picks.
export const logit = p => {
  if (typeof p !== 'number' || !Number.isFinite(p) || p <= 0 || p >= 1) throw Error('Probability must be strictly between zero and one');
  return Math.log(p / (1 - p));
};
export const sigmoid = x => x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));

export function historicalPrice(points, cutoff, kickoff, maxAgeSeconds = 3600) {
  const end = Date.parse(cutoff) / 1000, start = Date.parse(kickoff) / 1000;
  if (!Number.isFinite(end) || !Number.isFinite(start) || end >= start) throw Error('A pregame cutoff is required');
  const eligible = points.filter(p => Number.isFinite(p.t) && typeof p.p === 'number' && p.p > 0 && p.p < 1 && p.t <= end && p.t < start && end - p.t <= maxAgeSeconds);
  return eligible.sort((a,b) => b.t-a.t)[0] || null;
}

export function informationFeatures(row) {
  if (!['moneyline','spread'].includes(row.market)) throw Error('Only moneyline and spread are in scope');
  if (!(Date.parse(row.forecast_available_at) <= Date.parse(row.decision_at) && Date.parse(row.decision_at) < Date.parse(row.kickoff))) throw Error('Future or post-kickoff forecast');
  const f = {
    market_logit: logit(row.sportsbook_probability),
    football_minus_market_logit: logit(row.football_probability) - logit(row.sportsbook_probability),
    home_score_mean: row.existing_variables.home_score_mean,
    away_score_mean: row.existing_variables.away_score_mean,
    team_score_sd: row.existing_variables.team_score_sd,
    home_away_score_correlation: row.existing_variables.home_away_score_correlation,
  };
  if (row.polymarket) {
    if (Date.parse(row.polymarket.price_at) > Date.parse(row.decision_at) || Date.parse(row.polymarket.price_at) >= Date.parse(row.kickoff)) throw Error('Future Polymarket price');
    if (row.polymarket.game_id !== row.game_id || row.polymarket.home_team !== row.home_team || row.polymarket.away_team !== row.away_team || Date.parse(row.polymarket.kickoff) !== Date.parse(row.kickoff)) throw Error('Different game, team, or kickoff');
    if (row.polymarket.home_line !== row.home_line || row.polymarket.market !== row.market) throw Error('Different contract or spread line');
    f.polymarket_minus_market_logit = logit(row.polymarket.probability) - logit(row.sportsbook_probability);
  }
  return f;
}

function solve(a,b) {
  const m = a.map((r,i)=>[...r,b[i]]), n=b.length;
  for(let i=0;i<n;i++) {
    let p=i;for(let j=i+1;j<n;j++)if(Math.abs(m[j][i])>Math.abs(m[p][i]))p=j;
    [m[i],m[p]]=[m[p],m[i]];
    if(Math.abs(m[i][i])<1e-12)throw Error('Singular fit');
    const d=m[i][i];for(let k=i;k<=n;k++)m[i][k]/=d;
    for(let j=0;j<n;j++)if(j!==i){const q=m[j][i];for(let k=i;k<=n;k++)m[j][k]-=q*m[i][k];}
  }
  return m.map(r=>r[n]);
}

export function fitInformationModel(rows, columns, penalty) {
  if(!rows.length || !Number.isFinite(penalty) || penalty<=0)throw Error('Training data and a positive declared penalty required');
  const values=rows.map(informationFeatures), mean={},sd={};
  for(const k of columns){if(values.some(v=>!Number.isFinite(v[k])))throw Error('Missing training feature '+k);mean[k]=values.reduce((s,v)=>s+v[k],0)/values.length;sd[k]=Math.sqrt(values.reduce((s,v)=>s+(v[k]-mean[k])**2,0)/values.length);}
  const active=[],excluded_columns=[];
  for(const k of columns){
    if(sd[k]<=1e-8){excluded_columns.push({column:k,reason:'CONSTANT_IN_TRAINING'});continue;}
    const duplicate=active.find(j=>Math.abs(values.reduce((sum,v)=>sum+(v[k]-mean[k])*(v[j]-mean[j]),0)/(values.length*sd[k]*sd[j]))>1-1e-10);
    if(duplicate){excluded_columns.push({column:k,reason:'EXACTLY_COLLINEAR_WITH_'+duplicate});continue;}active.push(k);
  }
  const dim=active.length+1;
  const x=values.map(v=>[1,...active.map(k=>(v[k]-mean[k])/sd[k])]);let beta=Array(dim).fill(0);
  for(let iter=0;iter<100;iter++){
    const g=beta.map(b=>penalty*b),h=Array.from({length:dim},(_,i)=>Array.from({length:dim},(_,j)=>i===j?penalty:0));
    for(let r=0;r<rows.length;r++){
      if(![0,.5,1].includes(rows[r].outcome))throw Error('Invalid settled outcome');
      const p=sigmoid(logit(rows[r].sportsbook_probability)+x[r].reduce((s,v,i)=>s+v*beta[i],0)),w=Math.max(p*(1-p),1e-8);
      for(let i=0;i<dim;i++){g[i]+=x[r][i]*(p-rows[r].outcome);for(let j=0;j<dim;j++)h[i][j]+=w*x[r][i]*x[r][j];}
    }
    const step=solve(h,g);beta=beta.map((b,i)=>b-step[i]);if(Math.max(...step.map(Math.abs))<1e-8)break;
  }
  return {formula:'sigmoid(logit(sportsbook_probability) + fitted_intercept + sum(fitted_beta_j * training_standardized_feature_j))',emh_null:'All fitted corrections equal zero: the market benchmark remains the estimate',columns:active,excluded_columns,mean,sd,beta,penalty,training_game_ids:rows.map(r=>r.game_id),numeric_authority:0};
}
export function predictInformationModel(model,row) {
  const f=informationFeatures(row);if(model.columns.some(k=>!Number.isFinite(f[k])))return null;
  return sigmoid(logit(row.sportsbook_probability)+model.beta[0]+model.columns.reduce((s,k,i)=>s+model.beta[i+1]*(f[k]-model.mean[k])/model.sd[k],0));
}
export function probabilityMetrics(rows, probability) {
  const paired=rows.map(r=>({r,p:probability(r)})).filter(x=>typeof x.p==='number'&&Number.isFinite(x.p)&&x.p>0&&x.p<1);
  if(!paired.length)return {n:0,brier:null,log_loss:null,correct:null};
  return {n:paired.length,brier:paired.reduce((s,{r,p})=>s+(p-r.outcome)**2,0)/paired.length,log_loss:paired.reduce((s,{r,p})=>s-r.outcome*Math.log(p)-(1-r.outcome)*Math.log(1-p),0)/paired.length,correct:paired.filter(({r,p})=>r.outcome!==.5&&Math.abs(p-.5)>1e-12&&(p>.5)===(r.outcome===1)).length,decisive:paired.filter(({r,p})=>r.outcome!==.5&&Math.abs(p-.5)>1e-12).length,no_direction:paired.filter(({p})=>Math.abs(p-.5)<=1e-12).length};
}

export function chronologicalExperiment(rows, includePolymarket, mode = 'full') {
  const eligible=rows.filter(r=>[1,2,3,4].includes(r.week)&&(!includePolymarket||r.polymarket));
  if(new Set(eligible.map(r=>r.game_id)).size!==eligible.length)throw Error('Duplicate games cannot inflate sample size');
  const train=eligible.filter(r=>r.week<=2),validation=eligible.filter(r=>r.week===3),holdout=eligible.filter(r=>r.week===4);
  if(train.length<10||validation.length<5||holdout.length<5)return {status:'INSUFFICIENT_MATCHED_HISTORY',training:train.length,validation:validation.length,holdout:holdout.length,numeric_authority:0};
  const columns=mode==='book_only'?['market_logit']:mode==='markets_only'?['market_logit','polymarket_minus_market_logit']:['market_logit','football_minus_market_logit','home_score_mean','away_score_mean','team_score_sd','home_away_score_correlation',...(includePolymarket?['polymarket_minus_market_logit']:[])];
  const candidates=[.1,1,10,100].map(penalty=>{const model=fitInformationModel(train,columns,penalty);return{penalty,validation:probabilityMetrics(validation,r=>predictInformationModel(model,r))};}).sort((a,b)=>a.validation.log_loss-b.validation.log_loss);
  const model=fitInformationModel([...train,...validation],columns,candidates[0].penalty),predictions=holdout.map(r=>({game_id:r.game_id,probability:predictInformationModel(model,r),outcome:r.outcome}));
  return {status:'RESEARCH_COMPLETE_NOT_PROMOTED',split:'Weeks 1–2 training; Week 3 penalty selection; Week 4 untouched evaluation',training:train.length,validation:validation.length,holdout:holdout.length,model,penalty_selection:candidates,holdout_metrics:{sportsbook:probabilityMetrics(holdout,r=>r.sportsbook_probability),football:probabilityMetrics(holdout,r=>r.football_probability),...(includePolymarket?{polymarket:probabilityMetrics(holdout,r=>r.polymarket.probability)}:{}),combined:probabilityMetrics(holdout,r=>predictInformationModel(model,r))},predictions,numeric_authority:0,promotion_allowed:false,limitations:['Small four-week sample; existing 100-holdout and review requirements are not met','Historical Polymarket trade prices are not historical executable bid/ask quotes','Model versions changed during these four weeks','No ROI or closing-line-value claim without corresponding archived execution and closing data']};
}
