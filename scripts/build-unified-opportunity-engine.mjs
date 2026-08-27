import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),JSON.stringify(x,null,2)+'\n');};
const exists=p=>fs.existsSync(path.join(root,p));
const round=(x,d=6)=>Number(Number(x).toFixed(d));
const contract=read('data/sources/unified-opportunity-engine-2026.json');
const liveContract=exists('data/sources/live-market-ingestion-2026.json')?read('data/sources/live-market-ingestion-2026.json'):null;
const confidenceRank={HIGH:0,MODERATE:1,LEAN:2};
const eligibleKinds=new Set(['EARLY','OPEN','CURRENT','PREDICTION_TIME']);

function rankSort(a,b){
  return (confidenceRank[a.confidence]??9)-(confidenceRank[b.confidence]??9)
    || Number(b.probability_edge)-Number(a.probability_edge)
    || Number(b.expected_value)-Number(a.expected_value)
    || Number(b.model_conditional_win_probability)-Number(a.model_conditional_win_probability)
    || String(a.opportunity_id).localeCompare(String(b.opportunity_id));
}
function nearMiss(x){return x.decision==='PASS'&&Number(x.model_conditional_win_probability)>=0.52&&(Number(x.probability_edge)>=0.02||Number(x.expected_value)>=0.01);}
function pct(x){return `${(Number(x)*100).toFixed(1)}%`;}
function pts(x){return `${(Number(x)*100).toFixed(1)} pts`;}
function evText(x){return `${Number(x)>=0?'+':''}${(Number(x)*100).toFixed(1)}% EV`;}
function lineText(x){return Number.isFinite(Number(x))?Number(x):null;}
function staleMinutes(horizon){return Number(horizon==='SEASON'?liveContract?.freshness?.season_market_stale_after_minutes:liveContract?.freshness?.weekly_market_stale_after_minutes)||150;}
function isFresh(x,asOf,horizon='WEEKLY'){
  const t=Date.parse(x?.captured_at||'');if(!Number.isFinite(t))return false;
  const age=asOf-t;if(age<0)return true;
  return age<=staleMinutes(horizon)*60000;
}
function recSort(a,b){
  const ar=a.rec?.decision==='PICK'?1:0,br=b.rec?.decision==='PICK'?1:0;
  return br-ar
    || Number(b.side?.expected_value??-Infinity)-Number(a.side?.expected_value??-Infinity)
    || Number(b.side?.probability_edge??-Infinity)-Number(a.side?.probability_edge??-Infinity)
    || Number(b.modelProb??-Infinity)-Number(a.modelProb??-Infinity)
    || Date.parse(b.snap.captured_at)-Date.parse(a.snap.captured_at)
    || String(a.snap.book).localeCompare(String(b.snap.book));
}
function gameSide(detail,rec){
  if(!detail)return null;
  const sides=[['side_a',detail.side_a,detail.fair_market?.side_a_probability],['side_b',detail.side_b,detail.fair_market?.side_b_probability]];
  if(rec?.decision==='PICK')sides.sort((a,b)=>Math.abs(Number(a[1]?.probability_edge)-Number(rec.probability_edge))-Math.abs(Number(b[1]?.probability_edge)-Number(rec.probability_edge))||Math.abs(Number(a[1]?.expected_value)-Number(rec.expected_value))-Math.abs(Number(b[1]?.expected_value)-Number(rec.expected_value)));
  else sides.sort((a,b)=>Number(b[1]?.expected_value)-Number(a[1]?.expected_value));
  const [key,s,fair]=sides[0]||[];return s?{key,side:s,no_vig_probability:fair}:null;
}
function latestFreshGameByBook(g,key,asOf){
  const byBook=new Map();
  for(const snap of g.snapshot_evaluations||[]){
    if(!snap.eligible_for_current_recommendation||!eligibleKinds.has(snap.snapshot_kind)||!isFresh(snap,asOf,'WEEKLY')||!snap.markets?.[key])continue;
    const old=byBook.get(snap.book);if(!old||Date.parse(snap.captured_at)>Date.parse(old.captured_at))byBook.set(snap.book,snap);
  }
  return [...byBook.values()];
}
function bestGameCandidate(g,key,asOf){
  const c=[];for(const snap of latestFreshGameByBook(g,key,asOf)){const detail=snap.markets[key],rec=detail?.recommendation,chosen=gameSide(detail,rec);if(chosen?.side)c.push({snap,detail,rec,chosen,side:chosen.side,modelProb:chosen.side.conditional_win_probability});}
  c.sort(recSort);return c[0]||null;
}
function bestPropCandidate(bucket,stat,asOf){
  const byBook=new Map();
  for(const e of bucket.evaluations||[]){if(e.stat!==stat||!eligibleKinds.has(e.snapshot_kind)||!isFresh(e,asOf,'WEEKLY'))continue;const old=byBook.get(e.book);if(!old||Date.parse(e.captured_at)>Date.parse(old.captured_at))byBook.set(e.book,e);}
  const c=[];for(const e of byBook.values()){const side=(e.sides||[])[0];if(side)c.push({snap:e,rec:e.recommendation,side,modelProb:side.model_conditional_win_probability});}c.sort(recSort);return c[0]?.snap||null;
}
function movementGame(g,current,key){
  const same=(g.snapshot_evaluations||[]).filter(x=>x.book===current.book&&x.markets?.[key]&&eligibleKinds.has(x.snapshot_kind)).sort((a,b)=>Date.parse(a.captured_at)-Date.parse(b.captured_at));
  if(same.length<2)return null;const first=same[0],last=same.find(x=>x.snapshot_id===current.snapshot_id)||same.at(-1);return {from_snapshot:first.snapshot_id,to_snapshot:last.snapshot_id,from_captured_at:first.captured_at,to_captured_at:last.captured_at,from_market:first.market,to_market:last.market,book:current.book};
}
function movementProp(bucket,current){
  const same=(bucket.evaluations||[]).filter(x=>x.stat===current.stat&&x.book===current.book&&eligibleKinds.has(x.snapshot_kind)).sort((a,b)=>Date.parse(a.captured_at)-Date.parse(b.captured_at));
  if(same.length<2)return null;const first=same[0],last=same.find(x=>x.snapshot_id===current.snapshot_id)||same.at(-1);return {from_snapshot:first.snapshot_id,to_snapshot:last.snapshot_id,from_line:first.line,to_line:last.line,from_captured_at:first.captured_at,to_captured_at:last.captured_at,book:current.book};
}
function gameExplanation(type,g,market,s){
  const base=`Model probability ${pct(s.side.conditional_win_probability)} versus ${pct(s.no_vig_probability)} no-vig market probability creates a ${pts(s.side.probability_edge)} edge and ${evText(s.side.expected_value)} at the offered price.`;
  if(type==='SPREAD')return `Model home spread is ${lineText(g.football_projection.model_home_spread)} versus market home spread ${lineText(market.home_spread)}. ${base}`;
  if(type==='TOTAL')return `Model total is ${lineText(g.football_projection.model_total)} versus market total ${lineText(market.total)}. ${base}`;
  return `Model home win probability is ${pct(g.football_projection.home_win_probability)} and away win probability is ${pct(g.football_projection.away_win_probability)}. ${base}`;
}
function propExplanation(stat,current,side,mean){const center=Number.isFinite(Number(mean))?`Model ${stat.replaceAll('_',' ')} center is ${Number(mean).toFixed(1)} versus market line ${current.line}. `:'';return `${center}Model probability ${pct(side.model_conditional_win_probability)} versus ${pct(side.no_vig_market_probability)} no-vig market probability creates a ${pts(side.probability_edge)} edge and ${evText(side.expected_value)} at ${current.book}.`;}
function synth(){return {
 games:{season:2026,week:1,status:'SHADOW_ONLY',mode:'SHADOW_ONLY',games:{G1:{week:1,away_team:'GB',home_team:'CHI',kickoff:'2026-09-10T00:20:00Z',football_projection:{home_score_mean:27,away_score_mean:21,model_home_spread:-6,model_total:48,home_win_probability:.68,away_win_probability:.30,tie_probability:.02},snapshot_evaluations:[
  {snapshot_id:'g-old',snapshot_kind:'CURRENT',book:'OLD_BOOK',captured_at:'2026-09-09T15:00:00Z',eligible_for_current_recommendation:true,market:{home_spread:-1.5,home_spread_price:-110,away_spread_price:-110,total:44.5,over_price:-110,under_price:-110},markets:{spread:{fair_market:{side_a_probability:.5,side_b_probability:.5},side_a:{conditional_win_probability:.64,probability_edge:.14,expected_value:.20,offered_odds:-110},side_b:{conditional_win_probability:.36,probability_edge:-.14,expected_value:-.30,offered_odds:-110},recommendation:{decision:'PICK',selection:'CHI -1.5',confidence:'HIGH',probability_edge:.14,expected_value:.20}},total:{fair_market:{side_a_probability:.5,side_b_probability:.5},side_a:{conditional_win_probability:.49,probability_edge:-.01,expected_value:-.06,offered_odds:-110},side_b:{conditional_win_probability:.51,probability_edge:.01,expected_value:-.02,offered_odds:-110},recommendation:{decision:'PASS',selection:null,confidence:null}}}},
  {snapshot_id:'gcur',snapshot_kind:'CURRENT',book:'BOOK',captured_at:'2026-09-09T20:00:00Z',eligible_for_current_recommendation:true,market:{home_spread:-2.5,home_spread_price:-110,away_spread_price:-110,total:44.5,over_price:-110,under_price:-110,home_moneyline:-160,away_moneyline:140},markets:{spread:{fair_market:{side_a_probability:.5,side_b_probability:.5},side_a:{conditional_win_probability:.61,probability_edge:.11,expected_value:.164,offered_odds:-110},side_b:{conditional_win_probability:.39,probability_edge:-.11,expected_value:-.255,offered_odds:-110},recommendation:{decision:'PICK',selection:'CHI -2.5',confidence:'HIGH',probability_edge:.11,expected_value:.164}},total:{fair_market:{side_a_probability:.5,side_b_probability:.5},side_a:{conditional_win_probability:.49,probability_edge:-.01,expected_value:-.064,offered_odds:-110},side_b:{conditional_win_probability:.51,probability_edge:.01,expected_value:-.026,offered_odds:-110},recommendation:{decision:'PASS',selection:null,confidence:null}}}}
 ]}}},
 props:{season:2026,week:1,status:'SHADOW_ONLY',mode:'SHADOW_ONLY',players:{'Player One':{position:'WR',team:'CHI',season:{evaluations:[],current_by_stat:{}},weekly:{week:1,evaluations:[{snapshot_id:'pcur',horizon:'WEEKLY',week:1,player:'Player One',position:'WR',stat:'receiving_yards',line:70.5,book:'BOOK',captured_at:'2026-09-09T20:00:00Z',snapshot_kind:'CURRENT',sides:[{side:'OVER',offered_odds:-110,model_conditional_win_probability:.58,no_vig_market_probability:.50,probability_edge:.08,expected_value:.107,decision:'PICK',confidence:'MODERATE'}],recommendation:{decision:'PICK',side:'OVER',confidence:'MODERATE',expected_value:.107,probability_edge:.08}}],current_by_stat:{}}}}},
 weekly:{week:1,distributions:{'Player One':{distributions:{receiving_yards:{status:'SHADOW_ONLY',mean:82,sd:18}}}}}
};}

