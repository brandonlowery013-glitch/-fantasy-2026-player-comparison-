import {evaluateCalibratedSpread} from './spread-feed.mjs';
import {evaluateTwoWay,recommendation} from './current-market-evaluation.mjs';
function outcomes(hist,threshold,direction){let win=0,push=0,loss=0;for(const [value,count]of Object.entries(hist)){const v=Number(value);if(v===threshold)push+=count;else if(direction==='OVER'?v>threshold:v<threshold)win+=count;else loss+=count;}const n=win+push+loss;return {win_probability:win/n,push_probability:push/n,loss_probability:loss/n,conditional_win_probability:win/(win+loss)};}

const policy={minimum_probability_edge:.03,minimum_expected_value:.02,minimum_model_conditional_win_probability:.52,confidence:{HIGH:{minimum_probability_edge:.08,minimum_expected_value:.08},MODERATE:{minimum_probability_edge:.05,minimum_expected_value:.04}}};
export async function currentPicks(){
 const stateResponse=await fetch(new URL("../data/current-pick-state.json",import.meta.url),{cache:"no-store"});if(!stateResponse.ok)throw Error("Verified Week 9 model state unavailable");const state=await stateResponse.json();const inputs=state;const seed={rows:Array(state.training_records)};
 const now=Date.now(),at=new Date(now).toISOString(),headers={'cache-control':'no-store','content-type':'application/json'};
 try{
  const r=await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=2026&seasontype=2&week=9',{signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('Current sportsbook quotes unavailable');const board=await r.json();
  const fit=state.fit,spreads=[],upsets=[],totals=[],games=[];
  if(![1,2,3,4,5,6,7,8].every(w=>fit.training_weeks.includes(w)))throw Error('Cumulative spread training incomplete');
  for(const [id,g]of Object.entries(inputs.games)){
   if(Date.parse(g.kickoff)<=now)continue;
   const event=board.events?.find(e=>String(e.id)===String(g.event_id)),o=event?.competitions?.[0]?.odds?.[0];if(!o)continue;
   const hs=o.pointSpread?.home?.close,as=o.pointSpread?.away?.close;
   const line=Number(hs?.line),hp=Number(hs?.odds),ap=Number(as?.odds);
   if(!hs||!as||![line,hp,ap].every(Number.isFinite))continue;
   const quote={book:o.provider?.name||'ESPN listed sportsbook',captured_at:at,source:'ESPN public scoreboard sportsbook observation',market:{home_spread:line,home_spread_price:hp,away_spread_price:ap}};
   const s=evaluateCalibratedSpread(fit,g.features,{...g,game_id:id},quote,policy),rec=s.recommendation;
   games.push({id,matchup:g.away_team+' @ '+g.home_team,spread_direction:s.model_prediction.selection,spread_decision:rec.decision});
   if(rec.decision==='PICK'){const side=rec.selection.startsWith(g.home_team+' ')?s.side_a:s.side_b;spreads.push({game_id:id,selection:rec.selection,odds:side.offered_odds,probability:side.conditional_win_probability,edge:side.probability_edge,expected_value:side.expected_value,kickoff:g.kickoff});}
   const hist=g.score_distribution;
   const hm=Number(o.moneyline?.home?.close?.odds??o.homeTeamOdds?.moneyLine),am=Number(o.moneyline?.away?.close?.odds??o.awayTeamOdds?.moneyLine);
   if([hm,am].every(Number.isFinite)){
    const e=evaluateTwoWay({sideA:outcomes(hist.margin,0,'OVER'),sideB:outcomes(hist.margin,0,'UNDER'),sideAOdds:hm,sideBOdds:am});
    for(const [team,side]of [[g.home_team,e.side_a],[g.away_team,e.side_b]])if(side.offered_odds>0&&side.probability_edge>=.03&&side.expected_value>=.02)upsets.push({game_id:id,selection:team+' ML',odds:side.offered_odds,probability:side.conditional_win_probability,expected_value:side.expected_value,model_status:'UNVALIDATED_SCORING_VARIANT',kickoff:g.kickoff});
   }
   const total=Number(o.overUnder),over=Number(o.total?.over?.close?.odds),under=Number(o.total?.under?.close?.odds);
   if([total,over,under].every(Number.isFinite)){
    const e=evaluateTwoWay({sideA:outcomes(hist.total,total,'OVER'),sideB:outcomes(hist.total,total,'UNDER'),sideAOdds:over,sideBOdds:under});
    const rec=recommendation(e,policy,{side_a:'Over '+total,side_b:'Under '+total});
    if(rec.decision==='PICK')totals.push({game_id:id,selection:g.away_team+'–'+g.home_team+' '+rec.selection,odds:rec.selection.startsWith('Over')?over:under,probability:rec.model_conditional_win_probability,expected_value:rec.expected_value,model_status:'UNVALIDATED_SCORING_VARIANT',kickoff:g.kickoff});
   }
  }
  return ({week:9,status:'CURRENT',checked_at:at,expires_at:new Date(now+5*60000).toISOString(),quote_source:'ESPN-listed sportsbook; current read',spread_model:'sportsbook-calibration-learning-v1',training_weeks:fit.training_weeks,training_records:seed.rows.length,training_non_push_games:fit.train_n,spreads:spreads.sort((a,b)=>b.expected_value-a.expected_value),upset_watchlist:upsets.filter(x=>!x.selection.startsWith('IND ')).sort((a,b)=>b.probability-a.probability).slice(0,3),total_candidates:totals.sort((a,b)=>b.expected_value-a.expected_value).slice(0,3),games,props_status:'WAITING_FOR_VERIFIED_WEEK_9_PROP_QUOTES',scoring_model_status:'UNVALIDATED_NO_REST_VARIANT',forecast_as_of:inputs.generated_at});
 }catch(e){throw e;}
}
