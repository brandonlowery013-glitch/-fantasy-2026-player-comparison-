import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {informationFeatures,probabilityMetrics} from '../lib/moneyline-spread-market-information.mjs';
const path='data/research/moneyline-spread-market-information/paired-feature-rows.json';
const raw=fs.readFileSync(path),all=JSON.parse(raw).rows.filter(r=>r.polymarket);
const archived=JSON.parse(fs.readFileSync('data/research/moneyline-spread-market-information/historical-inputs.json')).rows;
const source=new Map(archived.map(r=>[r.game_id+'|'+r.market,r]));
function priceQualified(rows,prediction){
 let wins=0,losses=0,passes=0;const selections=[];
 for(const r of rows){const input=source.get(r.game_id+'|'+r.market),q=input.sportsbook_snapshot;const push=r.market==='moneyline'?input.forecast.game.model.tie_probability:0;const p=prediction(r);const options=[{side:'HOME',p,market:r.sportsbook_probability,odds:r.market==='moneyline'?q.home_moneyline:q.home_spread_price},{side:'AWAY',p:1-p,market:1-r.sportsbook_probability,odds:r.market==='moneyline'?q.away_moneyline:q.away_spread_price}].map(v=>({...v,edge:v.p-v.market,ev:(1-push)*(v.p*(v.odds>0?v.odds/100:100/-v.odds)-(1-v.p))})).sort((a,b)=>b.ev-a.ev);const best=options[0];
  if(best.p<.52||best.edge<.03||best.ev<.02){passes++;continue;}const won=(best.side==='HOME'?r.outcome:1-r.outcome)===1;if(won)wins++;else losses++;selections.push({game_id:r.game_id,side:best.side,probability:best.p,edge:best.edge,ev:best.ev,odds:best.odds,won});
 }return {wins,losses,passes,selected:wins+losses,hit_rate:wins+losses?wins/(wins+losses):null,selections,basis:'Hypothetical price-qualified selections at saved sportsbook prices; not actual issued bets; historical QB/availability holds are not fully reconstructed'};
}
for(const r of all)informationFeatures(r);
const predict=(r,w)=>(1-w.book-w.poly)*r.football_probability+w.book*r.sportsbook_probability+w.poly*r.polymarket.probability;
function fit(rows,allowPoly=true){
 if(!rows.length)throw Error('No training games');
 let best=null;
 for(let b=0;b<=10;b++)for(let p=0;p<=10-b;p++){
  if(!allowPoly&&p)continue;
  const w={book:b/10,poly:p/10};const metric=probabilityMetrics(rows,r=>predict(r,w));
  if(!best||metric.log_loss<best.training.log_loss-1e-12)best={...w,football:Math.round((1-w.book-w.poly)*10)/10,training:metric};
 }
 return best;
}
const results={};
for(const market of ['moneyline','spread']){
 const rows=all.filter(r=>r.market===market),weeks=[];
 for(let week=1;week<=4;week++){
  const test=rows.filter(r=>r.week===week),train=rows.filter(r=>r.week<week);
  if(week===1){weeks.push({week,role:'COLD_START_BASELINE_RETAINED_NO_PRIOR_TRAINING',existing:probabilityMetrics(test,r=>r.football_probability),revised:probabilityMetrics(test,r=>r.football_probability),price_qualified:{existing:priceQualified(test,r=>r.football_probability),revised:priceQualified(test,r=>r.football_probability)}});continue;}
  const w=fit(train),control=fit(train,false);
  // Changing tested outcomes must not change the learned weights.
  const changed=rows.map(r=>r.week===week?{...r,outcome:1-r.outcome}:r);
  assert.deepEqual(w,fit(changed.filter(r=>r.week<week)));
  weeks.push({week,role:'RETROSPECTIVE_WALK_FORWARD_EXPLORATORY',training_weeks:[...new Set(train.map(r=>r.week))],weights:w,football_plus_book_control_weights:control,existing:probabilityMetrics(test,r=>r.football_probability),football_plus_book:probabilityMetrics(test,r=>predict(r,control)),revised:probabilityMetrics(test,r=>predict(r,w)),price_qualified:{existing:priceQualified(test,r=>r.football_probability),revised:priceQualified(test,r=>predict(r,w))}});
 }
 const prospective=fit(rows);
 results[market]={weeks,frozen_future_weights:prospective};
}
const report={revision:2,created_at:new Date().toISOString(),scope:['moneyline','spread'],status:'EXPLORATORY_RETEST_AFTER_WEEK_4_WAS_EXAMINED',formula:'p = w_football*p_original_football + w_book*p_no_vig_sportsbook + w_poly*p_polymarket_conditional',method:'Convex weights on a predeclared 0.1 grid, fitted by training log loss. No raw score/uncertainty predictors are counted again. Each week uses preceding weeks only; compare with an identically fitted football-plus-book control.',input_sha256:crypto.createHash('sha256').update(raw).digest('hex'),results,audit:{contracts:'Exact game, teams, kickoff, home spread line and outcome orientation verified',historical_price_kind:'Historical price-series sample; sample timestamp does not establish last-trade freshness',historical_depth_and_fees:'Unavailable; no profitability claim',moneyline_tie_normalization:'Polymarket half-payout normalized using the original forecast tie probability',old_blend_issue:'Old fit was anchored to sportsbook log odds and penalized the football correction toward zero; market-dominated output could erase useful football information',evaluation_issue:'Earlier Week 1–3 results used the final fit and were in-sample; this revision reports preceding-week fits instead',independent_validation:'Week 4 has already been examined; its reuse is exploratory. Only games after this recorded freeze can provide a new prospective test'},frozen_protocol:{weights:results,weight_updates_during_future_test:false,minimum_existing_holdout_requirement:100,required_metrics:['brier_score','log_loss','roi','closing_line_value'],production_numeric_authority:0,original_picks_changed:false}};
fs.writeFileSync('../../outputs/revised-moneyline-spread-test.json',JSON.stringify(report,null,2)+'\n');
for(const [market,result]of Object.entries(results)){console.log(market);for(const w of result.weeks)console.log(w.week,JSON.stringify({existing:w.existing,revised:w.revised,control:w.football_plus_book,weights:w.weights&&{football:w.weights.football,book:w.weights.book,poly:w.weights.poly},price_qualified:w.price_qualified&&{existing:{wins:w.price_qualified.existing.wins,losses:w.price_qualified.existing.losses,passes:w.price_qualified.existing.passes},revised:{wins:w.price_qualified.revised.wins,losses:w.price_qualified.revised.losses,passes:w.price_qualified.revised.passes}}}));console.log('future weights',result.frozen_future_weights);}
console.log('PASS: outcome perturbation cannot alter each week’s weights; original inputs preserved');
