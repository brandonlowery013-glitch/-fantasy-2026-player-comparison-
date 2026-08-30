import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const exists=p=>fs.existsSync(p);
const c=read('data/sources/automatic-football-context-adapters-2026.json');
const collector=fs.readFileSync('scripts/collect-automatic-football-context.mjs','utf8');
const workflow=fs.readFileSync('.github/workflows/step24-weekly-production-orchestration.yml','utf8');
const health=fs.readFileSync('scripts/check-weekly-pipeline-health.mjs','utf8');
const blocked=[];
if(c.availability_contract?.depth_chart_presence_may_support_expected_active_true!==false)blocked.push('depth chart still allowed to imply active');
if(c.availability_contract?.explicit_espn_athlete_active_flag_may_support_availability!==true)blocked.push('explicit ESPN active flag not supported');
if(c.week_alignment_contract?.verified_schedule_week_is_primary!==true)blocked.push('verified schedule week not primary');
if(!collector.includes('function verifiedScheduleWeek()'))blocked.push('verified schedule week resolver missing');
if(!collector.includes('availabilityFromEvidence'))blocked.push('explicit availability resolver missing');
if(collector.includes('current_depth_chart_presence'))blocked.push('legacy depth-chart active basis still present');
if(!collector.includes('espn_explicit_athlete_active_flag'))blocked.push('explicit athlete-active provenance missing');
if(!collector.includes("throw new Error('Unable to resolve 2026 NFL week from verified schedule or ESPN')"))blocked.push('unresolved week does not block');
if(!workflow.includes('id: context')||!workflow.includes("if: steps.context.outputs.ready == 'true'"))blocked.push('Step 24 context gate missing');
if(!workflow.includes('Object.keys(c.players||{}).length'))blocked.push('Step 24 does not require populated player context');
if(!health.includes('WAITING_FOR_CONTEXT'))blocked.push('weekly context waiting state regressed');
if(c.sportsbook_inputs_allowed!==false)blocked.push('sportsbook inputs allowed by adapter contract');
if(!collector.includes('market contamination'))blocked.push('collector market-contamination protection missing');
let activeWeek=null,gameCount=0,contextWeek=null,contextPlayers=0;
if(exists('data/calibration/weekly-event-schedule-2026.json')){
  const schedule=read('data/calibration/weekly-event-schedule-2026.json');
  activeWeek=Number(schedule.week??NaN);
  const games=Array.isArray(schedule.games)?schedule.games:Object.values(schedule.games||{});
  gameCount=games.length;
  if(Number.isFinite(activeWeek)&&(activeWeek<1||activeWeek>17))blocked.push(`active schedule week outside Weeks 1-17: ${activeWeek}`);
  if(gameCount>16)blocked.push(`active schedule has impossible game count ${gameCount}`);
}
if(exists('data/probability/weekly-football-context-raw-2026.json')){
  const context=read('data/probability/weekly-football-context-raw-2026.json');
  contextWeek=Number(context.week??NaN);contextPlayers=Object.keys(context.players||{}).length;
  if(Number.isFinite(activeWeek)&&contextPlayers>0&&contextWeek!==activeWeek)blocked.push(`stale football context week ${contextWeek} does not match active schedule week ${activeWeek}`);
  if(context.sportsbook_inputs_used===true)blocked.push('sportsbook contamination in active football context');
}
const report={generated_at:new Date().toISOString(),result:blocked.length?'BLOCKED':'PASS',step:28,season:2026,scope:'WEEKS_1_17',active_week:Number.isFinite(activeWeek)?activeWeek:null,active_games:gameCount,context_week:Number.isFinite(contextWeek)?contextWeek:null,context_players:contextPlayers,mode:'SHADOW_ONLY',actionable:false,verified_schedule_week_primary:c.week_alignment_contract?.verified_schedule_week_is_primary===true,depth_chart_presence_implies_active:c.availability_contract?.depth_chart_presence_may_support_expected_active_true,context_gate_present:workflow.includes('id: context'),blocked};
fs.mkdirSync('guardrails',{recursive:true});
fs.writeFileSync('guardrails/step28-weekly-context-activation-report.json',JSON.stringify(report,null,2)+'\n');
fs.writeFileSync('guardrails/step28-week1-context-activation-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(blocked.length)process.exit(1);
