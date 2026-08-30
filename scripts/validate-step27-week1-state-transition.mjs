import fs from 'node:fs';
import { evaluate } from './check-weekly-pipeline-health.mjs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const exists=p=>fs.existsSync(p);
const health=read('data/sources/weekly-pipeline-health-2026.json');
const readiness=read('data/sources/production-readiness-dry-run-2026.json');
const blocked=[];

if(!health.allowed_statuses.includes('WAITING_FOR_CONTEXT'))blocked.push('weekly pipeline contract missing WAITING_FOR_CONTEXT');
if(!readiness.readiness_states.includes('WAITING_FOR_CONTEXT'))blocked.push('production readiness contract missing WAITING_FOR_CONTEXT');
if(!readiness.required_scenarios.includes('SOURCE_READY_CONTEXT_MISSING'))blocked.push('production readiness scenarios do not test schedule-only state');

function fixture(week,gameCount){
  const games=Array.from({length:gameCount},(_,i)=>({week,status:'SCHEDULED',away_team:`A${i}`,home_team:`H${i}`,event_start:`2026-10-${String((i%20)+1).padStart(2,'0')}T20:00:00Z`,verified:true}));
  return {
    schedule:{season:2026,week,games},
    context:{season:2026,week,players:{},captured_at:'2026-08-30T15:00:00Z',sportsbook_inputs_used:false},
    forecasts:{forecasts:[]},results:{settlements:[]},
    calibration:{status:'AWAITING_SETTLED_FORECASTS',actionable:false},governance:{decision:'HOLD',actionable:false}
  };
}

const scenarios=[{week:1,games:16},{week:2,games:16},{week:8,games:13},{week:17,games:16}];
const scenarioResults=[];
for(const s of scenarios){
  const base=fixture(s.week,s.games);
  const scheduleOnly=evaluate(base);
  if(scheduleOnly.overall_status!=='WAITING_FOR_CONTEXT')blocked.push(`week ${s.week} schedule-only expected WAITING_FOR_CONTEXT got ${scheduleOnly.overall_status}`);
  if(scheduleOnly.weeks?.find(x=>x.week===s.week)?.schedule_ready!==true||scheduleOnly.weeks?.find(x=>x.week===s.week)?.context_ready!==false)blocked.push(`week ${s.week} schedule/context readiness flags are not separated`);
  const withContext=evaluate({...base,context:{...base.context,players:{'Josh Allen':{}}}});
  if(withContext.overall_status!=='WAITING_FOR_FORECAST')blocked.push(`week ${s.week} context-ready expected WAITING_FOR_FORECAST got ${withContext.overall_status}`);
  const withForecast=evaluate({...base,context:{...base.context,players:{'Josh Allen':{}}},forecasts:{forecasts:[{week:s.week}]}});
  if(withForecast.overall_status!=='WAITING_FOR_FINAL')blocked.push(`week ${s.week} forecast-ready expected WAITING_FOR_FINAL got ${withForecast.overall_status}`);
  const staleWeek=s.week===1?2:s.week-1;
  const staleForecast=evaluate({...base,context:{...base.context,players:{'Josh Allen':{}}},forecasts:{forecasts:[{week:staleWeek}]}});
  const activeStaleRow=staleForecast.weeks?.find(x=>x.week===s.week);
  if(activeStaleRow?.status!=='WAITING_FOR_FORECAST'||activeStaleRow?.forecast_ready!==false)blocked.push(`week ${s.week} accepted stale-week forecast state`);
  const contaminated=evaluate({...base,context:{...base.context,players:{'Josh Allen':{}},sportsbook_inputs_used:true}});
  if(contaminated.overall_status!=='BLOCKED')blocked.push(`week ${s.week} sportsbook contamination must block live activation`);
  scenarioResults.push({week:s.week,games:s.games,schedule_only:scheduleOnly.overall_status,context_ready:withContext.overall_status,forecast_ready:withForecast.overall_status,stale_forecast_overall:staleForecast.overall_status,active_week_with_stale_forecast:activeStaleRow?.status||null,contaminated:contaminated.overall_status});
}

let activeWeek=null;let activeGames=null;
if(exists('data/calibration/weekly-event-schedule-2026.json')){
  const schedule=read('data/calibration/weekly-event-schedule-2026.json');
  activeWeek=Number(schedule.week??NaN);
  const games=Array.isArray(schedule.games)?schedule.games:Object.values(schedule.games||{});
  activeGames=games.length;
  if(Number.isFinite(activeWeek)&&(activeWeek<1||activeWeek>17))blocked.push(`active production week outside Weeks 1-17: ${activeWeek}`);
  if(activeGames>16)blocked.push(`active week has impossible game count ${activeGames}`);
}

const result={generated_at:new Date().toISOString(),result:blocked.length?'BLOCKED':'PASS',step:27,season:2026,scope:'WEEKS_1_17',active_week:Number.isFinite(activeWeek)?activeWeek:null,active_games:activeGames,transitions:['WAITING_FOR_SOURCE','WAITING_FOR_CONTEXT','WAITING_FOR_FORECAST','WAITING_FOR_FINAL','WAITING_FOR_SETTLEMENT','READY'],scenario_results:scenarioResults,sportsbook_inputs_used:false,blocked};
fs.mkdirSync('guardrails',{recursive:true});
fs.writeFileSync('guardrails/step27-weekly-state-transition-report.json',JSON.stringify(result,null,2)+'\n');
fs.writeFileSync('guardrails/step27-week1-state-transition-report.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
if(blocked.length)process.exit(1);
