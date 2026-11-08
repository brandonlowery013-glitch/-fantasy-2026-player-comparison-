// Preserve the Week 1 seed and append only matching frozen pregame forecasts
// with verified earlier-week finals and their exact original two-sided quotes.
export function cumulativeSpreadTraining(seed,ledger,markets,week,asOf){
 const canon=t=>({LAR:'LA',WSH:'WAS',JAC:'JAX'}[t]||t);
 const now=Date.parse(asOf),rows=seed.filter(r=>r.week<week&&(!r.source_final_observed_at||Date.parse(r.source_final_observed_at)<=now)),seen=new Set(rows.map(r=>r.game_id)),skipped=[];
 const finals=new Map();
 for(const s of ledger.settlements||[])if(s.verified_final===true&&Date.parse(s.observed_at)<=now){const old=finals.get(s.forecast_id);if(!old||Date.parse(s.observed_at)>=Date.parse(old.observed_at))finals.set(s.forecast_id,s);}
 const finite=x=>typeof x==='number'&&Number.isFinite(x);
 for(const f of ledger.forecasts||[]){
  if(f.market!=='spread'||f.season!==2026||f.week>=week||seen.has(f.game_id))continue;
  const s=finals.get(f.forecast_id),g=markets.games?.[f.game_id];
  const qid=f.quote_snapshot_id||f.evidence?.quote_snapshot_id;
  const q=g?.snapshots?.find(q=>q.snapshot_id===qid);
  if(!s||!q||f.frozen!==true||String(s.event_id)!==String(f.event_id)||canon(g.home_team)!==canon(f.home_team)||canon(g.away_team)!==canon(f.away_team)||Date.parse(g.kickoff)!==Date.parse(f.kickoff)||Date.parse(f.captured_at)>=Date.parse(f.kickoff)||Date.parse(f.source_generated_at)>Date.parse(f.captured_at)||Date.parse(q.captured_at)>Date.parse(f.captured_at)||q.home_spread!==f.home_line||![q.home_spread_price,q.away_spread_price,f.probability,f.home_score_mean,f.away_score_mean,f.distribution?.team_score_sd,f.distribution?.home_away_score_correlation,s.home_score,s.away_score].every(finite)){
   skipped.push({game_id:f.game_id,reason:'Missing or mismatched frozen forecast, original quote or verified final'});continue;
  }
  const implied=o=>o<0?-o/(100-o):100/(100+o),h=implied(q.home_spread_price),a=implied(q.away_spread_price),margin=s.home_score-s.away_score+f.home_line;
  rows.push({game_id:f.game_id,market:'spread',season:2026,week:f.week,home_team:canon(f.home_team),away_team:canon(f.away_team),kickoff:f.kickoff,decision_at:f.captured_at,forecast_available_at:f.source_generated_at,home_line:f.home_line,home_odds:q.home_spread_price,away_odds:q.away_spread_price,sportsbook_probability:h/(h+a),football_probability:f.probability,existing_variables:{home_score_mean:f.home_score_mean,away_score_mean:f.away_score_mean,team_score_sd:f.distribution.team_score_sd,home_away_score_correlation:f.distribution.home_away_score_correlation},learning_features:f.features||{},frozen_base_probability:f.probability,outcome:margin===0?null:Number(margin>0),source_forecast_id:f.forecast_id,source_quote_id:qid,source_final_observed_at:s.observed_at,source:'Verified archived forecast and exact original quote; original probabilities preserved'});
  seen.add(f.game_id);
 }
 return {rows,skipped,training_weeks:[...new Set(rows.filter(r=>r.week<week).map(r=>r.week))].sort((a,b)=>a-b)};
}
