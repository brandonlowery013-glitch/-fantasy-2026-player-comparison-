// Read the published server decisions. This panel must never fit a second model
// or select a slate from a checked-in, week-specific browser state file.
const versions={spread:'sportsbook-calibration-learning-v1',moneyline:'ctd-football-moneyline-v1'};
const fresh=(at,now,limit)=>Number.isFinite(Date.parse(at))&&Date.parse(at)<=now+60000&&now-Date.parse(at)<=limit;
const validOdds=x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)>=100;
const probability=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1;
export function publishedPicks(feed,schedule,{betting=null,spread=null,now=Date.now(),includeProps=true}={}){
 const delivery=feed?.delivery,week=Number(schedule?.week);
 if(schedule?.season!==2026||feed?.season!==2026||!Number.isInteger(week)||week<1||week>18||feed.week!==week)throw Error('Published picks do not match the current schedule');
 if(delivery?.kind!=='PRECOMPUTED_SERVER_MODEL'||!fresh(delivery.generated_at,now,20*60000)||Date.parse(delivery.expires_at)<=now||!Number.isFinite(Date.parse(delivery.expires_at)))throw Error('Current model publication expired');
 const allowed=new Map(Object.values(schedule.games||{}).map(g=>[`${g.away_team}:${g.home_team}:${Date.parse(g.event_start||g.kickoff)}`,g]));
 const spreads=[],upsets=[],totals=[],games=[],forecasts=[],modelFeed=structuredClone(feed),quoteTimes=[];
 for(const [id,g]of Object.entries(modelFeed.games||{})){
  const kickoff=g.kickoff||g.event_start;
  if(!allowed.has(`${g.away_team}:${g.home_team}:${Date.parse(kickoff)}`)){delete modelFeed.games[id];continue;}
  // Preserve archived predictions unchanged, but never shortlist a started game.
  if(Date.parse(kickoff)<=now)continue;
  const quotes=(g.snapshot_evaluations||[]).filter(q=>q.eligible_for_current_recommendation!==false&&fresh(q.captured_at,now,60*60000)&&Date.parse(q.captured_at)<Date.parse(kickoff)).sort((a,b)=>Date.parse(b.captured_at)-Date.parse(a.captured_at));
  g.snapshot_evaluations=quotes;
  const row={id,matchup:g.away_team+' @ '+g.home_team,spread_direction:'Unavailable',spread_decision:'WAIT'};
  const chosen=new Set();
  for(const q of quotes){
   for(const kind of ['spread','moneyline','total']){
    const e=q.markets?.[kind];if(!e||chosen.has(kind)||versions[kind]&&e.model_version!==versions[kind])continue;
    chosen.add(kind);const rec=e.recommendation||{},m=q.market||{};
    const pair=kind==='spread'?[m.home_spread_price,m.away_spread_price]:kind==='moneyline'?[m.home_moneyline,m.away_moneyline]:[m.over_price,m.under_price];
    if(!pair.every(validOdds))continue;
    quoteTimes.push(q.captured_at);
    if(kind==='spread'){row.spread_direction=e.model_prediction?.selection||'Unavailable';row.spread_decision=rec.decision||'WAIT';}
    const sideA=kind==='total'?/^over\b/i.test(rec.selection||''):String(rec.selection||'').startsWith(g.home_team+' ');
    const v=sideA?e.side_a:e.side_b;
    const common={game_id:id,kickoff,book:q.book,captured_at:q.captured_at,model_status:feed.mode||feed.status};
    if(rec.decision==='PICK'&&rec.selection&&probability(v?.conditional_win_probability)){
     const item={...common,selection:kind==='total'?g.away_team+'–'+g.home_team+' '+rec.selection:rec.selection,odds:sideA?pair[0]:pair[1],probability:v.conditional_win_probability,edge:v.probability_edge,expected_value:v.expected_value};
     if(kind==='spread')spreads.push(item);if(kind==='total')totals.push(item);
    }
    if(kind==='moneyline'&&g.moneyline_model?.status==='CURRENT')for(const [team,side,odds]of [[g.home_team,e.side_a,pair[0]],[g.away_team,e.side_b,pair[1]]]){
     if(team!=='IND'&&odds>0&&probability(side?.conditional_win_probability))upsets.push({...common,selection:team+' ML',odds,probability:side.conditional_win_probability,expected_value:side.expected_value,rationale:'Underdog watchlist ranked by the published football-model win chance; inclusion is not a value-bet recommendation.'});
    }
   }
  }
  games.push(row);
  if(!quotes.length){g.current_recommendations={spread:{decision:'WAIT',reason:'CURRENT_QUOTE_REQUIRED'},moneyline:{decision:'WAIT',reason:'CURRENT_QUOTE_REQUIRED'},total:{decision:'WAIT',reason:'CURRENT_QUOTE_REQUIRED'}};}
  const p=g.football_projection||{};
  forecasts.push({id,matchup:row.matchup,kickoff,away_score:p.away_score_mean,home_score:p.home_score_mean,total:p.model_total,home_probability:p.home_win_probability,away_probability:p.away_win_probability});
 }
 const props=[];
 if(includeProps&&betting?.week===week)for(const p of betting.props||[]){
  const rec=p.recommendation||{},game=modelFeed.games?.[p.event_id||p.game_id],kickoff=game?.kickoff||game?.event_start;
  if(!game||Date.parse(kickoff)<=now||!fresh(p.captured_at,now,60*60000)||p.eligibility?.eligible_for_pick!==true||p.eligibility?.expected_active!==true||rec.decision!=='PICK'||!validOdds(p.odds))continue;
  const prob=p.model_pick?.conditional_win_probability;if(!probability(prob))continue;
  props.push({selection:p.player+' '+p.side+' '+p.line+' '+p.stat.replaceAll('_',' '),player:p.player,game_id:p.event_id||p.game_id,kickoff,odds:p.odds,probability:prob,book:p.book,captured_at:p.captured_at,rationale:p.show_work?.reader?.summary});
 }
 const fit=spread?.week===week?spread.fit:null;
 return {week,status:'CURRENT',checked_at:delivery.generated_at,expires_at:delivery.expires_at,quote_source:'Published sportsbook snapshots',latest_quote_at:quoteTimes.sort().at(-1)||null,model_feed:modelFeed,spread_model:feed.spread_model_version,spread_status:feed.spread_model_status,training_weeks:fit?.training_weeks||[],training_non_push_games:fit?.train_n??null,spreads:spreads.sort((a,b)=>(b.expected_value??0)-(a.expected_value??0)),upset_watchlist:upsets.sort((a,b)=>b.probability-a.probability).slice(0,3),total_candidates:totals.sort((a,b)=>(b.expected_value??0)-(a.expected_value??0)).slice(0,3),games,forecasts,props,props_status:props.length?'CURRENT':'NO_VERIFIED_PROP_PICK',research_only:feed.actionable!==true,forecast_as_of:feed.generated_at};
}
async function json(url){const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Published current-week model unavailable');return r.json();}
export async function currentPicks({includeProps=true}={}){
 const [feed,schedule,betting,spread]=await Promise.all([json('/cloudflare/api/game-model/recommendations'),json('/cloudflare/api/game-model/schedule'),includeProps?json('/api/live/betting').then(x=>x.data||x).catch(()=>null):null,json('/api/live/spread-projections').catch(()=>null)]);
 return publishedPicks(feed,schedule,{betting,spread,includeProps});
}
