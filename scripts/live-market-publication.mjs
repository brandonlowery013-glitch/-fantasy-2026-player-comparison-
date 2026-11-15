import {createHash} from 'node:crypto';
import {simulateGameDistribution,outcomeProbabilities,evaluateTwoWay,recommendation} from '../lib/game-market-probability.mjs';

const teams=['Arizona Cardinals|ARI','Atlanta Falcons|ATL','Baltimore Ravens|BAL','Buffalo Bills|BUF','Carolina Panthers|CAR','Chicago Bears|CHI','Cincinnati Bengals|CIN','Cleveland Browns|CLE','Dallas Cowboys|DAL','Denver Broncos|DEN','Detroit Lions|DET','Green Bay Packers|GB','Houston Texans|HOU','Indianapolis Colts|IND','Jacksonville Jaguars|JAX','Kansas City Chiefs|KC','Las Vegas Raiders|LV','Los Angeles Chargers|LAC','Los Angeles Rams|LAR','Miami Dolphins|MIA','Minnesota Vikings|MIN','New England Patriots|NE','New Orleans Saints|NO','New York Giants|NYG','New York Jets|NYJ','Philadelphia Eagles|PHI','Pittsburgh Steelers|PIT','San Francisco 49ers|SF','Seattle Seahawks|SEA','Tampa Bay Buccaneers|TB','Tennessee Titans|TEN','Washington Commanders|WAS'];
const names=new Map(teams.map(s=>s.split('|')));
const team=s=>({LA:'LAR',WSH:'WAS',JAC:'JAX'}[s]||names.get(s)||s);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const price=x=>Number.isInteger(x)&&Math.abs(x)>=100;
const fresh=(at,now)=>Number.isFinite(Date.parse(at))&&Date.parse(at)<=now&&now-Date.parse(at)<=15*60000;

// Use the provider's collection times, never the publication time, for freshness.
export function refreshMarketQuotes(base,feed,projections,now=Date.now()){
 const out={...base,games:{...base.games}},valid=feed?.health?.status==='CURRENT'&&fresh(feed.fetched_at,now);
 let matched=0,quotes=0;
 for(const [id,original]of Object.entries(base.games||{})){
  if(Date.parse(original.kickoff)<=now)continue;
  const g=out.games[id]={...original,current_recommendations:{...original.current_recommendations},snapshot_evaluations:[...(original.snapshot_evaluations||[])]};
  const event=valid?(feed.games||[]).find(e=>team(e.home_team)===team(g.home_team)&&team(e.away_team)===team(g.away_team)&&Date.parse(e.start_at)===Date.parse(g.kickoff)):null;
  const added=[];let draws;
  for(const book of event?.bookmakers||[]){
   const market={},times=[];
   for(const m of book.markets||[]){
    const at=m.last_update||book.last_update;
    if(!fresh(at,now)||Date.parse(at)>=Date.parse(g.kickoff)||m.outcomes?.length!==2||!m.outcomes.every(o=>price(o.price)))continue;
    const pair=m.key==='totals'?['Over','Under']:[event.home_team,event.away_team];
    if(!pair.every(n=>m.outcomes.filter(o=>o.name===n).length===1))continue;
    const a=m.outcomes.find(o=>o.name===pair[0]),b=m.outcomes.find(o=>o.name===pair[1]);
    if(m.key==='h2h'){market.home_moneyline=a.price;market.away_moneyline=b.price;}
    else if(m.key==='spreads'&&finite(a.point)&&finite(b.point)&&Math.abs(a.point+b.point)<1e-8){market.home_spread=a.point;market.home_spread_price=a.price;market.away_spread_price=b.price;}
    else if(m.key==='totals'&&finite(a.point)&&a.point===b.point){market.total=a.point;market.over_price=a.price;market.under_price=b.price;}
    else continue;
    times.push(at);
   }
   if(!times.length)continue;
   const captured_at=times.sort((a,b)=>Date.parse(a)-Date.parse(b))[0];
   const snapshot_id='LIVE-'+createHash('sha256').update(JSON.stringify([id,book.key,captured_at,market])).digest('hex').slice(0,20);
   const q={snapshot_id,snapshot_kind:'CURRENT',book:book.key,captured_at,source:feed.source,eligible_for_current_recommendation:true,market,markets:{}};
   const projection=projections?.games?.[id];
   if(finite(market.total)&&projection?.sportsbook_inputs_used===false){
    draws??=simulateGameDistribution(id,projection).map(d=>d.total);
    const e=evaluateTwoWay({sideA:outcomeProbabilities(draws,market.total,'OVER'),sideB:outcomeProbabilities(draws,market.total,'UNDER'),sideAOdds:market.over_price,sideBOdds:market.under_price,thresholds:{total:market.total}});
    e.recommendation=recommendation(e,base.recommendation_policy,{side_a:'OVER '+market.total,side_b:'UNDER '+market.total});
    const prior=(original.snapshot_evaluations||[]).find(s=>s.snapshot_id===original.current_recommendations?.snapshot_id)?.markets?.total;
    if(prior?.context_validation?.status==='HOLD'||original.current_recommendations?.total?.decision==='WAIT'){
     e.baseline_recommendation=e.recommendation;e.context_validation=prior?.context_validation;
     e.recommendation={decision:'WAIT',selection:null,reason:prior?.context_validation?.reason||original.current_recommendations.total.reason};
    }
    const over=e.side_a.conditional_win_probability>=e.side_b.conditional_win_probability,p=Math.max(e.side_a.conditional_win_probability,e.side_b.conditional_win_probability);
    e.model_prediction={status:'MODEL_DIRECTION',selection:(over?'OVER ':'UNDER ')+market.total,probability:p,confidence:p>=.6?'HIGH':p>=.52?'MODERATE':'LOW',betting_decision:e.recommendation.decision};
    q.markets.total=e;
   }
   added.push(q);
  }
  if(added.length){
   matched++;quotes+=added.length;
   const ids=new Set(added.map(q=>q.snapshot_id));
   g.snapshot_evaluations=[...added,...g.snapshot_evaluations.filter(q=>!ids.has(q.snapshot_id))];
   const q=added.find(q=>q.book==='draftkings')||added[0];
   g.current_recommendations={...g.current_recommendations,snapshot_id:q.snapshot_id,book:q.book,captured_at:q.captured_at,total:q.markets.total?.recommendation||{decision:'WAIT',selection:null,reason:'CURRENT_TOTAL_INPUTS_UNAVAILABLE'}};
  }else{
   // Keep archived observations but do not promote them to a current quote.
   g.snapshot_evaluations=g.snapshot_evaluations.map(q=>({...q,eligible_for_current_recommendation:false}));
   for(const kind of ['spread','total','moneyline'])g.current_recommendations[kind]={decision:'WAIT',selection:null,reason:'CURRENT_SPORTSBOOK_QUOTE_UNAVAILABLE'};
  }
 }
 out.live_market_publication={status:valid?'CURRENT':'UNAVAILABLE',fetched_at:feed?.fetched_at||null,matched_games:matched,quotes,quote_source:feed?.source||null};
 return out;
}

