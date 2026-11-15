import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {csvRecords} from '../lib/csv-records.mjs';
import {OPPORTUNITY_VERSION,canonicalTeam,playerIdentity,aggregateTeams,beforeWeek,fitOpportunityPrior,teamOpportunity,simulateOpportunityGame,empiricalSummary,empiricalTails,empiricalHistogram} from '../lib/opportunity-props.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),write=(p,x)=>{fs.mkdirSync(p.slice(0,p.lastIndexOf('/')),{recursive:true});fs.writeFileSync(p,JSON.stringify(x)+'\n');};
const numeric=(r,k)=>Number(r[k])||0;
export function normalizePlayerRows(csv){
 return [...csvRecords(csv)].filter(r=>r.season_type==='REG'&&['QB','RB','WR','TE'].includes(r.position)).map(r=>({player:r.player_display_name||r.player_name,player_id:r.player_id,position:r.position,season:+r.season,week:+r.week,team:canonicalTeam(r.team||r.recent_team),opponent:canonicalTeam(r.opponent_team),pass_attempts:numeric(r,'attempts'),pass_yards:numeric(r,'passing_yards'),pass_tds:numeric(r,'passing_tds'),interceptions:numeric(r,'passing_interceptions')||numeric(r,'interceptions'),rush_attempts:numeric(r,'carries'),rush_yards:numeric(r,'rushing_yards'),rush_tds:numeric(r,'rushing_tds'),targets:numeric(r,'targets'),receptions:numeric(r,'receptions'),receiving_yards:numeric(r,'receiving_yards'),receiving_tds:numeric(r,'receiving_tds')}));
}
function rosterFor(rows,team,season,week){
 const map=new Map();for(const r of rows.filter(r=>beforeWeek(r,season,week)&&canonicalTeam(r.team)===team&&r.season===season&&r.week>=week-4))map.set(playerIdentity(r.player),{name:r.player,position:r.position,expected_active:null});return [...map.values()];
}
function expectedHistoricalQB(rows,team,season,week){const prior=rows.filter(r=>beforeWeek(r,season,week)&&r.position==='QB'&&canonicalTeam(r.team)===team&&r.pass_attempts>0).slice(-4);return prior.sort((a,b)=>b.season-a.season||b.week-a.week||b.pass_attempts-a.pass_attempts)[0]?.player;}
export function historicalEvaluation(rows,prior,seasons,{draws=128}={}){
 const allTeams=aggregateTeams(rows),games=allTeams.filter(t=>seasons.includes(t.season)&&t.week>=5&&t.team<t.opponent),metrics={},skipped={};
 for(const g of games){
  const earlier=rows.filter(r=>beforeWeek(r,g.season,g.week)),opponents=[g.team,g.opponent],kickoff=`${g.season+1}-01-01T00:00:00Z`,asOf=`${g.season}-01-01T00:00:00Z`;
  try{
   const contexts=opponents.map((team,i)=>teamOpportunity({team,opponent:opponents[1-i],roster:rosterFor(earlier,team,g.season,g.week),rows:earlier,prior,season:g.season,week:g.week,expectedQB:expectedHistoricalQB(earlier,team,g.season,g.week),asOf,kickoff}));
   const historyIndex=new Map();for(const r of earlier){const k=playerIdentity(r.player);if(!historyIndex.has(k))historyIndex.set(k,[]);historyIndex.get(k).push(r);}
   const sim=simulateOpportunityGame({game:{game_id:`${g.season}-${g.week}-${g.team}-${g.opponent}`,season:g.season,week:g.week,kickoff,as_of:asOf},home:contexts[0],away:contexts[1],prior,draws});
   for(const outcome of rows.filter(r=>r.season===g.season&&r.week===g.week&&opponents.includes(canonicalTeam(r.team)))){
    const forecast=Object.values(sim.players).find(p=>p.team===canonicalTeam(outcome.team)&&playerIdentity(p.name||'')===playerIdentity(outcome.player))||sim.players[outcome.player];
    if(!forecast)continue;
    const stats=outcome.position==='QB'?['pass_attempts','pass_yards','pass_tds','interceptions','rush_yards']:outcome.position==='RB'?['rush_attempts','rush_yards','targets','receptions','receiving_yards','rush_tds']:['targets','receptions','receiving_yards','receiving_tds'];
    const past=(historyIndex.get(playerIdentity(outcome.player))||[]).slice(-8);
    for(const stat of stats){const s=empiricalSummary(forecast.draws[stat]),actual=outcome[stat];if(!Number.isFinite(actual))continue;const key=outcome.position+'|'+stat,m=metrics[key]||{n:0,absolute_error:0,baseline_absolute_error:0,covered_p10_p90:0,brier:0,baseline_brier:0};const baseline=past.reduce((a,r)=>a+r[stat],0)/(past.length||1),line=Math.floor(baseline)+.5,p=empiricalTails(forecast.draws[stat],line).over,y=+(actual>line),historicalP=(past.filter(r=>r[stat]>line).length+1)/(past.length+2);m.n++;m.absolute_error+=Math.abs(s.mean-actual);m.baseline_absolute_error+=Math.abs(baseline-actual);m.covered_p10_p90+=+(actual>=s.p10&&actual<=s.p90);m.brier+=(p-y)**2;m.baseline_brier+=(historicalP-y)**2;metrics[key]=m;}
   }
  }catch(e){skipped[e.message]=(skipped[e.message]||0)+1;}
 }
 const cells=Object.fromEntries(Object.entries(metrics).map(([k,m])=>[k,{n:m.n,mae:m.absolute_error/m.n,baseline_mae:m.baseline_absolute_error/m.n,p10_p90_coverage:m.covered_p10_p90/m.n,brier:m.brier/m.n,baseline_brier:m.baseline_brier/m.n}]));
 return {seasons,game_pairs:games.length,skipped,metrics:cells,mean_scaled_mae:Object.values(cells).reduce((s,m)=>s+m.mae/(m.baseline_mae||1),0)/(Object.keys(cells).length||1),selection_information:'Roster and starter inferred from earlier weeks only. Scores, starts and active roster from the forecast week are not predictors.',evaluation_information:'Metrics are conditional on players with observed outcome rows; no pregame historical injury/active snapshot claim.',lines:'Earlier-player-mean half-point diagnostics, NOT archived sportsbook lines.',sportsbook_inputs_used:false};
}
async function fetchText(url){const r=await fetch(url,{signal:AbortSignal.timeout(60000),headers:{'user-agent':'CTD-opportunity-props/1.0'}});if(!r.ok)throw Error(`HTTP ${r.status} ${url}`);return r.text();}
async function backtest(){
 const rows=read('data/probability/generated/historical-reference-population-2021-2025.json').rows;
 const development=[];for(const n of [2,4,8]){const prior=fitOpportunityPrior(rows,{throughSeason:2022,shrinkGames:n}),result=historicalEvaluation(rows,prior,[2023]);development.push({shrink_games:n,selection_score:result.mean_scaled_mae,result});console.log('development',n,result.mean_scaled_mae);}
 const selected=development.reduce((a,b)=>a.selection_score<b.selection_score?a:b),prior=fitOpportunityPrior(rows,{throughSeason:2022,shrinkGames:selected.shrink_games}),holdout=historicalEvaluation(rows,prior,[2024,2025]);
 const validation={engine_sha256:createHash('sha256').update(fs.readFileSync('lib/opportunity-props.mjs')).digest('hex'),version:OPPORTUNITY_VERSION,status:'EXPERIMENTAL_NOT_PROMOTED',development,selected_shrink_games:selected.shrink_games,holdout,selection_frozen_before_holdout:true,eligible_for_pick:false,reason:'Full point-in-time injury/role/route inputs and archived sportsbook lines are absent; prospective validation required.',generated_at:new Date().toISOString(),baseline_evaluations_modified:false};
 write('guardrails/opportunity-props-validation-2026.json',validation);
 const currentPrior=fitOpportunityPrior(rows,{throughSeason:2025,shrinkGames:selected.shrink_games});write('data/probability/generated/opportunity-prop-priors-2021-2025.json',{...currentPrior,validation:{status:validation.status,eligible_for_pick:false,holdout_seasons:[2024,2025],development_season:2023,selection_frozen_before_holdout:true},engine_sha256:validation.engine_sha256,source_sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex')});
 console.log(JSON.stringify({holdout:holdout.metrics,prior_file:'data/probability/generated/opportunity-prop-priors-2021-2025.json'}));
}
async function live(){
 const schedule=read('data/calibration/weekly-event-schedule-2026.json'),season=schedule.season,week=Number(schedule.week),asOf=new Date().toISOString();
 const prior=read('data/probability/generated/opportunity-prop-priors-2021-2025.json'),source=`https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`;
 const [csv,availability,qbs]=await Promise.all([fetchText(source),fetchText('https://ctd-background-splits.brandonlowery013.workers.dev/availability/latest.json').then(JSON.parse),fetchText('https://ctd-background-splits.brandonlowery013.workers.dev/quarterbacks/latest.json').then(JSON.parse)]);
 if(availability.week!==week||qbs.week!==week)throw Error('Availability/QB forecast week mismatch');
 const history=read('data/probability/generated/historical-reference-population-2021-2025.json').rows,rows=[...history,...normalizePlayerRows(csv).filter(r=>beforeWeek(r,season,week))].sort((a,b)=>a.season-b.season||a.week-b.week);
 const oldPath='data/market/opportunity-props-2026.json',previous=fs.existsSync(oldPath)?read(oldPath):null;
 const games={},held={},players={};
 // Preserve any already-published pregame candidate once its kickoff passes.
 if(previous?.season===season&&previous.week===week){for(const [id,g]of Object.entries(previous.games||{}))if(Date.parse(g.kickoff)<=Date.parse(asOf))games[id]=g;for(const [name,p]of Object.entries(previous.players||{}))if(Date.parse(p.kickoff)<=Date.parse(asOf))players[name]=p;}
 for(const [id,g]of Object.entries(schedule.games)){
  const kickoff=g.event_start;if(Date.parse(kickoff)<=Date.parse(asOf))continue;
  try{
   const contexts=[g.home_team,g.away_team].map((rawTeam,index)=>{const team=canonicalTeam(rawTeam),opponent=canonicalTeam(index?g.home_team:g.away_team),roster=rosterFor(rows,team,season,week),scenario=Object.values(qbs.scenarios||{}).find(q=>q.game_id===id&&canonicalTeam(q.team)===team&&String(q.event_id)===String(g.event_id)&&Date.parse(q.kickoff)===Date.parse(kickoff));if(!scenario?.expected_qb||scenario.status==='REVIEW_REQUIRED')throw Error('Unresolved starting QB '+team);
    if(!roster.some(p=>playerIdentity(p.name)===playerIdentity(scenario.expected_qb)))roster.push({name:scenario.expected_qb,position:'QB',expected_active:null});
    const inactive=(availability.games||[]).find(r=>canonicalTeam(r.team)===team&&String(r.event_id)===String(g.event_id)&&Date.parse(r.kickoff)===Date.parse(kickoff));
    const fresh=availability.status==='CURRENT'&&Date.parse(asOf)-Date.parse(availability.observed_at)<=30*60000&&Date.parse(availability.observed_at)<=Date.parse(asOf),freshQB=Date.parse(asOf)-Date.parse(qbs.checked_at)<=30*60000&&Date.parse(qbs.checked_at)<=Date.parse(asOf);
    for(const p of roster){const out=inactive?.inactive_names?.some(n=>playerIdentity(n)===playerIdentity(p.name)),injury=(availability.injuries||[]).find(r=>canonicalTeam(r.team)===team&&playerIdentity(r.name)===playerIdentity(p.name));p.expected_active=fresh&&out?false:fresh&&/^(Out|Injured Reserve)$/i.test(injury?.status||'')?false:null;}
    const c=teamOpportunity({team,opponent,roster,rows,prior,season,week,expectedQB:scenario.expected_qb,asOf,kickoff});if(!fresh)c.missing.push('Current availability source is stale');if(!freshQB)c.missing.push('Current quarterback source is stale');c.missing.push('Full current roster/depth verification is incomplete; absence from inactive list is not proof of active status');return c;});
   const sim=simulateOpportunityGame({game:{game_id:id,season,week,kickoff,as_of:asOf},home:contexts[0],away:contexts[1],prior});
   for(const [name,p]of Object.entries(sim.players)){
    const stats=p.position==='QB'?['pass_attempts','pass_yards','pass_tds','interceptions','rush_attempts','rush_yards','rush_tds']:p.position==='RB'?['rush_attempts','rush_yards','rush_tds','targets','receptions','receiving_yards','receiving_tds']:['targets','receptions','receiving_yards','receiving_tds'];
    players[name]={position:p.position,team:p.team,game_id:id,kickoff,expected_active:p.expected_active,opportunity_method:p.opportunity_method,history_games:p.history_games,missing:p.missing,eligible_for_pick:false,status:'EXPERIMENTAL_CONDITIONAL',distributions:Object.fromEntries(stats.map(stat=>[stat,{family:'empirical_joint',status:'SHADOW_ONLY',...empiricalSummary(p.draws[stat]),parameters:empiricalHistogram(p.draws[stat]),market_price_used_in_probability:false}]))};
   }
   games[id]={kickoff,teams:contexts.map(c=>({team:c.team,opponent:c.opponent,plays:c.plays,pass_rate:c.pass_rate,coverage:c.coverage,missing:c.missing})),shared_draw_count:sim.draw_count,accounting:'QB passing yards/TDs equal all receiver yards/TDs, including OTHER; attempts and allocated opportunities reconcile exactly.'};
  }catch(e){held[id]={reason:e.message};}
 }
 const out={version:OPPORTUNITY_VERSION,season,week,generated_at:asOf,expires_at:new Date(Date.parse(asOf)+20*60000).toISOString(),status:'EXPERIMENTAL_NOT_PROMOTED',actionable:false,sportsbook_inputs_used:false,validation:prior.validation,players,games,held,sources:[{url:source,sha256:createHash('sha256').update(csv).digest('hex'),cutoff:`season<${season} or season=${season} and week<${week}`},{url:'https://ctd-background-splits.brandonlowery013.workers.dev/availability/latest.json',observed_at:availability.observed_at},{url:'https://ctd-background-splits.brandonlowery013.workers.dev/quarterbacks/latest.json',observed_at:qbs.checked_at}]};
 write('data/market/opportunity-props-2026.json',out);console.log(JSON.stringify({status:out.status,week,games:Object.keys(games).length,players:Object.keys(players).length,held,eligible_for_pick:0}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(process.argv.includes('--backtest'))await backtest();else if(process.argv.includes('--live')){try{await live();}catch(e){if(!process.argv.includes('--allow-unavailable'))throw e;const schedule=read('data/calibration/weekly-event-schedule-2026.json');write('data/market/opportunity-props-2026.json',{version:OPPORTUNITY_VERSION,season:schedule.season,week:schedule.week,generated_at:new Date().toISOString(),status:'UNAVAILABLE',actionable:false,sportsbook_inputs_used:false,players:{},games:{},held:{source:{reason:e.message}}});console.log('Opportunity projections held: '+e.message);}}else throw Error('Use --backtest or --live; no implicit model promotion');}
