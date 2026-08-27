import fs from 'node:fs';
import path from 'node:path';
import {simulateGameDistribution,outcomeProbabilities,moneylineProbabilities,evaluateTwoWay,recommendation} from '../lib/game-market-probability.mjs';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),JSON.stringify(x,null,2)+'\n');};
const contract=read('data/sources/game-market-recommendation-layer-2026.json');
const projections=read('data/probability/generated/weekly-game-projections-2026.json');
const markets=read('data/market/weekly-matchup-market-snapshots-2026.json');
const roundObj=x=>JSON.parse(JSON.stringify(x,(k,v)=>typeof v==='number'?Number(v.toFixed(6)):v));

function synthetic(){return {
  projections:{season:2026,week:1,status:'SHADOW_ONLY',sportsbook_inputs_used:false,games:{'2026-W1-GB-CHI':{home_team:'CHI',away_team:'GB',event_start:'2026-09-10T00:20:00Z',model:{home_score_mean:30,away_score_mean:20,home_win_probability:.75,away_win_probability:.22,tie_probability:.03},distribution:{simulations:32768,team_score_sd:9.5,home_away_score_correlation:.05},sportsbook_inputs_used:false}}},
  markets:{season:2026,status:'SELF_TEST',market_context_only:true,probability_fit_input:false,games:{'2026-W1-GB-CHI':{week:1,away_team:'GB',home_team:'CHI',kickoff:'2026-09-10T00:20:00Z',snapshots:[
    {snapshot_id:'early',snapshot_kind:'EARLY',book:'TEST',captured_at:'2026-09-09T10:00:00Z',source:'self-test',home_spread:-1.5,home_spread_price:-110,away_spread_price:-110,total:44.5,over_price:-110,under_price:-110,home_moneyline:-180,away_moneyline:155},
    {snapshot_id:'current',snapshot_kind:'CURRENT',book:'TEST',captured_at:'2026-09-09T20:00:00Z',source:'self-test',home_spread:-10.5,home_spread_price:-110,away_spread_price:-110,total:50.5,over_price:-110,under_price:-110,home_moneyline:-180,away_moneyline:155}
  ]}}}
};}

function evaluateSnapshot(gameId,game,s){
  const draws=simulateGameDistribution(gameId,game),margins=draws.map(d=>d.margin),totals=draws.map(d=>d.total),results={};
  if(Number.isFinite(Number(s.home_spread))&&s.home_spread_price!=null&&s.away_spread_price!=null){
    const threshold=-Number(s.home_spread);
    const ev=evaluateTwoWay({sideA:outcomeProbabilities(margins,threshold,'OVER'),sideB:outcomeProbabilities(margins,threshold,'UNDER'),sideAOdds:s.home_spread_price,sideBOdds:s.away_spread_price,thresholds:{home_spread:Number(s.home_spread),home_cover_margin_threshold:threshold}});
    results.spread={...roundObj(ev),recommendation:recommendation(ev,contract.recommendation_policy,{side_a:`${game.home_team} ${Number(s.home_spread)>0?'+':''}${s.home_spread}`,side_b:`${game.away_team} ${Number(-s.home_spread)>0?'+':''}${-Number(s.home_spread)}`})};
  }
  if(Number.isFinite(Number(s.total))&&s.over_price!=null&&s.under_price!=null){
    const line=Number(s.total);
    const ev=evaluateTwoWay({sideA:outcomeProbabilities(totals,line,'OVER'),sideB:outcomeProbabilities(totals,line,'UNDER'),sideAOdds:s.over_price,sideBOdds:s.under_price,thresholds:{total:line}});
    results.total={...roundObj(ev),recommendation:recommendation(ev,contract.recommendation_policy,{side_a:`OVER ${line}`,side_b:`UNDER ${line}`})};
  }
  if(s.home_moneyline!=null&&s.away_moneyline!=null){
    const ev=evaluateTwoWay({sideA:moneylineProbabilities(draws,'HOME'),sideB:moneylineProbabilities(draws,'AWAY'),sideAOdds:s.home_moneyline,sideBOdds:s.away_moneyline,thresholds:null});
    results.moneyline={...roundObj(ev),recommendation:recommendation(ev,contract.recommendation_policy,{side_a:`${game.home_team} ML`,side_b:`${game.away_team} ML`})};
  }
  return results;
}

