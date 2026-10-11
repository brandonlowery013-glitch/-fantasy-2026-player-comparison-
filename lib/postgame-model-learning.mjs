import {createHash} from 'node:crypto';

export const RULE='postgame-logit-residual-ridge-v2';
const forecastKey=r=>[r.game_id,r.market||'moneyline'].join('|');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const time=x=>Date.parse(x);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const logit=p=>Math.log(clamp(p,1e-6,1-1e-6)/(1-clamp(p,1e-6,1-1e-6)));
const sigmoid=x=>1/(1+Math.exp(-clamp(x,-30,30)));
export const FACTORS={
  probability_confidence:'Saved football probability',
  scoring_margin:'Saved football scoring margin',
  offensive_plays:'Verified team offensive plays',
  pass_play_share:'Verified pass-play share including sacks; not PROE',
  rush_yards_per_attempt:'Verified rushing efficiency',
  turnovers:'Verified turnovers; not presumed repeatable',
  sacks_allowed:'Verified sacks allowed; not pressure rate',
  third_down_rate:'Verified third-down conversion rate',
  red_zone_rate:'Verified red-zone scoring rate',
  net_yards_per_play:'Verified net yards per offensive play',
  possession_seconds:'Verified possession time; not neutral-situation pace',
  consensus_home:'Dated home-side share of bets, not a football strength input',
  money_minus_bets_home:'Dated home-side money share minus bet share; not proof of professional money',
};
export const UNSUPPORTED=['EPA','success_rate','PROE','pressure_rate','explosive_rate','garbage_time_splits','routes','snaps','weather_numeric','coaching_numeric','injury_numeric','opponent_adjusted_efficiency','polymarket_numeric','consensus_numeric','money_splits_numeric','line_movement_numeric'];

