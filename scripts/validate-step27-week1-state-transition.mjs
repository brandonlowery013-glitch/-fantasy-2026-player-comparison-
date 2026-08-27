import fs from 'node:fs';
import { evaluate } from './check-weekly-pipeline-health.mjs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const seed=read('data/sources/nfl-authoritative-week1-2026.json');
const health=read('data/sources/weekly-pipeline-health-2026.json');
const readiness=read('data/sources/production-readiness-dry-run-2026.json');
const blocked=[];
const games=Array.isArray(seed.games)?seed.games:Object.values(seed.games||{});
if(games.length!==16)blocked.push(`authoritative Week 1 seed expected 16 games, got ${games.length}`);
if(!health.allowed_statuses.includes('WAITING_FOR_CONTEXT'))blocked.push('weekly pipeline contract missing WAITING_FOR_CONTEXT');
if(!readiness.readiness_states.includes('WAITING_FOR_CONTEXT'))blocked.push('production readiness contract missing WAITING_FOR_CONTEXT');
if(!readiness.required_scenarios.includes('SOURCE_READY_CONTEXT_MISSING'))blocked.push('production readiness scenarios do not test schedule-only state');
const base={
  schedule:{season:2026,week:1,games:games.map(g=>({week:1,status:'SCHEDULED',away_team:g.away_team,home_team:g.home_team,event_start:g.event_start}))},
  context:{season:2026,week:1,players:{},captured_at:'2026-08-27T15:00:00Z',sportsbook_inputs_used:false},
  forecasts:{forecasts:[]},results:{settlements:[]},
  calibration:{status:'AWAITING_SETTLED_FORECASTS',actionable:false},governance:{decision:'HOLD',actionable:false}
};
const scheduleOnly=evaluate(base);
if(scheduleOnly.overall_status!=='WAITING_FOR_CONTEXT')blocked.push(`schedule-only expected WAITING_FOR_CONTEXT got ${scheduleOnly.overall_status}`);
if(scheduleOnly.weeks?.[0]?.schedule_ready!==true||scheduleOnly.weeks?.[0]?.context_ready!==false)blocked.push('schedule/context readiness flags are not separated');
const withContext=evaluate({...base,context:{...base.context,players:{'Josh Allen':{}}}});
if(withContext.overall_status!=='WAITING_FOR_FORECAST')blocked.push(`context-ready expected WAITING_FOR_FORECAST got ${withContext.overall_status}`);
const withForecast=evaluate({...base,context:{...base.context,players:{'Josh Allen':{}}},forecasts:{forecasts:[{week:1}]}});
if(withForecast.overall_status!=='WAITING_FOR_FINAL')blocked.push(`forecast-ready expected WAITING_FOR_FINAL got ${withForecast.overall_status}`);
const contaminated=evaluate({...base,context:{...base.context,players:{'Josh Allen':{}},sportsbook_inputs_used:true}});
if(contaminated.overall_status!=='BLOCKED')blocked.push('sportsbook contamination must block live activation');
const result={generated_at:new Date().toISOString(),result:blocked.length?'BLOCKED':'PASS',step:27,week:1,seed_games:games.length,transitions:['WAITING_FOR_SOURCE','WAITING_FOR_CONTEXT','WAITING_FOR_FORECAST','WAITING_FOR_FINAL','WAITING_FOR_SETTLEMENT','READY'],sportsbook_inputs_used:false,blocked};
fs.mkdirSync('guardrails',{recursive:true});fs.writeFileSync('guardrails/step27-week1-state-transition-report.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
if(blocked.length)process.exit(1);
