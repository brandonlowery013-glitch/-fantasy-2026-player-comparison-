import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {appendForecasts,appendFinal,newLedger,gameFeatures,totalFeatures,candidateFor,availableTraining,fitResidual,FACTORS,TOTAL_FACTORS,TOTAL_RULE,UNSUPPORTED,RULE} from '../lib/postgame-model-learning.mjs';
import {finalResult} from '../lib/pick-settlement.mjs';
import {finalBehavior,appendBehavior,behaviorState,classifyFactor} from '../lib/football-learning.mjs';
const path='data/market/postgame-model-learning-2026.json';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const save=(p,r)=>{const text=JSON.stringify(r,null,2)+'\n';if(!fs.existsSync(p)||fs.readFileSync(p,'utf8')!==text)fs.writeFileSync(p,text);};
let ledger=fs.existsSync(path)?read(path):newLedger();
const inputFingerprint=createHash('sha256').update(JSON.stringify([ledger.forecasts,ledger.settlements,ledger.observations])).digest('hex');
const now=new Date().toISOString(),schedule=read('data/calibration/weekly-event-schedule-2026.json');
const norm=t=>({LA:'LAR',WAS:'WSH',JAC:'JAX'}[t]||t);
if(process.argv.includes('--capture')){
 const forecasts=read('data/probability/generated/weekly-game-projections-2026.json'),markets=read('data/market/weekly-game-market-recommendations-2026.json');
 const state=behaviorState(ledger.observations||[],{season:2026,week:schedule.week,asOf:now});
 const records=[];
 for(const [id,g] of Object.entries(forecasts.games||{})){
  if(Date.parse(g.event_start)<=Date.parse(now))continue;
  const event=schedule.games[id];if(!event?.event_id)throw Error('Missing forecast event identity');
  const row={game_id:id,season:2026,week:schedule.week,event_id:String(event.event_id),kickoff:g.event_start,home_team:norm(g.home_team),away_team:norm(g.away_team),captured_at:now,source_generated_at:forecasts.generated_at,source:'weekly-game-projections-2026.json',model_version:g.model_version,home_score_mean:g.model.home_score_mean,away_score_mean:g.model.away_score_mean,probability:g.model.home_win_probability/(1-g.model.tie_probability),distribution:g.distribution,features:null,evidence:{scoring:g.scoring_evidence,personnel:g.personnel_context,context:markets.games?.[id]?.context_evidence,markets:markets.games?.[id]?.snapshot_evaluations?.map(s=>({snapshot_id:s.snapshot_id,book:s.book,captured_at:s.captured_at,market:s.market,public_betting_context:Object.fromEntries(Object.entries(s.markets||{}).map(([k,v])=>[k,v.public_betting_context||null])),decisions:Object.fromEntries(Object.entries(s.markets||{}).map(([k,v])=>[k,v.recommendation]))}))||[]}};
  row.market='moneyline';row.market_context=markets.games?.[id]?.snapshot_evaluations?.find(s=>s.snapshot_id===markets.games?.[id]?.current_recommendations?.snapshot_id)?.markets?.moneyline?.public_betting_context||null;row.features=gameFeatures(row,state);row.candidate=candidateFor(ledger,row,now);records.push(row);
  const mg=markets.week===schedule.week?markets.games?.[id]:null;
  const quote=(mg?.snapshot_evaluations||[]).find(s=>s.snapshot_id===mg.current_recommendations?.snapshot_id);
  const cover=quote?.markets?.spread?.side_a?.conditional_win_probability;
  if(quote?.eligible_for_current_recommendation===true&&Number.isFinite(cover)&&Number.isFinite(quote.market?.home_spread)&&Date.parse(quote.captured_at)<=Date.parse(now)){
   const spread={...row,market:'spread',home_line:quote.market.home_spread,probability:cover,quote_snapshot_id:quote.snapshot_id,market_context:quote.markets.spread.public_betting_context||null};
   spread.features=gameFeatures(spread,state);spread.candidate=candidateFor(ledger,spread,now);records.push(spread);
  }
  const over=quote?.markets?.total?.side_a?.conditional_win_probability;
  if(quote?.eligible_for_current_recommendation===true&&Number.isFinite(over)&&over>0&&over<1&&Number.isFinite(quote.market?.total)&&Date.parse(quote.captured_at)<=Date.parse(now)){
   const total={...row,market:'total',total_line:quote.market.total,probability:over,quote_snapshot_id:quote.snapshot_id,market_context:null};
   total.features=totalFeatures(total,state);total.candidate=candidateFor(ledger,total,now);records.push(total);
  }
 }
 ledger=appendForecasts(ledger,records);
}
if(process.argv.includes('--settle')){
 const finals=new Map(ledger.settlements.map(s=>[s.forecast_id,s]));
 // Catch up every archived game, including PASS/WAIT and games older than a week.
 // Fetch each pending game once; retain the normal seven-day correction window.
 const due=ledger.forecasts.filter(f=>Date.parse(f.kickoff)<Date.parse(now)&&(!finals.has(f.forecast_id)||Date.parse(now)-Date.parse(f.kickoff)<7*86400000));
 const errors=[],summaries=new Map();
 for(const f of due){try{
  const url=`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${encodeURIComponent(f.event_id)}`;
  let summary=summaries.get(f.event_id);if(!summary){const response=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error(`HTTP ${response.status}`);summary=await response.json();summaries.set(f.event_id,summary);}
  const result=finalResult(summary,f);if(!result)continue;
  const kickoff=summary.header?.competitions?.[0]?.date;
  ledger=appendFinal(ledger,f.game_id,{...result,kickoff,verified_final:true,source:{url,sha256:createHash('sha256').update(JSON.stringify(summary)).digest('hex')}},now,f.forecast_id);
  ledger.observations=appendBehavior(ledger.observations,finalBehavior(summary,f,{season:f.season,week:f.week,observedAt:now}));

 }catch(e){errors.push(`${f.game_id}: ${e.message}`);}}
 if(errors.length)throw Error(errors.join('\n')); // Do not persist a partially fetched batch.
}
const changed=createHash('sha256').update(JSON.stringify([ledger.forecasts,ledger.settlements,ledger.observations])).digest('hex')!==inputFingerprint;
if(!changed&&ledger.current_fit?.total&&ledger.learning_week===schedule.week&&ledger.rule_id===RULE){console.log(JSON.stringify({status:'NO_NEW_LEARNING_EVIDENCE',forecasts:ledger.forecasts.length,settlements:ledger.settlements.length}));}else{
const training=availableTraining(ledger,{week:schedule.week,asOf:now});
const models=Object.fromEntries(['moneyline','spread','total'].map(m=>[m,fitResidual(training.filter(r=>(r.market||'moneyline')===m),m==='total'?TOTAL_FACTORS:FACTORS,m==='total'?TOTAL_RULE:RULE)]));
const model=models.moneyline;
const latest=new Map(ledger.settlements.map(s=>[s.forecast_id,s]));
ledger.candidate_pairs=ledger.forecasts.filter(f=>f.candidate&&latest.get(f.forecast_id)?.outcome!==null&&latest.has(f.forecast_id)).map(f=>{const s=latest.get(f.forecast_id);return {prediction_id:f.forecast_id,...(f.market==='total'?{game_id:f.game_id,total_line:f.total_line}:{}),market:f.market||'moneyline',rule_id:f.candidate.rule_id,week:f.week,model_version:f.model_version,rule_frozen_at:f.captured_at,captured_at:f.captured_at,kickoff:f.kickoff,settled_at:s.observed_at,verified_final:true,result:s.outcome,core_probability:f.probability,candidate_probability:f.candidate.candidate_probability};});
const state=behaviorState(ledger.observations||[],{season:2026,week:schedule.week,asOf:now});
ledger.current_fit=models;ledger.team_and_player_state=state;
ledger.validation=Object.fromEntries(['moneyline','spread','total'].map(m=>{const rule=m==='total'?TOTAL_RULE:RULE,pairs=ledger.candidate_pairs.filter(p=>p.market===m&&p.rule_id===rule),trial={factor:'postgame_residual',market:m,rule_id:rule,prospective:true,independent_holdout:true,rule_frozen_at:pairs[0]?.rule_frozen_at||now,pairs};return [m,classifyFactor(trial)];}));
ledger.rule_id=RULE;
ledger.status='AUTOMATIC_LEARNING_CHALLENGER_NOT_PROMOTED';
ledger.production_numeric_authority=0;ledger.learning_week=schedule.week;ledger.updated_at=now;
ledger.feature_status=Object.fromEntries(Object.entries(FACTORS).map(([k,label])=>[k,{label,status:model.coefficients.some(c=>c.key===k)?'FITTED_CHALLENGER':'INSUFFICIENT_FROZEN_FEATURE_HISTORY',numeric_authority:0}]));
ledger.unsupported_features=UNSUPPORTED;
ledger.policy='Automatically learn from verified finals and dated game information; freeze candidates before kickoff; original picks remain immutable; production promotion uses existing paired holdout/review governance, not outcome-driven overrides.';
save(path,ledger);
console.log(JSON.stringify({forecasts:ledger.forecasts.length,settlements:ledger.settlements.length,observations:ledger.observations?.length||0,training_games:model.n,candidate_pairs:ledger.candidate_pairs.length,validation:ledger.validation,coefficients:model.coefficients.map(c=>c.key),production_numeric_authority:0}));

}
