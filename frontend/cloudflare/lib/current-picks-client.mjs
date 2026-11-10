import {evaluateCalibratedSpread} from './spread-feed.mjs';
import {evaluateTwoWay,recommendation} from './current-market-evaluation.mjs';
import {currentProps} from './week9-props.mjs';
import {sportsbookBoard} from './current-sportsbook.mjs';
function outcomes(hist,threshold,direction){let win=0,push=0,loss=0;for(const [value,count]of Object.entries(hist)){const v=Number(value);if(v===threshold)push+=count;else if(direction==='OVER'?v>threshold:v<threshold)win+=count;else loss+=count;}const n=win+push+loss;return {win_probability:win/n,push_probability:push/n,loss_probability:loss/n,conditional_win_probability:win/(win+loss)};}

const policy={minimum_probability_edge:.03,minimum_expected_value:.02,minimum_model_conditional_win_probability:.52,confidence:{HIGH:{minimum_probability_edge:.08,minimum_expected_value:.08},MODERATE:{minimum_probability_edge:.05,minimum_expected_value:.04}}};
export async function currentPicks({includeProps=true}={}){
 const stateResponse=await fetch(new URL("../data/current-pick-state.json",import.meta.url),{cache:"no-store"});if(!stateResponse.ok)throw Error("Verified current-week model state unavailable");const state=await stateResponse.json();const week=Number(state.week);if(!Number.isInteger(week)||week<1||week>18)throw Error('Invalid model week');const expectedWeeks=Array.from({length:week-1},(_,i)=>i+1);const inputs=state;const seed={rows:Array(state.training_records)};
 const now=Date.now(),at=new Date(now).toISOString(),headers={'cache-control':'no-store','content-type':'application/json'};
 try{
  let board,quoteSource;
  try{const r=await fetch('/api/live/odds',{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error();const feed=await r.json();board=sportsbookBoard(feed,inputs,now);if(!board.events.length)throw Error();quoteSource=feed.source;}
  catch{const r=await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=2026&seasontype=2&week='+week,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Current sportsbook quotes unavailable');board=await r.json();quoteSource='ESPN-listed sportsbook · fallback';}
  if(board.events.length<Object.keys(inputs.games).length&&quoteSource!=='ESPN-listed sportsbook · fallback')try{const r=await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=2026&seasontype=2&week='+week,{signal:AbortSignal.timeout(10000)});if(r.ok){const fallback=await r.json();for(const event of fallback.events||[])if(!board.events.some(e=>String(e.id)===String(event.id))){for(const quote of event.competitions?.[0]?.odds||[])quote.source='ESPN-listed sportsbook · coverage fallback';board.events.push(event);}quoteSource+=' · ESPN for coverage gaps';}}catch{}
  const fit=state.fit,spreads=[],upsets=[],totals=[],games=[],modelGames={};
  if(fit.week!==week||fit.training_weeks.join(',')!==expectedWeeks.join(','))throw Error('Cumulative spread training incomplete');
  for(const [id,g]of Object.entries(inputs.games)){
   if(Date.parse(g.kickoff)<=now)continue;
   const event=board.events?.find(e=>String(e.id)===String(g.event_id)),o=event?.competitions?.[0]?.odds?.[0];if(!o)continue;
   const hs=o.pointSpread?.home?.close,as=o.pointSpread?.away?.close;
   const line=Number(hs?.line),hp=Number(hs?.odds),ap=Number(as?.odds);
   if(!hs||!as||![line,hp,ap].every(Number.isFinite))continue;
   const quote={book:o.provider?.name||'ESPN listed sportsbook',captured_at:o.captured_at||at,source:o.source||quoteSource,market:{home_spread:line,home_spread_price:hp,away_spread_price:ap}};
   const s=evaluateCalibratedSpread(fit,g.features,{...g,game_id:id},quote,policy),rec=s.recommendation;
   games.push({id,matchup:g.away_team+' @ '+g.home_team,spread_direction:s.model_prediction.selection,spread_decision:rec.decision});
   if(rec.decision==='PICK'){const side=rec.selection.startsWith(g.home_team+' ')?s.side_a:s.side_b;spreads.push({game_id:id,selection:rec.selection,odds:side.offered_odds,probability:side.conditional_win_probability,edge:side.probability_edge,expected_value:side.expected_value,kickoff:g.kickoff});}
   const hist=g.score_distribution;
   const evaluated={spread:s};const market={...quote.market};
   const hm=Number(o.moneyline?.home?.close?.odds??o.homeTeamOdds?.moneyLine),am=Number(o.moneyline?.away?.close?.odds??o.awayTeamOdds?.moneyLine);
   if([hm,am].every(Number.isFinite)){
    const e=evaluateTwoWay({sideA:outcomes(hist.margin,0,'OVER'),sideB:outcomes(hist.margin,0,'UNDER'),sideAOdds:hm,sideBOdds:am});
    evaluated.moneyline={...e,model_version:'ctd-week'+week+'-score-distribution-v1',model_status:'UNVALIDATED_SCORING_VARIANT',recommendation:recommendation(e,{...policy,minimum_model_conditional_win_probability:0},{side_a:g.home_team+' ML',side_b:g.away_team+' ML'})};market.home_moneyline=hm;market.away_moneyline=am;
    for(const [team,side]of [[g.home_team,e.side_a],[g.away_team,e.side_b]])if(side.offered_odds>0)upsets.push({game_id:id,selection:team+' ML',odds:side.offered_odds,probability:side.conditional_win_probability,expected_value:side.expected_value,model_status:'UNVALIDATED_SCORING_VARIANT',kickoff:g.kickoff,rationale:'Underdog ranked by football-model win probability; price and expected value do not determine the shortlist.'});
   }
   const total=Number(o.overUnder),over=Number(o.total?.over?.close?.odds),under=Number(o.total?.under?.close?.odds);
   if([total,over,under].every(Number.isFinite)){
    const e=evaluateTwoWay({sideA:outcomes(hist.total,total,'OVER'),sideB:outcomes(hist.total,total,'UNDER'),sideAOdds:over,sideBOdds:under});
    const rec=recommendation(e,policy,{side_a:'Over '+total,side_b:'Under '+total});
    evaluated.total={...e,model_version:'ctd-week'+week+'-score-distribution-v1',model_status:'UNVALIDATED_SCORING_VARIANT',recommendation:rec};market.total=total;market.over_price=over;market.under_price=under;
    if(rec.decision==='PICK')totals.push({game_id:id,selection:g.away_team+'–'+g.home_team+' '+rec.selection,odds:rec.selection.startsWith('Over')?over:under,probability:rec.model_conditional_win_probability,expected_value:rec.expected_value,model_status:'UNVALIDATED_SCORING_VARIANT',kickoff:g.kickoff,rationale:'Football scoring projection '+g.model.model_total.toFixed(1)+' vs sportsbook total '+total+'. Uses the simulated scoring distribution, including push probability.'});
   }
   modelGames[id]={game_id:id,home_team:g.home_team,away_team:g.away_team,kickoff:g.kickoff,football_projection:g.model,moneyline_model:{version:'ctd-week9-score-distribution-v1',status:'UNVALIDATED_SCORING_VARIANT'},spread_model:{version:'sportsbook-calibration-learning-v1'},model_status:'DEVELOPING',snapshot_evaluations:[{snapshot_id:id+':'+quote.captured_at,book:o.provider?.key||'draftkings',captured_at:quote.captured_at,source:quote.source,eligible_for_current_recommendation:true,market,markets:evaluated}],current_recommendations:Object.fromEntries(Object.entries(evaluated).map(([kind,e])=>[kind,e.recommendation]))};
  }
  try{const archivedResponse=await fetch(new URL('../data/week'+week+'-pregame-model-snapshots.json',import.meta.url),{cache:'no-store'});if(archivedResponse.ok){const archived=await archivedResponse.json();if(archived.week===week)for(const [id,g]of Object.entries(archived.games||{}))if(Date.parse(g.kickoff)<=now&&Date.parse(archived.generated_at)<Date.parse(g.kickoff)&&(g.snapshot_evaluations||[]).every(q=>Date.parse(q.captured_at)<Date.parse(g.kickoff)))modelGames[id]=g;}}catch{}
  const propResult=includeProps&&week===9?await currentProps().catch(()=>({props:[],props_status:'PROP_INPUTS_UNAVAILABLE'})):{props:[]};
  const forecasts=Object.entries(inputs.games).map(([id,g])=>({id,matchup:g.away_team+' @ '+g.home_team,kickoff:g.kickoff,away_score:g.model.away_score_mean,home_score:g.model.home_score_mean,total:g.model.model_total,home_probability:g.model.home_win_probability,away_probability:g.model.away_win_probability}));
  return ({week,status:'CURRENT',checked_at:at,expires_at:new Date(now+5*60000).toISOString(),quote_source:quoteSource,model_feed:{season:2026,week,status:'CURRENT',mode:'DEVELOPING',actionable:false,generated_at:at,games:modelGames},spread_model:'sportsbook-calibration-learning-v1',training_weeks:fit.training_weeks,training_records:seed.rows.length,training_non_push_games:fit.train_n,spreads:spreads.sort((a,b)=>b.expected_value-a.expected_value),upset_watchlist:upsets.filter(x=>!x.selection.startsWith('IND ')).sort((a,b)=>b.probability-a.probability).slice(0,3),total_candidates:totals.sort((a,b)=>b.expected_value-a.expected_value).slice(0,3),games,forecasts,...propResult,scoring_model_status:'UNVALIDATED_NO_REST_VARIANT',forecast_as_of:inputs.generated_at});
 }catch(e){throw e;}
}
