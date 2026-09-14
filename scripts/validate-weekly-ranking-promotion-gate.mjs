import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const exists=p=>fs.existsSync(path.join(root,p));
const write=(p,x)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),JSON.stringify(x,null,2)+'\n');};

export function evaluatePromotion({schedule,context,readiness,weeklyProjection}){
  const reasons=[];
  const scheduleGames=Object.keys(schedule?.games||{}).length;
  const contextPlayers=Object.keys(context?.players||{}).length;
  const scheduleWeek=Number(schedule?.week);
  const contextWeek=Number(context?.week);
  const scheduleReady=scheduleGames>0&&schedule?.status==='LIVE_SCHEDULE_INGESTED';
  const contextReady=scheduleReady&&Number.isFinite(scheduleWeek)&&contextWeek===scheduleWeek&&contextPlayers>0;
  const readinessReady=readiness?.overall_status==='READY'&&Array.isArray(readiness?.blocked)&&readiness.blocked.length===0;
  const modelClean=weeklyProjection?.sportsbook_inputs_used===false;
  if(!scheduleReady)reasons.push('live verified weekly schedule is not ready');
  if(!contextReady)reasons.push('weekly football context is missing or week-misaligned');
  if(!readinessReady)reasons.push(`production readiness is ${readiness?.overall_status||'MISSING'}, not READY`);
  if(!modelClean)reasons.push('weekly football projection layer is missing or market-contaminated');
  const eligible=reasons.length===0;
  const projectionActionable=weeklyProjection?.actionable===true||weeklyProjection?.mode==='LIVE'||weeklyProjection?.status==='LIVE';
  const violation=projectionActionable&&!eligible;
  return {eligible,projection_actionable:projectionActionable,violation,reasons,evidence:{schedule_games:scheduleGames,schedule_week:Number.isFinite(scheduleWeek)?scheduleWeek:null,context_week:Number.isFinite(contextWeek)?contextWeek:null,context_players:contextPlayers,production_readiness:readiness?.overall_status||null,sportsbook_inputs_used:weeklyProjection?.sportsbook_inputs_used??null}};
}

function fixture({ready=false,actionable=false}={}){
  return {
    schedule:ready?{status:'LIVE_SCHEDULE_INGESTED',week:1,games:{G1:{verified:true}}}:{status:'AWAITING_SOURCE',week:1,games:{}},
    context:ready?{week:1,players:{A:{}}}:{week:1,players:{}},
    readiness:ready?{overall_status:'READY',blocked:[]}:{overall_status:'WAITING_FOR_CONTEXT',blocked:[]},
    weeklyProjection:{sportsbook_inputs_used:false,actionable,status:actionable?'LIVE':'SHADOW_ONLY'}
  };
}

const self=process.argv.includes('--self-test');
let result;
if(self){
  const pre=evaluatePromotion(fixture({ready:false,actionable:false}));
  const illegal=evaluatePromotion(fixture({ready:false,actionable:true}));
  const ready=evaluatePromotion(fixture({ready:true,actionable:false}));
  const live=evaluatePromotion(fixture({ready:true,actionable:true}));
  const failures=[];
  if(pre.eligible)failures.push('pre-ready state must not be eligible');
  if(!illegal.violation)failures.push('premature actionable projection must be a violation');
  if(!ready.eligible||ready.violation)failures.push('READY prerequisites must be promotion eligible');
  if(!live.eligible||live.violation)failures.push('actionable projection is allowed only after READY prerequisites');
  result={generated_at:new Date().toISOString(),result:failures.length?'BLOCKED':'PASS',tests:4,failed:failures.length,failures};
}else{
  const schedule=exists('data/calibration/weekly-event-schedule-2026.json')?read('data/calibration/weekly-event-schedule-2026.json'):null;
  const context=exists('data/probability/weekly-football-context-raw-2026.json')?read('data/probability/weekly-football-context-raw-2026.json'):null;
  const readiness=exists('data/calibration/production-readiness-status-2026.json')?read('data/calibration/production-readiness-status-2026.json'):null;
  const weeklyProjection=exists('data/probability/weekly-projection-inputs-2026.json')?read('data/probability/weekly-projection-inputs-2026.json'):null;
  const gate=evaluatePromotion({schedule,context,readiness,weeklyProjection});
  result={generated_at:new Date().toISOString(),result:gate.violation?'BLOCKED':'PASS',promotion_eligible:gate.eligible,...gate};
}

write('guardrails/weekly-ranking-promotion-gate-report.json',result);
console.log(JSON.stringify(result,null,2));
if(result.result!=='PASS')process.exit(1);
