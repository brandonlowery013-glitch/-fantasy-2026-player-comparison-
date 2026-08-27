import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const exists=p=>fs.existsSync(path.join(root,p));
const write=(p,x)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),JSON.stringify(x,null,2)+'\n');};
const contract=read('data/sources/production-readiness-dry-run-2026.json');
const workflow=fs.readFileSync('.github/workflows/step24-weekly-production-orchestration.yml','utf8');
const ownership=fs.readFileSync('scripts/validate-production-schedule-ownership.mjs','utf8');
const safe=p=>exists(p)?read(p):null;

function derive(s){
  const blocked=[];
  const scheduleGames=Object.keys(s.schedule?.games||{}).length;
  const scheduleReady=scheduleGames>0;
  const contextPlayers=Object.keys(s.context?.players||{}).length;
  const contextReady=scheduleReady && Number(s.context?.week)===Number(s.schedule?.week) && contextPlayers>0;
  const providerPresent=s.market?.provider_credentials_present===true;
  const frozen=Object.keys(s.freeze?.forecasts||s.freeze?.snapshots||{}).length;
  const gameProjections=Object.keys(s.games?.games||{}).length;
  const gameMarkets=Object.keys(s.gameSnapshots?.games||{}).length;
  const propMarkets=Array.isArray(s.propSnapshots?.snapshots)?s.propSnapshots.snapshots.length:Object.keys(s.propSnapshots?.snapshots||{}).length;
  const finals=Number(s.finals||0), settled=Number(s.settled||0);
  if(settled>finals)blocked.push('settlement count exceeds final-game evidence');
  if((gameMarkets>0||propMarkets>0)&&!scheduleReady)blocked.push('market snapshots exist without verified source schedule');
  if(frozen>0&&!contextReady)blocked.push('frozen forecasts exist without verified football context');
  if(s.football_market_contamination===true)blocked.push('sportsbook contamination detected in football model');
  let status='READY',reason='Production lifecycle prerequisites are present for the current phase.';
  if(blocked.length){status='BLOCKED';reason=blocked.join('; ');}
  else if(!scheduleReady){status='WAITING_FOR_SOURCE';reason='Verified 2026 weekly source events are not populated yet.';}
  else if(!contextReady){status='WAITING_FOR_CONTEXT';reason='Verified schedule exists, but live weekly football context is not populated yet.';}
  else if(!frozen||!gameProjections){status='WAITING_FOR_FORECAST';reason='Schedule/context are ready, but required frozen player or game forecasts are incomplete.';}
  else if(!providerPresent){status='WAITING_FOR_PROVIDER_CREDENTIALS';reason='Forecasts are ready, but ODDS_API_KEY is not confirmed by the live ingestion layer.';}
  else if(!gameMarkets&&!propMarkets){status='WAITING_FOR_MARKETS';reason='Forecasts and provider are ready, but no captured sportsbook snapshots are available yet.';}
  else if(finals===0){status='READY';reason='Pregame production chain is ready; awaiting games/finals after recommendations are generated.';}
  else if(settled<finals){status='WAITING_FOR_SETTLEMENT';reason='Final-game evidence exists and frozen forecasts still require settlement.';}
  else {status='READY';reason='Postgame settlement is synchronized with available final-game evidence.';}
  return {status,reason,blocked,evidence:{schedule_games:scheduleGames,football_context_players:contextPlayers,football_context_ready:contextReady,provider_credentials_present:providerPresent,frozen_forecasts:frozen,game_projections:gameProjections,game_market_games:gameMarkets,player_prop_snapshots:propMarkets,final_games:finals,settled_forecasts:settled}};
}

function fixture(kind){
  const base={schedule:{season:2026,week:1,games:{}},context:{season:2026,week:1,players:{}},market:{provider_credentials_present:false},freeze:{forecasts:{}},games:{games:{}},gameSnapshots:{games:{}},propSnapshots:{snapshots:[]},finals:0,settled:0,football_market_contamination:false};
  if(kind==='PRESEASON_WAITING_FOR_SOURCE')return base;
  base.schedule.games={G1:{}};
  if(kind==='SOURCE_READY_CONTEXT_MISSING')return base;
  base.context.players={A:{}};
  if(kind==='SOURCE_READY_PROVIDER_CREDENTIAL_MISSING'){base.freeze.forecasts={F1:{}};base.games.games={G1:{}};return base;}
  base.market.provider_credentials_present=true;base.freeze.forecasts={F1:{}};base.games.games={G1:{}};
  if(kind==='PREGAME_FULLY_READY'){base.gameSnapshots.games={G1:{}};return base;}
  if(kind==='FINAL_WAITING_FOR_SETTLEMENT'){base.gameSnapshots.games={G1:{}};base.finals=1;return base;}
  if(kind==='POSTGAME_SETTLED'){base.gameSnapshots.games={G1:{}};base.finals=1;base.settled=1;return base;}
  if(kind==='ILLEGAL_CHRONOLOGY_BLOCKED'){base.schedule.games={};base.context.players={};base.freeze.forecasts={F1:{}};base.settled=1;return base;}
  return base;
}