export function replaceTotalOutputs(feed,consumer,now=Date.now()){
 const out=structuredClone(feed),active=new Set(Object.entries(consumer.games||{}).filter(([,g])=>Date.parse(g.kickoff)>now).map(([id])=>id));
 const isOld=x=>active.has(x?.game_id||x?.event_id)&&['total','game_total'].includes(String(x.market_type||x.market||'').toLowerCase());
 const ranked=[],legs=[];
 for(const [id,g]of Object.entries(consumer.games||{})){
  if(!active.has(id))continue;
  const q=g.snapshot_evaluations.find(q=>q.snapshot_id===g.current_recommendations?.snapshot_id),e=q?.markets?.total,rec=g.current_recommendations?.total;
  const target=Array.isArray(out.games)?out.games.find(t=>t.event_id===id||t.game_id===id):null;
  if(target){target.current_recommendations={...target.current_recommendations,total:rec};target.total_recommendation=rec;target.model_total_pick=e?.model_prediction?.selection||null;}
  if(rec?.decision!=='PICK'||!fresh(q?.captured_at,now))continue;
  const v=rec.selection.startsWith('OVER ')?e.side_a:e.side_b;
  ranked.push({opportunity_id:'GAME|'+id+'|TOTAL|'+q.snapshot_id,week:consumer.week,entity_type:'GAME',market_type:'TOTAL',game_id:id,matchup:g.away_team+' @ '+g.home_team,selection:rec.selection,decision:'PICK',confidence:rec.confidence,book:q.book,captured_at:q.captured_at,line:q.market.total,offered_odds:v.offered_odds,model_win_probability:v.conditional_win_probability,probability_edge:v.probability_edge,expected_value:v.expected_value});
  legs.push({leg_id:id+':total:'+q.snapshot_id,event_id:id,week:consumer.week,market_type:'total',side:rec.selection,sportsbook:q.book,american_odds:v.offered_odds,model_win_probability:v.conditional_win_probability,probability_edge:v.probability_edge,expected_value:v.expected_value,observed_at:q.captured_at,standalone_approved:true,label:'PICK',source_type:'GAME'});
 }
 if(Array.isArray(out.ranked_picks))out.ranked_picks=[...out.ranked_picks.filter(x=>!isOld(x)),...ranked];
 if(Array.isArray(out.eligible_legs))out.eligible_legs=[...out.eligible_legs.filter(x=>!isOld(x)),...legs];
 for(const k of ['near_misses','stale_findings'])if(Array.isArray(out[k]))out[k]=out[k].filter(x=>!isOld(x));
 if(Array.isArray(out.parlays))out.parlays=out.parlays.filter(p=>!(p.legs||[]).some(l=>typeof l==='string'?[...active].some(id=>l.startsWith(id+':total:')):isOld(l)));
 out.live_market_publication=consumer.live_market_publication;
 return out;
}
