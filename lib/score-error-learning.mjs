import {createHash} from 'node:crypto';

export const SCORE_LEARNING_VERSION='football-score-error-learning-v1';
export const SCORE_LEARNING_POLICY=Object.freeze({half_life_weeks:4,intercept_prior_games:24,slope_prior_games:48,minimum_games:8});
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const time=x=>Date.parse(x);
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const canonical=t=>({LA:'LAR',WSH:'WAS',JAC:'JAX'}[t]||t);

// One score forecast per game, irrespective of how many markets it supports.
// Live training requires a verified final that was observed before this prediction.
// Historical replay explicitly relaxes observation retrieval time, never game/week order.
export function scoreTrainingRows(ledger,{season,week,asOf,baseVersion='scoring-decay-no-rest-2026-v2',historicalReplay=false}){
 if(!Number.isInteger(season)||!Number.isInteger(week)||!Number.isFinite(time(asOf)))throw Error('Invalid score learning cutoff');
 const latest=new Map();
 for(const s of ledger.settlements||[]){
  if(s.verified_final!==true||![s.home_score,s.away_score].every(x=>finite(x)&&x>=0)||!Number.isFinite(time(s.observed_at))||(!historicalReplay&&time(s.observed_at)>time(asOf)))continue;
  const old=latest.get(s.forecast_id);if(!old||time(s.observed_at)>time(old.observed_at))latest.set(s.forecast_id,s);
 }
 const byGame=new Map();
 const forecasts=[...(ledger.forecasts||[])].sort((a,b)=>time(a.captured_at)-time(b.captured_at)||String(a.forecast_id).localeCompare(String(b.forecast_id)));
 for(const f of forecasts){
  const learning=f.evidence?.scoring?.score_learning;
  if(f.season!==season||f.week>=week||!(f.week>=1)||!(time(f.kickoff)<time(asOf))||!(time(f.source_generated_at)<=time(f.captured_at)&&time(f.captured_at)<time(f.kickoff)))continue;
  if(f.model_version!==baseVersion&&!(f.model_version===SCORE_LEARNING_VERSION&&learning?.base_model_version===baseVersion))continue;
  const s=latest.get(f.forecast_id);if(!s||s.game_id!==f.game_id||String(s.event_id)!==String(f.event_id)||!(time(s.observed_at)>time(f.kickoff)))continue;
  const home=learning?.base_home_score_mean??f.home_score_mean,away=learning?.base_away_score_mean??f.away_score_mean;
  if(![home,away].every(x=>finite(x)&&x>=0)||canonical(f.home_team)===canonical(f.away_team))throw Error('Invalid score learning forecast');
  // Input allowlist intentionally excludes lines, odds, picks and current-game stats.
  const row={game_id:f.game_id,season:f.season,week:f.week,event_id:String(f.event_id),home_team:canonical(f.home_team),away_team:canonical(f.away_team),kickoff:f.kickoff,forecast_at:f.captured_at,final_observed_at:s.observed_at,base_home:home,base_away:away,actual_home:s.home_score,actual_away:s.away_score};
  const old=byGame.get(f.game_id);
  if(old){if(old.home_team!==row.home_team||old.away_team!==row.away_team||time(old.kickoff)!==time(row.kickoff)||old.actual_home!==row.actual_home||old.actual_away!==row.actual_away)throw Error('Conflicting score learning game identity/final');continue;}
  byGame.set(f.game_id,row);
 }
 return [...byGame.values()];
}

