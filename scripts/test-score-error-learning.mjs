import assert from 'node:assert/strict';
import {scoreTrainingRows,fitScoreErrors,applyScoreLearning,scoreLearningGate,SCORE_LEARNING_VERSION} from '../lib/score-error-learning.mjs';

const version='scoring-decay-no-rest-2026-v2',asOf='2026-10-01T00:00:00Z',ledger={forecasts:[],settlements:[]};
for(let i=0;i<12;i++){
 const f={forecast_id:'f'+i,game_id:'g'+i,event_id:String(i),model_version:version,season:2026,week:i<6?1:2,home_team:'CHI',away_team:'GB',kickoff:i<6?'2026-09-06T17:00:00Z':'2026-09-13T17:00:00Z',captured_at:'2026-09-01T00:00:00Z',source_generated_at:'2026-08-31T00:00:00Z',home_score_mean:20+i,away_score_mean:20};
 ledger.forecasts.push(f);ledger.settlements.push({forecast_id:f.forecast_id,game_id:f.game_id,event_id:f.event_id,verified_final:true,home_score:22+i,away_score:19,observed_at:'2026-09-14T00:00:00Z'});
 // The same score appears in two market records and must count only once.
 ledger.forecasts.push({...f,forecast_id:'spread'+i,market:'spread',home_line:-7,odds:-110});ledger.settlements.push({...ledger.settlements.at(-1),forecast_id:'spread'+i});
}
const before=JSON.stringify(ledger),options={season:2026,week:3,asOf},rows=scoreTrainingRows(ledger,options);
assert.equal(rows.length,12);assert.equal(JSON.stringify(ledger),before);
assert.deepEqual(scoreTrainingRows({...ledger,forecasts:ledger.forecasts.map(f=>({...f,home_line:999,odds:9999}))},options),rows,'prices and spread lines cannot change score learning');
const future={...ledger.forecasts[0],forecast_id:'future',game_id:'future',week:3,kickoff:'2026-09-30T17:00:00Z'};
assert.equal(scoreTrainingRows({...ledger,forecasts:[...ledger.forecasts,future],settlements:[...ledger.settlements,{...ledger.settlements[0],forecast_id:'future',game_id:'future',observed_at:asOf}]},options).length,12,'target week excluded');
assert.equal(scoreTrainingRows(ledger,{...options,asOf:'2026-09-12T00:00:00Z'}).length,0,'future final observations excluded in live fitting');
const late={...ledger,settlements:ledger.settlements.map(s=>({...s,observed_at:'2026-10-02T00:00:00Z'}))};
assert.equal(scoreTrainingRows(late,options).length,0);assert.equal(scoreTrainingRows(late,{...options,historicalReplay:true}).length,12);
const fit=fitScoreErrors(rows,options),forecast={model_version:version,home_score_mean:28,away_score_mean:20,evidence:{contributions:{model_version:version,margin:{reconstructed:8},total:{reconstructed:48}}}};
const result=applyScoreLearning(forecast,fit);
assert.notEqual(result.home_score_mean,forecast.home_score_mean,'learning changes score means, not just metadata');
assert.equal(result.evidence.score_learning.base_home_score_mean,28);assert.equal(result.evidence.contributions.margin.reconstructed,result.home_score_mean-result.away_score_mean);
assert.throws(()=>applyScoreLearning(result,fit),/already applied/);assert.throws(()=>fitScoreErrors([...rows,rows[0]],options),/Duplicate/);
assert.throws(()=>fitScoreErrors(rows.map(r=>({...r,week:3})),options),/future/);
const warm=fitScoreErrors([],options);assert.equal(warm.status,'WARMUP');assert.equal(applyScoreLearning(forecast,warm).home_score_mean,28);
const valid={model_version:SCORE_LEARNING_VERSION,code_sha256:'code',ledger_sha256:'ledger',validation_through_week:2,method:'EARLIER_WEEK_ONLY_FROZEN_FORECAST_REPLAY',sportsbook_inputs_used_for_fit:false,results:{games:40,weeks:3,base:{team_score_mae:8,margin_mae:11,total_mae:11,spread_brier:.26},learned:{team_score_mae:7.8,margin_mae:10.8,total_mae:10.9,spread_brier:.25}}};
assert.equal(scoreLearningGate(valid,'code',{week:3,ledgerHash:'ledger'}).passed,true);
assert.equal(scoreLearningGate(valid,'changed').passed,false);assert.equal(scoreLearningGate(valid,'code',{week:4}).passed,false);assert.equal(scoreLearningGate(valid,'code',{ledgerHash:'changed'}).passed,false);
assert.equal(scoreLearningGate({...valid,results:{...valid.results,learned:{...valid.results.learned,total_mae:11.1}}},'code').passed,false,'a better win record cannot override worse total error');
assert.equal(scoreLearningGate({...valid,results:{...valid.results,games:39}},'code').passed,false);
console.log('PASS: score error learning applies to scores, excludes future data and market inputs, deduplicates games, preserves originals, updates attribution, and blocks stale/failed validation.');