const self=process.argv.includes('--self-test'),asOf=self?Date.parse('2026-09-09T21:00:00Z'):Date.now();
const src=self?synth():{games:read(contract.game_recommendation_source),props:read(contract.player_prop_recommendation_source),weekly:read(contract.weekly_player_distribution_source)};
const blocked=[],picks=[],passes=[],stale=[];
if(src.games.mode!=='SHADOW_ONLY'||src.props.mode!=='SHADOW_ONLY')blocked.push('upstream recommendation layers must remain SHADOW_ONLY');
if(src.games.week!=null&&src.props.week!=null&&Number(src.games.week)!==Number(src.props.week))blocked.push(`weekly horizon mismatch: games ${src.games.week} props ${src.props.week}`);

for(const [gameId,g] of Object.entries(src.games.games||{})){
  for(const [key,type] of [['spread','SPREAD'],['total','TOTAL'],['moneyline','MONEYLINE']]){
    const c=bestGameCandidate(g,key,asOf);if(!c){if((g.snapshot_evaluations||[]).some(x=>x.markets?.[key]))stale.push({entity_type:'GAME',game_id:gameId,market_type:type,status:'STALE_OR_CLOSED'});continue;}
    const {snap,detail,rec,chosen}=c;
    const finding={opportunity_id:`GAME|${gameId}|${type}|${snap.snapshot_id}`,week:g.week??src.games.week??null,entity_type:'GAME',market_type:type,game_id:gameId,matchup:`${g.away_team} @ ${g.home_team}`,selection:rec?.selection??null,decision:rec?.decision||'PASS',confidence:rec?.confidence??null,book:snap.book,captured_at:snap.captured_at,line:type==='SPREAD'?snap.market.home_spread:type==='TOTAL'?snap.market.total:null,offered_odds:Number(chosen.side.offered_odds),model_conditional_win_probability:round(chosen.side.conditional_win_probability),no_vig_market_probability:round(chosen.no_vig_probability),probability_edge:round(chosen.side.probability_edge),expected_value:round(chosen.side.expected_value),model_context:g.football_projection,market_movement:movementGame(g,snap,key),freshness_status:'CURRENT',best_price_selected:true,explanation:gameExplanation(type,g,snap.market,chosen),source_layer:'STEP_15_GAME_MARKET_RECOMMENDATIONS'};
    (finding.decision==='PICK'?picks:passes).push(finding);
  }
}
for(const [player,p] of Object.entries(src.props.players||{})){
  const bucket=p.weekly||{},stats=[...new Set((bucket.evaluations||[]).map(x=>x.stat))];
  for(const stat of stats){const current=bestPropCandidate(bucket,stat,asOf);if(!current){stale.push({entity_type:'PLAYER',player,stat,market_type:'PLAYER_PROP',status:'STALE_OR_CLOSED'});continue;}const side=(current.sides||[])[0];if(!side)continue;const mean=src.weekly?.distributions?.[player]?.distributions?.[stat]?.mean;const finding={opportunity_id:`PROP|${player}|${stat}|${current.book}|${current.snapshot_id}`,week:current.week??bucket.week??src.props.week??null,entity_type:'PLAYER',market_type:'PLAYER_PROP',player,position:p.position,team:p.team,stat,selection:current.recommendation?.decision==='PICK'?`${current.recommendation.side} ${current.line}`:null,decision:current.recommendation?.decision||side.decision,confidence:current.recommendation?.confidence||side.confidence||null,book:current.book,captured_at:current.captured_at,line:Number(current.line),offered_odds:Number(side.offered_odds),model_conditional_win_probability:round(side.model_conditional_win_probability),no_vig_market_probability:round(side.no_vig_market_probability),probability_edge:round(side.probability_edge),expected_value:round(side.expected_value),model_context:{projection_center:Number.isFinite(Number(mean))?round(mean,3):null,distribution_family:src.weekly?.distributions?.[player]?.distributions?.[stat]?.family||null},market_movement:movementProp(bucket,current),freshness_status:'CURRENT',best_price_selected:true,explanation:propExplanation(stat,current,side,mean),source_layer:'STEP_16_PLAYER_PROP_RECOMMENDATIONS'};(finding.decision==='PICK'?picks:passes).push(finding);}
}
picks.sort(rankSort);picks.forEach((x,i)=>x.rank=i+1);
const near=passes.filter(nearMiss).sort((a,b)=>Number(b.probability_edge)-Number(a.probability_edge)||Number(b.expected_value)-Number(a.expected_value)||String(a.opportunity_id).localeCompare(String(b.opportunity_id))).map((x,i)=>({...x,watch_rank:i+1,watch_status:'PASS_NEAR_MISS'}));
for(const x of picks)if(!['HIGH','MODERATE','LEAN'].includes(x.confidence))blocked.push(`${x.opportunity_id} PICK missing locked confidence`);
if(picks.some(x=>x.decision!=='PICK'))blocked.push('ranked picks contains non-PICK decision');if(near.some(x=>x.decision!=='PASS'))blocked.push('near-miss watchlist promoted a PASS');
if(self){if(picks.length!==2)blocked.push(`self-test expected 2 ranked picks, got ${picks.length}`);if(picks[0]?.market_type!=='SPREAD'||picks[0]?.book!=='BOOK')blocked.push('fresh game market should beat stale higher-EV book');if(picks[1]?.market_type!=='PLAYER_PROP')blocked.push('player prop pick should rank second');if(!picks.every(x=>x.freshness_status==='CURRENT'&&x.best_price_selected===true))blocked.push('freshness/best-price flags missing');}
const week=src.games.week??src.props.week??src.weekly?.week??null,now=new Date().toISOString();
const out={schema_version:'1.1.0',season:2026,week,status:blocked.length?'BLOCKED':picks.length?'SHADOW_ONLY':'AWAITING_QUALIFYING_WEEKLY_PICKS',mode:'SHADOW_ONLY',actionable:false,ranking_method:'LEXICOGRAPHIC_EXISTING_PICKS_ONLY',market_selection_method:'LATEST_FRESH_PER_BOOK_THEN_BEST_EV',freshness_policy_minutes:staleMinutes('WEEKLY'),generated_at:now,ranked_picks:picks,near_misses:near,stale_findings:stale,summary:{game_picks:picks.filter(x=>x.entity_type==='GAME').length,player_prop_picks:picks.filter(x=>x.market_type==='PLAYER_PROP').length,near_misses:near.length,stale_findings:stale.length,total_weekly_findings:picks.length+passes.length}};
const report={generated_at:now,result:blocked.length?'BLOCKED':'PASS',week,ranked_pick_count:picks.length,near_miss_count:near.length,stale_finding_count:stale.length,game_pick_count:out.summary.game_picks,player_prop_pick_count:out.summary.player_prop_picks,ranking_method:out.ranking_method,market_selection_method:out.market_selection_method,freshness_policy_minutes:out.freshness_policy_minutes,mode:'SHADOW_ONLY',actionable:false,blocked,safeguards:[...(contract.locked_rules||[]),'Only latest fresh snapshots per book can compete for current selection.','Best price is selected by existing PICK/EV/edge/model-probability outputs; no new hidden score is introduced.','Stale or closed markets cannot appear as current picks or near misses.','Complete same-book market evaluations remain intact; prices are never spliced across books.']};
write('guardrails/unified-opportunity-engine-report.json',report);if(!self)write('data/market/unified-opportunities-2026.json',out);console.log(JSON.stringify(report,null,2));if(blocked.length)process.exit(1);