export function newLedger(){return {schema_version:1,rule_id:RULE,forecasts:[],settlements:[],candidate_pairs:[]};}
function verifyForecast(r){
 if(r.market==='spread'&&!finite(r.home_line))throw Error('Missing frozen spread line');
 if(!r.game_id||!Number.isInteger(r.week)||r.week<1||r.week>18||r.season!==2026||!r.home_team||!r.away_team||r.home_team===r.away_team||!Number.isFinite(time(r.kickoff))||!Number.isFinite(time(r.captured_at))||!Number.isFinite(time(r.source_generated_at))||time(r.source_generated_at)>time(r.captured_at)||time(r.captured_at)>=time(r.kickoff)||!finite(r.probability)||r.probability<=0||r.probability>=1||![r.home_score_mean,r.away_score_mean].every(finite))throw Error('Invalid frozen game forecast');
}
export function appendForecasts(ledger,rows){
 const out=structuredClone(ledger),ids=new Map(out.forecasts.map(r=>[forecastKey(r),r]));
 for(const r of rows){verifyForecast(r);const old=ids.get(forecastKey(r));
  if(old){if(old.home_team!==r.home_team||old.away_team!==r.away_team||time(old.kickoff)!==time(r.kickoff))throw Error('Frozen game identity mismatch');continue;}
  const saved={...r,forecast_id:hash(r),frozen:true};out.forecasts.push(saved);ids.set(forecastKey(r),saved);
 }return out;
}
export function appendFinal(ledger,gameId,result,observedAt,forecastId=null){
 const f=ledger.forecasts.find(r=>r.game_id===gameId&&(!forecastId||r.forecast_id===forecastId));if(!f)throw Error('No original forecast');
 if(result.verified_final!==true||result.home_team!==f.home_team||result.away_team!==f.away_team||String(result.event_id)!==String(f.event_id)||time(result.kickoff)!==time(f.kickoff)||![result.home_score,result.away_score].every(x=>finite(x)&&x>=0)||!Number.isFinite(time(observedAt))||time(observedAt)<=time(f.kickoff))throw Error('Invalid learning final');
 const old=ledger.settlements.filter(r=>r.forecast_id===f.forecast_id).at(-1);
 const fingerprint=hash([result.home_score,result.away_score]);if(old?.fingerprint===fingerprint)return ledger;
 if(old&&time(observedAt)<time(old.observed_at))throw Error('Out-of-order learning settlement');
 const margin=result.home_score-result.away_score,graded=margin+(f.market==='spread'?f.home_line:0),y=graded===0?null:graded>0?1:0;
 const row={forecast_id:f.forecast_id,game_id:gameId,market:f.market||'moneyline',event_id:f.event_id,week:f.week,model_version:f.model_version,observed_at:observedAt,revision:(old?.revision||0)+1,fingerprint,verified_final:true,home_score:result.home_score,away_score:result.away_score,outcome:y,margin_error:margin-(f.home_score_mean-f.away_score_mean),home_score_error:result.home_score-f.home_score_mean,away_score_error:result.away_score-f.away_score_mean,probability_error:y===null?null:y-f.probability,brier:y===null?null:(f.probability-y)**2,log_loss:y===null?null:-Math.log(y?f.probability:1-f.probability),direction_result:y===null?'TIE':(f.probability>.5?1:0)===y?'WIN':'LOSS',source:result.source};
 return {...ledger,settlements:[...ledger.settlements,row]};
}
function latestFinals(ledger,asOf){const m=new Map();for(const r of ledger.settlements)if(time(r.observed_at)<=time(asOf)&&r.verified_final===true)m.set(r.forecast_id,r);return m;}
export function availableTraining(ledger,{week,asOf}){
 const finals=latestFinals(ledger,asOf);
 return ledger.forecasts.filter(f=>f.week<week&&time(f.kickoff)<time(asOf)).flatMap(f=>{const s=finals.get(f.forecast_id);return s&&s.outcome!==null?[{...f,outcome:s.outcome,settlement:s}]:[];});
}
export function gameFeatures(game,teamState={}){
 const h=teamState['team|'+game.home_team]?.metrics||{},a=teamState['team|'+game.away_team]?.metrics||{};
 const value=(m,k)=>m[k]?.mean;
 const derive=(m,k)=>{
  if(k==='third_down_rate'||k==='red_zone_rate'){const n=value(m,k==='third_down_rate'?'third_down_conversions':'red_zone_scores'),d=value(m,k==='third_down_rate'?'third_down_attempts':'red_zone_attempts');return finite(n)&&finite(d)&&d>0?n/d:null;}
  if(k==='net_yards_per_play'){const p=value(m,'net_passing_yards'),r=value(m,'rush_yards'),n=value(m,'offensive_plays');return finite(p)&&finite(r)&&finite(n)&&n>0?(p+r)/n:null;}
  return value(m,k);
 };
 const features={probability_confidence:logit(game.probability),scoring_margin:(game.home_score_mean-game.away_score_mean)/10};
 for(const k of Object.keys(FACTORS).slice(2).filter(k=>!['consensus_home','money_minus_bets_home'].includes(k))){const x=derive(h,k),y=derive(a,k);features[k]=finite(x)&&finite(y)?x-y:null;}
 const context=game.market_context,split=context?.status==='OBSERVATION'?context.rows?.find(r=>r.side===game.home_team):null;
 features.consensus_home=finite(split?.bets)?(split.bets-50)/100:null;
 features.money_minus_bets_home=finite(split?.money)&&finite(split?.bets)?(split.money-split.bets)/100:null;
 return features;
}
// Fit a regularized residual over the existing probability, not a replacement
// football model. Missing features cannot acquire coefficients. Correlated
// columns are excluded, and all scales are estimated from training rows only.
export function fitResidual(rows){
 const cols=[];
 for(const key of Object.keys(FACTORS)){
  const values=rows.map(r=>r.features?.[key]).filter(finite);if(values.length<8)continue;
  const mean=values.reduce((a,b)=>a+b,0)/values.length,sd=Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/values.length);if(sd<1e-8)continue;
  const zs=rows.map(r=>finite(r.features?.[key])?(r.features[key]-mean)/sd:0);
  if(cols.some(c=>{const dot=zs.reduce((s,z,i)=>s+z*c.zs[i],0),norm=Math.sqrt(zs.reduce((s,z)=>s+z*z,0)*c.zs.reduce((s,z)=>s+z*z,0));return norm&&Math.abs(dot/norm)>.95;}))continue;
  cols.push({key,mean,sd,zs,observations:values.length});
 }
 const beta=Array(cols.length+1).fill(0),n=rows.length;
 for(let step=0;step<500&&n>=8;step++){
  const grad=beta.map(b=>4*b); // Fixed regularization, never tuned on test outcomes.
  rows.forEach((r,i)=>{const x=[1,...cols.map(c=>c.zs[i])],error=sigmoid(logit(r.probability)+x.reduce((s,v,j)=>s+v*beta[j],0))-r.outcome;x.forEach((v,j)=>grad[j]+=error*v/n);});
  beta.forEach((b,j)=>beta[j]=b-.05*grad[j]);
 }
 return {rule_id:RULE,n,training_sha256:hash(rows.map(r=>[r.forecast_id,r.outcome,r.features])),intercept:beta[0],coefficients:cols.map((c,i)=>({key:c.key,mean:c.mean,sd:c.sd,observations:c.observations,coefficient:beta[i+1]})),excluded_features:Object.keys(FACTORS).filter(k=>!cols.some(c=>c.key===k)),probability_change_cap:.02};
}
export function candidateProbability(model,p,features){
 const delta=model.intercept+model.coefficients.reduce((s,c)=>s+(finite(features?.[c.key])?(features[c.key]-c.mean)/c.sd*c.coefficient:0),0);
 return clamp(sigmoid(logit(p)+delta),Math.max(1e-6,p-.02),Math.min(1-1e-6,p+.02));
}
export function candidateFor(ledger,forecast,asOf){
 const rows=availableTraining(ledger,{week:forecast.week,asOf}).filter(r=>(r.market||'moneyline')===(forecast.market||'moneyline')),model=fitResidual(rows),probability=candidateProbability(model,forecast.probability,forecast.features);
 return {rule_id:RULE,model,base_probability:forecast.probability,candidate_probability:probability,probability_change:probability-forecast.probability,numeric_authority:0,mode:'CHALLENGER_ONLY',actionable:false,reason:'Automatic postgame residual fit; production promotion requires existing independent paired validation and review',unsupported_features:UNSUPPORTED};
}
