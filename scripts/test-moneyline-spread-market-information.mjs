import assert from 'node:assert/strict';
import {historicalPrice,informationFeatures,fitInformationModel,predictInformationModel,chronologicalExperiment} from '../lib/moneyline-spread-market-information.mjs';
const base={game_id:'2026-W1-TEST',home_team:'CHI',away_team:'GB',market:'spread',week:1,forecast_available_at:'2026-09-01T00:00Z',decision_at:'2026-09-02T00:00Z',kickoff:'2026-09-03T00:00Z',home_line:-3.5,sportsbook_probability:.52,football_probability:.6,outcome:1,existing_variables:{home_score_mean:25,away_score_mean:21,team_score_sd:9,home_away_score_correlation:0},polymarket:{game_id:'2026-W1-TEST',home_team:'CHI',away_team:'GB',kickoff:'2026-09-03T00:00Z',market:'spread',home_line:-3.5,price_at:'2026-09-01T23:59Z',probability:.55}};
const t=Date.parse(base.decision_at)/1000;
assert.equal(historicalPrice([{t:t-60,p:.55},{t:t+60,p:.99}],base.decision_at,base.kickoff).p,.55);
assert.equal(historicalPrice([{t:t-7200,p:.8}],base.decision_at,base.kickoff),null);
assert.throws(()=>informationFeatures({...base,market:'total'}));
assert.throws(()=>informationFeatures({...base,market:'prop'}));
assert.throws(()=>informationFeatures({...base,forecast_available_at:'2026-09-02T00:01Z'}));
assert.throws(()=>informationFeatures({...base,polymarket:{...base.polymarket,price_at:'2026-09-02T00:01Z'}}));
assert.throws(()=>informationFeatures({...base,polymarket:{...base.polymarket,home_line:-4.5}}));
assert.throws(()=>informationFeatures({...base,sportsbook_probability:null}));
const rows=Array.from({length:64},(_,i)=>({...base,game_id:'game-'+i,polymarket:{...base.polymarket,game_id:'game-'+i},week:Math.floor(i/16)+1,outcome:i%3===0?0:1,football_probability:i%3===0?.4:.65}));
const a=chronologicalExperiment(rows,true),changed=rows.map(r=>r.week===4?{...r,outcome:1-r.outcome}:r),b=chronologicalExperiment(changed,true);
assert.deepEqual(a.model,b.model,'Week 4 outcomes must not tune any coefficient or setting');
assert.deepEqual(a.predictions.map(p=>p.probability),b.predictions.map(p=>p.probability));
assert(a.model.training_game_ids.every(id=>Number(id.split('-')[1])<48));
assert.throws(()=>chronologicalExperiment([...rows,rows[0]],true));
assert.throws(()=>fitInformationModel([{...base,polymarket:null}],['polymarket_minus_market_logit'],1));
assert(predictInformationModel(a.model,base)>0&&predictInformationModel(a.model,base)<1);
console.log('PASS: Week 1 included; future/stale prices, wrong lines, missing values, totals/props and duplicate games rejected; untouched Week 4 cannot affect fit');

const collinear=rows.slice(0,32).map((r,i)=>({...r,existing_variables:{...r.existing_variables,team_score_sd:8+i/100,home_away_score_correlation:1-(8+i/100)}}));const collapsed=fitInformationModel(collinear,['team_score_sd','home_away_score_correlation'],1);assert.deepEqual(collapsed.columns,['team_score_sd']);assert.equal(collapsed.excluded_columns[0].reason,'EXACTLY_COLLINEAR_WITH_team_score_sd');

assert.throws(()=>informationFeatures({...base,polymarket:{...base.polymarket,home_team:'DET'}}));assert.throws(()=>informationFeatures({...base,polymarket:{...base.polymarket,kickoff:'2026-09-04T00:00Z'}}));