const self=process.argv.includes('--self-test');
let cases={};const blocked=[];
if(self){
  const expected={PRESEASON_WAITING_FOR_SOURCE:'WAITING_FOR_SOURCE',SOURCE_READY_CONTEXT_MISSING:'WAITING_FOR_CONTEXT',SOURCE_READY_PROVIDER_CREDENTIAL_MISSING:'WAITING_FOR_PROVIDER_CREDENTIALS',PREGAME_FULLY_READY:'READY',FINAL_WAITING_FOR_SETTLEMENT:'WAITING_FOR_SETTLEMENT',POSTGAME_SETTLED:'READY',ILLEGAL_CHRONOLOGY_BLOCKED:'BLOCKED'};
  for(const name of contract.required_scenarios){const x=derive(fixture(name));cases[name]=x;if(x.status!==expected[name])blocked.push(`${name} expected ${expected[name]} got ${x.status}`);}
} else {
  const schedule=safe('data/calibration/weekly-event-schedule-2026.json');
  const context=safe('data/probability/weekly-football-context-raw-2026.json');
  const market=safe('data/market/live-market-ingestion-status-2026.json');
  const freeze=safe('data/calibration/weekly-forecast-capture-2026.json');
  const games=safe('data/probability/generated/weekly-game-projections-2026.json');
  const gameSnapshots=safe('data/market/weekly-matchup-market-snapshots-2026.json');
  const propSnapshots=safe('data/market/player-prop-market-snapshots-2026.json');
  const results=safe('data/calibration/weekly-forecast-results-2026.json');
  const finals=(results?.final_games||results?.finals||[]).length||0;
  const settled=(results?.settlements||results?.results||[]).length||0;
  cases.CURRENT=derive({schedule,context,market,freeze,games,gameSnapshots,propSnapshots,finals,settled,football_market_contamination:games?.sportsbook_inputs_used===true});
}
const commitCount=(workflow.match(/git commit -m/g)||[]).length;
const pushCount=(workflow.match(/git push origin HEAD:main/g)||[]).length;
const concurrencyOk=workflow.includes('group: weekly-production-orchestration')&&workflow.includes('cancel-in-progress: false');
const secretWired=workflow.includes('ODDS_API_KEY: ${{ secrets.ODDS_API_KEY }}');
const ownershipValidatorPresent=ownership.includes('weekly-production-orchestration');
if(commitCount!==1)blocked.push(`Step 24 production workflow must contain exactly one commit point; found ${commitCount}`);
if(pushCount!==1)blocked.push(`Step 24 production workflow must contain exactly one push point; found ${pushCount}`);
if(!concurrencyOk)blocked.push('Step 24 shared non-cancelling concurrency lock missing');
if(!secretWired)blocked.push('ODDS_API_KEY is not wired through Step 24 provider stage');
if(!ownershipValidatorPresent)blocked.push('production schedule ownership validator missing');
const now=new Date().toISOString();
const current=self?null:cases.CURRENT;
const out={schema_version:'1.1.0',season:2026,step:25,mode:'SHADOW_ONLY',actionable:false,generated_at:now,overall_status:blocked.length?'BLOCKED':current?.status||'SELF_TEST_PASS',reason:blocked.length?blocked.join('; '):current?.reason||'All dry-run scenarios passed.',provider_secret_name:'ODDS_API_KEY',provider_secret_value_observable:false,production_invariants:{single_commit_per_cycle:commitCount===1,single_push_per_cycle:pushCount===1,shared_concurrency_lock:concurrencyOk,provider_secret_wired:secretWired,exclusive_schedule_ownership_validator:ownershipValidatorPresent},evidence:current?.evidence||null,blocked};
const report={generated_at:now,result:blocked.length?'BLOCKED':'PASS',scenario_statuses:Object.fromEntries(Object.entries(cases).map(([k,v])=>[k,v.status])),production_invariants:out.production_invariants,blocked};
write('guardrails/production-readiness-dry-run-report.json',report);if(!self)write('data/calibration/production-readiness-status-2026.json',out);console.log(JSON.stringify(report,null,2));if(blocked.length)process.exit(1);