const self=process.argv.includes('--self-test'),src=self?synthetic():{projections,markets};
const blocked=[],games={};
if(src.projections.sportsbook_inputs_used!==false)blocked.push('Step 14 football projections show market contamination');
if(src.markets.market_context_only!==true||src.markets.probability_fit_input!==false)blocked.push('Market snapshot contract flags invalid');
for(const [gameId,mg] of Object.entries(src.markets.games||{})){
  const game=src.projections.games?.[gameId];
  if(!game){blocked.push(`${gameId} has market snapshots but no Step 14 football projection`);continue;}
  if(game.sportsbook_inputs_used!==false){blocked.push(`${gameId} football projection market contamination`);continue;}
  const kickoff=Date.parse(mg.kickoff||game.event_start),evaluations=[];
  for(const s of mg.snapshots||[]){
    const captured=Date.parse(s.captured_at),eligible=s.snapshot_kind!=='CLOSE'&&Number.isFinite(captured)&&Number.isFinite(kickoff)&&captured<=kickoff;
    evaluations.push({snapshot_id:s.snapshot_id,snapshot_kind:s.snapshot_kind,book:s.book,captured_at:s.captured_at,source:s.source,eligible_for_current_recommendation:eligible,market:{home_spread:s.home_spread??null,home_spread_price:s.home_spread_price??null,away_spread_price:s.away_spread_price??null,total:s.total??null,over_price:s.over_price??null,under_price:s.under_price??null,home_moneyline:s.home_moneyline??null,away_moneyline:s.away_moneyline??null},markets:evaluateSnapshot(gameId,game,s)});
  }
  const eligible=evaluations.filter(x=>x.eligible_for_current_recommendation).sort((a,b)=>Date.parse(a.captured_at)-Date.parse(b.captured_at));
  const latest=eligible.at(-1)||null;
  games[gameId]={week:mg.week,away_team:game.away_team,home_team:game.home_team,kickoff:mg.kickoff||game.event_start,football_projection:{home_score_mean:game.model.home_score_mean,away_score_mean:game.model.away_score_mean,model_home_spread:game.model.model_home_spread,model_total:game.model.model_total,home_win_probability:game.model.home_win_probability,away_win_probability:game.model.away_win_probability,tie_probability:game.model.tie_probability},snapshot_evaluations:evaluations,current_recommendations:latest?{snapshot_id:latest.snapshot_id,captured_at:latest.captured_at,book:latest.book,spread:latest.markets.spread?.recommendation||{decision:'PASS',selection:null,confidence:null,reason:'Spread market unavailable'},total:latest.markets.total?.recommendation||{decision:'PASS',selection:null,confidence:null,reason:'Total market unavailable'},moneyline:latest.markets.moneyline?.recommendation||{decision:'PASS',selection:null,confidence:null,reason:'Moneyline market unavailable'}}:null,sportsbook_inputs_used_for_football_projection:false,mode:'SHADOW_ONLY',actionable:false};
}

if(self){
  const g=games['2026-W1-GB-CHI'],early=g?.snapshot_evaluations?.find(x=>x.snapshot_id==='early'),cur=g?.snapshot_evaluations?.find(x=>x.snapshot_id==='current');
  if(!g||!early||!cur)blocked.push('self-test evaluations missing');
  else{
    if(early.markets.spread.recommendation.decision!=='PICK')blocked.push('self-test early spread should PICK');
    if(cur.markets.spread.recommendation.decision!=='PASS')blocked.push('self-test moved spread should PASS');
    if(g.football_projection.home_score_mean!==30||g.football_projection.away_score_mean!==20)blocked.push('market movement mutated football projection');
    if(g.current_recommendations.snapshot_id!=='current')blocked.push('latest eligible snapshot selection failed');
  }
}

const now=new Date().toISOString();
const out={schema_version:'1.0.0',season:2026,week:src.projections.week??null,status:blocked.length?'BLOCKED':Object.keys(games).length?'SHADOW_ONLY':'AWAITING_GAME_MARKET_SNAPSHOTS',mode:'SHADOW_ONLY',actionable:false,football_projection_mutation_allowed:false,fair_market_method:contract.fair_market_method,recommendation_policy:contract.recommendation_policy,generated_at:now,games};
const report={generated_at:now,result:blocked.length?'BLOCKED':'PASS',game_count:Object.keys(games).length,snapshot_evaluations:Object.values(games).reduce((n,g)=>n+g.snapshot_evaluations.length,0),mode:'SHADOW_ONLY',actionable:false,football_projection_mutation_allowed:false,blocked,safeguards:contract.locked_rules};
write('guardrails/game-market-recommendation-report.json',report);
if(!self)write('data/market/weekly-game-market-recommendations-2026.json',out);
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);
