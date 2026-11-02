import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {scoreTrainingRows,fitScoreErrors,applyScoreLearning,scoreLearningGate,SCORE_LEARNING_VERSION,SCORE_LEARNING_POLICY} from '../lib/score-error-learning.mjs';
import {simulateGameDistribution,outcomeProbabilities} from '../lib/game-market-probability.mjs';

const args=process.argv.slice(2),ledgerPath=args[0]||'data/market/postgame-model-learning-2026.json',output=args[1]||'data/probability/generated/football-score-learning-validation-2026.json';
const targetWeek=Number(args[2]||JSON.parse(fs.readFileSync('data/calibration/weekly-event-schedule-2026.json')).week);
if(!Number.isInteger(targetWeek)||targetWeek<1||targetWeek>18)throw Error('Invalid validation target week');
const ledger=JSON.parse(fs.readFileSync(ledgerPath)),version='scoring-decay-no-rest-2026-v2';
const codeFiles=['../lib/score-error-learning.mjs','../lib/game-market-probability.mjs','./backtest-score-error-learning.mjs'];
const codeHash=createHash('sha256').update(codeFiles.map(p=>fs.readFileSync(fileURLToPath(new URL(p,import.meta.url)),'utf8')).join('\n')).digest('hex');
const all=scoreTrainingRows(ledger,{season:2026,week:targetWeek+1,asOf:new Date().toISOString(),baseVersion:version,historicalReplay:true});
const forecasts=new Map();
for(const f of [...ledger.forecasts].sort((a,b)=>Date.parse(a.captured_at)-Date.parse(b.captured_at))){
 const eligible=f.model_version===version||f.model_version===SCORE_LEARNING_VERSION&&f.evidence?.scoring?.score_learning?.base_model_version===version;
 if(eligible&&f.market==='spread'&&!forecasts.has(f.game_id))forecasts.set(f.game_id,f);
}
const results=[],folds=[];
for(const week of [...new Set(all.map(r=>r.week))].filter(w=>w<=targetWeek).sort((a,b)=>a-b)){
 const test=all.filter(r=>r.week===week),asOf=new Date(Math.min(...test.map(r=>Date.parse(r.forecast_at)))).toISOString();
 const training=scoreTrainingRows(ledger,{season:2026,week,asOf,baseVersion:version,historicalReplay:true});
 const fit=fitScoreErrors(training,{season:2026,week,asOf});
 folds.push({week,training_games:fit.n,training_weeks:fit.training_weeks,test_games:test.length,fit_status:fit.status,margin:fit.margin,total:fit.total});
 for(const r of test){
  const f=forecasts.get(r.game_id);if(!f||!Number.isFinite(f.home_line)||!f.distribution)continue;
  const forecast={model_version:version,home_score_mean:r.base_home,away_score_mean:r.base_away,evidence:f.evidence?.scoring||{},distribution:f.distribution};
  const learned=applyScoreLearning(forecast,fit),delta=r.actual_home-r.actual_away+f.home_line,y=delta===0?null:Number(delta>0),draw=p=>simulateGameDistribution(r.game_id,{model:p,distribution:f.distribution});
  const bp=outcomeProbabilities(draw(forecast).map(d=>d.margin),-f.home_line,'OVER'),lp=outcomeProbabilities(draw(learned).map(d=>d.margin),-f.home_line,'OVER');
  const grade=p=>y===null?'PUSH':Math.abs(p-.5)<1e-12?'EVEN':Number(p>.5)===y?'WIN':'LOSS';
  results.push({...r,scope:week<targetWeek?'PREVIOUS_WEEKS_REPLAY':'LATER_WEEK_CHECK',home_line:f.home_line,base:{home:r.base_home,away:r.base_away,probability:bp.conditional_win_probability,grade:grade(bp.conditional_win_probability)},learned:{home:learned.home_score_mean,away:learned.away_score_mean,probability:lp.conditional_win_probability,grade:grade(lp.conditional_win_probability)},outcome:y,training_games:fit.n});
 }
}
function metrics(rs,kind){
 const scored=rs.filter(r=>r.outcome!==null),point=(r,k)=>r[k],mae=fn=>rs.reduce((s,r)=>s+fn(r),0)/rs.length;
 return {team_score_mae:mae(r=>(Math.abs(r[kind].home-r.actual_home)+Math.abs(r[kind].away-r.actual_away))/2),margin_mae:mae(r=>Math.abs(r[kind].home-r[kind].away-r.actual_home+r.actual_away)),total_mae:mae(r=>Math.abs(r[kind].home+r[kind].away-r.actual_home-r.actual_away)),spread_brier:scored.reduce((s,r)=>s+(r[kind].probability-r.outcome)**2,0)/scored.length,spread_log_loss:scored.reduce((s,r)=>s-Math.log(r.outcome?r[kind].probability:1-r[kind].probability),0)/scored.length,wins:rs.filter(r=>r[kind].grade==='WIN').length,losses:rs.filter(r=>r[kind].grade==='LOSS').length,pushes:rs.filter(r=>r[kind].grade==='PUSH').length,even:rs.filter(r=>r[kind].grade==='EVEN').length};
}
const summary=rs=>({games:rs.length,weeks:new Set(rs.map(r=>r.week)).size,base:metrics(rs,'base'),learned:metrics(rs,'learned')});
const prior=results.filter(r=>r.week<targetWeek),later=results.filter(r=>r.week===targetWeek);
const report={schema_version:1,model_version:SCORE_LEARNING_VERSION,base_model_version:version,code_sha256:codeHash,ledger_sha256:createHash('sha256').update(JSON.stringify({forecasts:ledger.forecasts,settlements:ledger.settlements})).digest('hex'),validation_through_week:targetWeek-1,method:'EARLIER_WEEK_ONLY_FROZEN_FORECAST_REPLAY',sportsbook_inputs_used_for_fit:false,policy:SCORE_LEARNING_POLICY,results:summary(prior),later_week_check:later.length?summary(later):null,by_week:folds.map(f=>({...f,...summary(results.filter(r=>r.week===f.week))})),limitations:['Retrospective walk-forward test of a newly written learner on original saved score forecasts, not a claim the learner was issued before those historical games.','Final observation retrieval time is relaxed only for this explicit historical replay; target-week results and future forecasts remain excluded.','The target week is a later-week diagnostic, not a fresh unseen prospective test, and does not enter the promotion gate or fitting for that week.','One original score forecast per game; sportsbook lines are used only to grade cover probability after score prediction.','No claimed profitability; promotion requires simultaneous point-error and cover-probability improvement.'],rows:results};
report.gate=scoreLearningGate(report,codeHash);report.status=report.gate.passed?'VALIDATION_PASSED':'VALIDATION_FAILED';
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,gate:report.gate,results:report.results,later_week_check:report.later_week_check,by_week:report.by_week},null,2));
