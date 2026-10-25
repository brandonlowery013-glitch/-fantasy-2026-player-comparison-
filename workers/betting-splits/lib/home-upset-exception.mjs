// A selection-only exception. It never changes calibrated probabilities or betting thresholds.
export const HOME_UPSET_RULE='both-prior-upset-wins-home-underdog-v1';
const canon=t=>({LAR:'LA',WSH:'WAS'}[t]||t),time=Date.parse,finite=Number.isFinite;
function previousGame(team,game,ledger,asOf){
 const season=game.season||Number(String(game.game_id||'').slice(0,4));
 const forecasts=(ledger.forecasts||[]).filter(f=>f.market==='moneyline'&&f.season===season&&[canon(f.home_team),canon(f.away_team)].includes(canon(team))&&finite(time(f.kickoff))&&time(f.kickoff)<Math.min(time(game.kickoff),time(asOf)));
 forecasts.sort((a,b)=>time(b.kickoff)-time(a.kickoff)||time(b.captured_at)-time(a.captured_at));const f=forecasts[0];if(!f)return null;
 const settled=(ledger.settlements||[]).filter(s=>s.forecast_id===f.forecast_id&&s.game_id===f.game_id&&String(s.event_id)===String(f.event_id)&&s.market==='moneyline'&&s.verified_final===true&&finite(time(s.observed_at))&&time(s.observed_at)<=time(asOf)&&[s.home_score,s.away_score].every(finite)).sort((a,b)=>(b.revision||0)-(a.revision||0)||time(b.observed_at)-time(a.observed_at))[0];if(!settled)return null;
 const quotes=(f.evidence?.markets||[]).filter(q=>finite(time(q.captured_at))&&time(q.captured_at)<time(f.kickoff)&&[q.market?.home_moneyline,q.market?.away_moneyline].every(o=>finite(o)&&Math.abs(o)>=100)).sort((a,b)=>(a.book!=='draftkings')-(b.book!=='draftkings')||time(b.captured_at)-time(a.captured_at));const q=quotes[0];if(!q)return null;
 const home=canon(team)===canon(f.home_team),own=q.market[home?'home_moneyline':'away_moneyline'],other=q.market[home?'away_moneyline':'home_moneyline'],won=home?settled.home_score>settled.away_score:settled.away_score>settled.home_score;
 return {team:canon(team),game_id:f.game_id,event_id:f.event_id,kickoff:f.kickoff,home_team:f.home_team,away_team:f.away_team,home_score:settled.home_score,away_score:settled.away_score,own_odds:own,opponent_odds:other,book:q.book,quote_at:q.captured_at,settled_at:settled.observed_at,won_as_underdog:won&&own>other};
}
export function homeUpsetContext(game,ledger,asOf){
 if(!finite(time(asOf))||!finite(time(game.kickoff))||time(asOf)>=time(game.kickoff))return null;
 const home=previousGame(game.home_team,game,ledger,asOf),away=previousGame(game.away_team,game,ledger,asOf);
 return {rule_id:HOME_UPSET_RULE,game_id:game.game_id,home_team:canon(game.home_team),away_team:canon(game.away_team),kickoff:game.kickoff,checked_at:asOf,home,away,both_won_as_underdogs:!!(home?.won_as_underdog&&away?.won_as_underdog)};
}
export function applyHomeUpsetException(e,game,quote){
 const c=game.moneyline_selection_context,m=quote.market||quote;
 if(!c||c.rule_id!==HOME_UPSET_RULE||c.game_id!==game.game_id||c.home_team!==canon(game.home_team)||c.away_team!==canon(game.away_team)||time(c.kickoff)!==time(game.kickoff)||time(c.checked_at)>=time(game.kickoff)||!c.both_won_as_underdogs||!c.home?.won_as_underdog||!c.away?.won_as_underdog||![m.home_moneyline,m.away_moneyline].every(finite)||m.home_moneyline<=m.away_moneyline)return e;
 const reason='Both teams won their previous game as underdogs. We select '+game.home_team+' as the home underdog.';
 return {...e,selection_exception:{...c,applied:true,reason,original_prediction:e.model_prediction,probabilities_unchanged:true},model_prediction:{...e.model_prediction,status:'MATCHUP_SELECTION',selection:game.home_team+' ML',team:game.home_team,probability:e.side_a.conditional_win_probability,confidence:e.side_a.conditional_win_probability<.52?'LOW':e.model_prediction.confidence,selection_basis:HOME_UPSET_RULE,reason,scope:'Home-underdog matchup selection; calibrated win probabilities unchanged'}};
}
