import fs from 'node:fs';
import {simulateGameDistribution,moneylineProbabilities,outcomeProbabilities} from '../lib/game-market-probability.mjs';
import {fairTwoWayAmerican} from '../lib/fair-market-probability.mjs';
import {historicalPrice,chronologicalExperiment,probabilityMetrics} from '../lib/moneyline-spread-market-information.mjs';
const dir='data/research/moneyline-spread-market-information/';
const inputs=JSON.parse(fs.readFileSync(dir+'historical-inputs.json','utf8')),histories=JSON.parse(fs.readFileSync(dir+'polymarket-price-history.json','utf8')).histories;
const dataset=[],excluded=[];const draws=new Map();
for(const input of inputs.rows){
  const g=input.forecast.game,s=input.sportsbook_snapshot,isML=input.market==='moneyline';
  if(!draws.has(input.game_id))draws.set(input.game_id,simulateGameDistribution(input.game_id,g));
  const probability=isML?moneylineProbabilities(draws.get(input.game_id),'HOME'):outcomeProbabilities(draws.get(input.game_id).map(d=>d.margin),-input.home_line,'OVER');
  const actual=input.verified_final.home-input.verified_final.away,adjusted=actual+(input.home_line||0);
  if((isML?actual:adjusted)===0){excluded.push({game_id:input.game_id,market:input.market,reason:'PUSH_OR_TIE_EXCLUDED_FROM_CONDITIONAL_WIN_TEST'});continue;}
  const football=isML?g.model.home_win_probability/(g.model.home_win_probability+g.model.away_win_probability):probability.conditional_win_probability;
  const fair=fairTwoWayAmerican(isML?s.home_moneyline:s.home_spread_price,isML?s.away_moneyline:s.away_spread_price);
  const history=histories[input.game_id+'|'+input.market];const point=history?historicalPrice(history.points,input.decision_at,input.kickoff):null;
  // Polymarket pays half on tied moneylines; sportsbook ties refund the stake.
  // Convert trade-price expected payout to a conditional win estimate using the frozen tie probability.
  const push=isML?g.model.tie_probability:probability.push_probability;
  const converted=point?(point.p-.5*push)/(1-push):null;
  const valid=typeof converted==='number'&&converted>0&&converted<1;
  dataset.push({game_id:input.game_id,home_team:g.home_team,away_team:g.away_team,week:input.week,market:input.market,home_line:input.home_line,kickoff:input.kickoff,forecast_available_at:input.forecast.forecast_available_at,decision_at:input.decision_at,outcome:(isML?actual:adjusted)>0?1:0,football_probability:football,sportsbook_probability:fair.fair_side_a_probability,model_version:g.model_version||'LEGACY_PRIOR_SCORING_MODEL',existing_variables:{home_score_mean:g.model.home_score_mean,away_score_mean:g.model.away_score_mean,team_score_sd:g.distribution.team_score_sd,home_away_score_correlation:g.distribution.home_away_score_correlation,scoring_evidence:g.scoring_evidence||null,neutral_site:g.neutral_site??null,home_field_advantage_applied:g.home_field_advantage_applied??null,personnel_context_present:!!g.personnel_context,personnel_numeric_adjustment_applied:g.scoring_evidence?.personnel_numeric_adjustment_applied??false,granular_matchup_numeric_adjustment_applied:g.scoring_evidence?.granular_matchup_numeric_adjustment_applied??false},polymarket:valid?{...input.polymarket_contract,game_id:input.game_id,price_at:new Date(point.t*1000).toISOString(),trade_price:point.p,probability:converted,normalization:isML?'HALF_TIE_PAYOFF_TO_CONDITIONAL_WIN_USING_FROZEN_MODEL_TIE_PROBABILITY':'EXACT_HALF_POINT_SPREAD_NO_PUSH'}:null,polymarket_missing_reason:valid?null:input.historical_price_error||'NO_FRESH_PREGAME_TRADE_PRICE',provenance:{forecast_commit:input.forecast.source_commit,sportsbook_snapshot_id:s.snapshot_id,final_event_id:input.verified_final.event_id,history_source_sha256:history?.sha256??null}});
}
const results={};
for(const market of ['moneyline','spread']){
  const rows=dataset.filter(r=>r.market===market);
  results[market]={by_week:Object.fromEntries([1,2,3,4].map(w=>[w,{games:rows.filter(r=>r.week===w).length,polymarket_matched:rows.filter(r=>r.week===w&&r.polymarket).length}])),four_week_baselines:{football:probabilityMetrics(rows,r=>r.football_probability),sportsbook:probabilityMetrics(rows,r=>r.sportsbook_probability)},calibrated_sportsbook_benchmark:chronologicalExperiment(rows,false,'book_only'),existing_variables_plus_market:chronologicalExperiment(rows,false),paired_calibrated_sportsbook_benchmark:chronologicalExperiment(rows,true,'book_only'),paired_calibrated_two_market_benchmark:chronologicalExperiment(rows,true,'markets_only'),existing_variables_plus_market_and_polymarket:chronologicalExperiment(rows,true)};
}
const report={schema_version:1,generated_at:new Date().toISOString(),status:'RESEARCH_COMPLETE',scope:['moneyline','spread'],weeks:[1,2,3,4],week_1_included:true,model_game_count:new Set(inputs.rows.map(r=>r.game_id)).size,rows:dataset.length,results,excluded,existing_variable_policy:'Original football probabilities retain the combined influence of all variables actually used at the time. Archived score means, uncertainty and correlation also enter the penalized candidate. Scoring evidence is retained verbatim. Context-only personnel/matchup inputs and absent historical consensus/money-flow records are not misrepresented as validated numeric inputs.',emh:'Market prices are the null benchmark. Existing model and Polymarket variables must improve the same untouched-game probability scores beyond that benchmark.',polymarket_contract_limits:'Only exact game/team/kickoff/line matches. Integer spreads are not silently mapped to a different half-point market. Historical trade prices lack archived depth and fees; retrospective evidence is not executable-return evidence.',original_issued_picks_rewritten:false,production_numeric_authority:0,promotion_allowed:false};
fs.writeFileSync(dir+'paired-feature-rows.json',JSON.stringify({schema_version:1,rows:dataset},null,2)+'\n');
fs.writeFileSync(dir+'four-week-test-results.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
