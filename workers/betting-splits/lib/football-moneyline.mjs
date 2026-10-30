import {candidateProbability} from './spread-learning.mjs';
import {copyGameFeed} from './copy-game-feed.mjs';
import {assertSelectedBetting} from './selected-model-policy.mjs';
export const FOOTBALL_MONEYLINE_VERSION='ctd-football-moneyline-v1';
const finite=x=>typeof x==='number'&&Number.isFinite(x),time=Date.parse;
const canon=t=>({LAR:'LA',WSH:'WAS'}[t]||t),implied=o=>o<0?-o/(100-o):100/(100+o);

export function footballProbability(game,projection,generatedAt,now=Date.now(),learning=null){
 if(!projection||canon(projection.home_team)!==canon(game.home_team)||canon(projection.away_team)!==canon(game.away_team)||time(projection.event_start)!==time(game.kickoff))throw Error('Matching football forecast required');
 if(projection.sportsbook_inputs_used!==false||!Number.isFinite(time(generatedAt))||time(generatedAt)>now||time(generatedAt)>=time(game.kickoff))throw Error('Verified pregame football source required');
 if(projection.personnel_matchup?.status!=='EXPERIMENTAL_CONDITIONAL'||now-time(generatedAt)>30*60000)throw Error('Fresh personnel and matchup context required');
 const m=projection.model,home=m?.home_win_probability,away=m?.away_win_probability,tie=m?.tie_probability;
 if(![home,away,tie].every(p=>finite(p)&&p>=0&&p<=1)||Math.abs(home+away+tie-1)>1e-5||home+away<=0)throw Error('Invalid football win probabilities');
 const row=learning?.games?.[game.game_id];
 if(learning?.learning_enabled!==true||learning?.model_version!==FOOTBALL_MONEYLINE_VERSION||learning?.fit?.rule_id!=='football-only-postgame-residual-v1'||!Number.isFinite(time(learning.generated_at))||time(learning.generated_at)>now||now-time(learning.generated_at)>24*3600000||!row||canon(row.home_team)!==canon(game.home_team)||canon(row.away_team)!==canon(game.away_team)||time(row.kickoff)!==time(game.kickoff))throw Error('Current football-only learning state required');
 const allowed=['probability_confidence','scoring_margin','offensive_plays','pass_play_share','rush_yards_per_attempt','turnovers','sacks_allowed','third_down_rate','red_zone_rate','net_yards_per_play','possession_seconds'];if(!learning.fit.coefficients.every(c=>allowed.includes(c.key)))throw Error('Market or unverified factor in football learning');
 const base=home/(home+away),features={...row.features,probability_confidence:Math.log(base/(1-base)),scoring_margin:(m.home_score_mean-m.away_score_mean)/10},learned=candidateProbability(learning.fit,base,features);
 return {home:learned,away:1-learned,tie,raw_home:home,raw_away:away,base_home:base,learning_change:learned-base,training_games:learning.fit.n,training_weeks:learning.training_weeks,learning_fingerprint:learning.fit.training_fingerprint,model_version:projection.model_version,generated_at:generatedAt,home_score_mean:m.home_score_mean,away_score_mean:m.away_score_mean,contexts:projection.personnel_matchup.contexts};
}
export function evaluateFootballMoneyline(game,projection,generatedAt,quote,policy={},now=Date.now(),learning=null){
 assertSelectedBetting(policy);const f=footballProbability(game,projection,generatedAt,now,learning),m=quote.market||quote;
 if(![m.home_moneyline,m.away_moneyline].every(o=>Number.isInteger(o)&&Math.abs(o)>=100)||!Number.isFinite(time(quote.captured_at))||time(quote.captured_at)>now||time(quote.captured_at)>=time(game.kickoff))throw Error('Fresh exact two-sided pregame quote required');
 const ih=implied(m.home_moneyline),ia=implied(m.away_moneyline),side=(p,odds,fair)=>({win_probability:p*(1-f.tie),push_probability:f.tie,loss_probability:(1-p)*(1-f.tie),conditional_win_probability:p,offered_odds:odds,probability_edge:p-fair,expected_value:(1-f.tie)*(p*(odds>0?odds/100:100/-odds)-(1-p)),expected_value_scope:'per_staked_unit'}),h=side(f.home,m.home_moneyline,ih/(ih+ia)),a=side(f.away,m.away_moneyline,ia/(ih+ia));
 const quoteFresh=now-time(quote.captured_at)<=6*3600000;
 const even=Math.abs(f.home-f.away)<1e-12,winner=f.home>f.away?game.home_team:game.away_team,best=h.expected_value>=a.expected_value?{s:h,t:game.home_team}:{s:a,t:game.away_team},v=best.s,pick=v.probability_edge>=(policy.minimum_probability_edge??.03)&&v.expected_value>=(policy.minimum_expected_value??.02),probability=Math.max(f.home,f.away);
 return {model_version:FOOTBALL_MONEYLINE_VERSION,model_prediction:{status:even?'EVEN':'MODEL_DIRECTION',selection:even?null:winner+' ML',team:even?null:winner,probability,confidence:probability<.52?'LOW':probability<.6?'MODERATE':'HIGH',exact_probability_tie:even,scope:'CTD personnel/matchup probability plus football-only learning; sportsbook odds used only for value'},side_a:h,side_b:a,fair_market:{method:'PROPORTIONAL_TWO_WAY',side_a_probability:ih/(ih+ia),side_b_probability:ia/(ih+ia),book_margin:ih+ia-1},quote:{snapshot_id:quote.snapshot_id,book:quote.book,captured_at:quote.captured_at,home_moneyline:m.home_moneyline,away_moneyline:m.away_moneyline,source:quote.source||'Saved sportsbook quote'},recommendation:!quoteFresh?{decision:'WAIT',selection:null,reason:'STALE_VALUE_QUOTE_FOOTBALL_DIRECTION_RETAINED'}:pick?{decision:'PICK',selection:best.t+' ML',confidence:v.probability_edge>=.08?'HIGH':v.probability_edge>=.05?'MODERATE':'LEAN',probability_edge:v.probability_edge,expected_value:v.expected_value,model_conditional_win_probability:v.conditional_win_probability}:{decision:'PASS',selection:null,reason:even?'EVEN_MODEL_PROBABILITY':'NO_EDGE_CLEARS_EXISTING_THRESHOLDS'},value_policy:{minimum_probability_edge:policy.minimum_probability_edge??.03,minimum_expected_value:policy.minimum_expected_value??.02,minimum_win_probability:null,reason:'Moneyline value is price-dependent; no generic 52% winner-confidence gate.'},calibration:{football_probability:f.base_home,book_probability:h.conditional_win_probability-h.probability_edge,calibrated_probability:f.base_home,learning_change:f.learning_change,training_games:f.training_games,correction_enabled:true},football_source:f,selection_exception:null};
}
export function overlayFootballMoneyline(base,projections,quoteContext,now=Date.now(),learning=null){
 const out=copyGameFeed(base);out.moneyline_model_version=FOOTBALL_MONEYLINE_VERSION;let ready=0,held=0;
 for(const [id,g]of Object.entries(out.games||{})){
  if(time(g.kickoff)<=now)continue;g.game_id=id;
  delete g.moneyline_selection_context;g.current_recommendations||={};
  const source=projections?.season===base.season&&projections.week===base.week?projections.games?.[id]:null;
  let latest=null;
  const qg=quoteContext?.games?.[id],fresh=qg&&canon(qg.home_team)===canon(g.home_team)&&canon(qg.away_team)===canon(g.away_team)&&time(qg.kickoff)===time(g.kickoff)?qg.quote:null;
  const quotes=new Map();for(const q of (g.snapshot_evaluations||[]).filter(q=>q.eligible_for_current_recommendation!==false).sort((a,b)=>time(b.captured_at)-time(a.captured_at)))if(!quotes.has(q.book))quotes.set(q.book,q);
  for(const q of g.snapshot_evaluations||[]){
   q.markets||={};
   if(quotes.get(q.book)!==q){q.markets.moneyline={model_version:FOOTBALL_MONEYLINE_VERSION,recommendation:{decision:'WAIT',reason:'HISTORICAL_QUOTE_NOT_REEVALUATED'}};continue;}
   try{const chosen=fresh?.book===q.book&&time(fresh.captured_at)>time(q.captured_at)?fresh:q,e=evaluateFootballMoneyline({...g,game_id:id},source,projections.generated_at,chosen,base.recommendation_policy,now,learning?.season===base.season&&learning?.week===base.week?learning:null);q.markets.moneyline=e;q.moneyline_quote=e.quote;if(!latest||e.quote.book==='draftkings'&&latest.quote.book!=='draftkings'||e.quote.book===latest.quote.book&&time(e.quote.captured_at)>time(latest.quote.captured_at))latest=e;}
   catch{q.markets.moneyline={model_version:FOOTBALL_MONEYLINE_VERSION,recommendation:{decision:'WAIT',reason:'VERIFIED_FOOTBALL_MONEYLINE_INPUTS_UNAVAILABLE'}};}
  }
  g.moneyline_model={version:FOOTBALL_MONEYLINE_VERSION,status:latest?'CURRENT':'UNAVAILABLE',checked_at:new Date(now).toISOString(),training_games:latest?.football_source.training_games||0,learned_correction_enabled:true,automatic_upset_override_enabled:false,current_prediction:latest?.model_prediction||null,current_quote:latest?.quote||null};
  g.current_recommendations.moneyline=latest?.recommendation||{decision:'WAIT',reason:'VERIFIED_FOOTBALL_MONEYLINE_INPUTS_UNAVAILABLE'};
  if(latest){ready++;const p=latest.model_prediction,selectedHome=p.team===g.home_team,book=selectedHome?latest.fair_market.side_a_probability:latest.fair_market.side_b_probability;g.football_moneyline_driver={kind:'moneyline',status:p.selection?'VERIFIED':'NO_DIRECTION',selection:p.selection,probability:p.probability,decision:latest.recommendation.decision,model_version:FOOTBALL_MONEYLINE_VERSION,quote:latest.quote,stages:{football:p.probability,sportsbook:book,final:p.probability},rows:[{id:'football',label:'CTD football score distribution',change:null,after_probability:p.probability,display_value:g.home_team+' '+latest.football_source.home_score_mean+' projected points; '+g.away_team+' '+latest.football_source.away_score_mean+' projected points'}],football_only:true,note:'Win chance comes directly from the saved CTD football score distribution. Sportsbook prices affect value and the bet decision only. Earlier-week verified football results supply a bounded learned correction. No automatic upset override is applied. Win chances exclude ties; tie/refund probability is shown separately.',simulation:source.distribution};}else held++;
 }
 out.moneyline_model_status=held?(ready?'PARTIAL':'UNAVAILABLE'):'CURRENT';return out;
}
export function attachFootballMoneylineDrivers(feed){
 for(const g of Object.values(feed.games||{}))if(g.football_moneyline_driver){g.model_drivers||={markets:[]};g.model_drivers.markets=[...(g.model_drivers.markets||[]).filter(m=>m.kind!=='moneyline'),g.football_moneyline_driver];}
 return feed;
}