function fitError(rows,week,kind,policy){
 let a=policy.intercept_prior_games,b=0,c=policy.slope_prior_games,d=0,e=0;
 for(const r of rows){
  const w=2**(-(week-1-r.week)/policy.half_life_weeks);
  const base=kind==='margin'?r.base_home-r.base_away:r.base_home+r.base_away;
  const actual=kind==='margin'?r.actual_home-r.actual_away:r.actual_home+r.actual_away;
  const x=kind==='margin'?base/10:(base-45)/10,y=actual-base;
  a+=w;b+=w*x;c+=w*x*x;d+=w*y;e+=w*x*y;
 }
 const determinant=a*c-b*b;
 if(!(determinant>0))throw Error('Invalid score error fit');
 return {intercept:(d*c-b*e)/determinant,slope:(a*e-b*d)/determinant};
}
export function fitScoreErrors(rows,{season,week,asOf,policy=SCORE_LEARNING_POLICY}={}){
 if(!Number.isInteger(season)||!Number.isInteger(week)||!Number.isFinite(time(asOf))||Object.values(policy).some(x=>!finite(x)||x<=0))throw Error('Invalid score learning fit');
 if(new Set(rows.map(r=>r.game_id)).size!==rows.length||rows.some(r=>r.season!==season||r.week>=week||![r.base_home,r.base_away,r.actual_home,r.actual_away].every(finite)))throw Error('Duplicate, future or invalid score learning row');
 const ready=rows.length>=policy.minimum_games;
 return {version:SCORE_LEARNING_VERSION,season,week,as_of:asOf,status:ready?'FITTED':'WARMUP',n:rows.length,training_weeks:[...new Set(rows.map(r=>r.week))].sort((a,b)=>a-b),training_game_ids:rows.map(r=>r.game_id),training_sha256:hash(rows),policy:{...policy},margin:ready?fitError(rows,week,'margin',policy):{intercept:0,slope:0},total:ready?fitError(rows,week,'total',policy):{intercept:0,slope:0},sportsbook_inputs_used:false};
}
export function applyScoreLearning(forecast,fit){
 const h=forecast.home_score_mean,a=forecast.away_score_mean;
 if(![h,a].every(x=>finite(x)&&x>=0)||fit.version!==SCORE_LEARNING_VERSION||!['FITTED','WARMUP'].includes(fit.status))throw Error('Invalid score learning application');
 if(forecast.model_version===SCORE_LEARNING_VERSION||forecast.evidence?.score_learning)throw Error('Score learning already applied');
 const margin=h-a,total=h+a,marginCorrection=fit.margin.intercept+fit.margin.slope*margin/10,totalCorrection=fit.total.intercept+fit.total.slope*(total-45)/10;
 const learnedTotal=Math.max(0,total+totalCorrection),learnedMargin=Math.max(-learnedTotal,Math.min(learnedTotal,margin+marginCorrection));
 const home=(learnedTotal+learnedMargin)/2,away=(learnedTotal-learnedMargin)/2;
 const evidence={...forecast.evidence,score_learning:{version:SCORE_LEARNING_VERSION,base_model_version:forecast.model_version,base_home_score_mean:h,base_away_score_mean:a,margin_correction:learnedMargin-margin,total_correction:learnedTotal-total,training_games:fit.n,training_weeks:fit.training_weeks,training_sha256:fit.training_sha256,as_of:fit.as_of,status:fit.status,sportsbook_inputs_used:false}};
 if(evidence.contributions){const c=evidence.contributions;evidence.contributions={...c,model_version:SCORE_LEARNING_VERSION,margin:{...c.margin,base_reconstructed:c.margin?.reconstructed,learning_adjustment:learnedMargin-margin,reconstructed:learnedMargin},total:{...c.total,base_reconstructed:c.total?.reconstructed,learning_adjustment:learnedTotal-total,reconstructed:learnedTotal}};}
 return {...forecast,model_version:SCORE_LEARNING_VERSION,base_model_version:forecast.model_version,home_score_mean:home,away_score_mean:away,evidence};
}

// Promotion is fail-closed. A current model cannot be activated with another
// learner's report, an in-sample test, insufficient evidence or worse errors.
export function scoreLearningGate(report,codeHash,{week,ledgerHash}={}){
 if(report?.model_version!==SCORE_LEARNING_VERSION||report?.code_sha256!==codeHash||report?.method!=='EARLIER_WEEK_ONLY_FROZEN_FORECAST_REPLAY'||report?.sportsbook_inputs_used_for_fit!==false)return {passed:false,reason:'INVALID_VALIDATION_PROVENANCE'};
 if(week!==undefined&&report.validation_through_week!==week-1||ledgerHash!==undefined&&report.ledger_sha256!==ledgerHash)return {passed:false,reason:'STALE_VALIDATION_INPUTS'};
 const r=report.results;
 if(!r||r.games<40||r.weeks<3)return {passed:false,reason:'INSUFFICIENT_PREVIOUS_WEEK_EVIDENCE'};
 const keys=['team_score_mae','margin_mae','total_mae','spread_brier'];
 if(keys.some(k=>![r.base?.[k],r.learned?.[k]].every(finite)))return {passed:false,reason:'INCOMPLETE_VALIDATION'};
 if(keys.some(k=>r.learned[k]>r.base[k]+1e-12)||!(r.learned.team_score_mae<r.base.team_score_mae))return {passed:false,reason:'NO_CONSISTENT_HELD_OUT_IMPROVEMENT'};
 return {passed:true,reason:'PREVIOUS_WEEK_POINT_AND_PROBABILITY_CHECKS_PASSED'};
}
