import fs from 'node:fs';

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, x) => fs.writeFileSync(p, JSON.stringify(x, null, 2) + '\n');
const CONTRACT = 'data/sources/weekly-pipeline-health-2026.json';
const OUTPUT = 'data/calibration/weekly-pipeline-status-2026.json';

function arr(x) { return Array.isArray(x) ? x : x && typeof x === 'object' ? Object.values(x) : []; }
function wk(x) { const v = Number(x?.week); return Number.isInteger(v) && v > 0 ? v : null; }
function isFinal(g) {
  const s = String(g?.status || g?.state || g?.game_status || '').toUpperCase();
  return g?.final === true || g?.completed === true || ['FINAL','FINAL_OVERTIME','POST'].includes(s);
}
function statusFor({scheduleReady, contextReady, forecastReady, finalReady, settlementReady, stale=false, blocked=false}) {
  if (blocked) return 'BLOCKED';
  if (stale) return 'STALE';
  if (!scheduleReady) return 'WAITING_FOR_SOURCE';
  if (!contextReady) return 'WAITING_FOR_CONTEXT';
  if (!forecastReady) return 'WAITING_FOR_FORECAST';
  if (!finalReady) return 'WAITING_FOR_FINAL';
  if (!settlementReady) return 'WAITING_FOR_SETTLEMENT';
  return 'READY';
}

export function evaluate({schedule, context, forecasts, results, calibration, governance, now = new Date()}) {
  const games = arr(schedule?.games);
  const fc = arr(forecasts?.forecasts || forecasts?.records);
  const settlements = arr(results?.settlements || results?.results);
  const blockedReasons = [];
  if (context?.sportsbook_inputs_used === true) blockedReasons.push('Sportsbook input contamination detected in football context.');
  if (forecasts?.actionable === true || calibration?.actionable === true || governance?.actionable === true) blockedReasons.push('A shadow calibration artifact is unexpectedly actionable.');

  const weeks = new Set();
  for (const x of games) if (wk(x)) weeks.add(wk(x));
  for (const x of fc) if (wk(x)) weeks.add(wk(x));
  for (const x of settlements) if (wk(x)) weeks.add(wk(x));
  if (wk(context)) weeks.add(wk(context));

  if (!weeks.size) {
    return {
      schema_version:'1.1.0', season:2026, mode:'OBSERVATIONAL_ONLY', actionable:false,
      overall_status: blockedReasons.length ? 'BLOCKED' : 'WAITING_FOR_SOURCE', current_week:null, weeks:[],
      blocked_reasons:blockedReasons, stale_reasons:[],
      summary:{ready_weeks:0,waiting_weeks:0,stale_weeks:0,blocked_weeks:blockedReasons.length?1:0},
      reason: blockedReasons[0] || 'Verified 2026 regular-season event starts are not available yet.', generated_at:null
    };
  }

  const rows = [...weeks].sort((a,b)=>a-b).map(week => {
    const wg = games.filter(g => wk(g) === week);
    const wf = fc.filter(f => wk(f) === week);
    const ws = settlements.filter(s => wk(s) === week);
    const scheduleReady = wg.length > 0;
    const contextReady = Number(context?.week) === week && Object.keys(context?.players || {}).length > 0;
    const sourceReady = scheduleReady && contextReady;
    const forecastReady = wf.length > 0;
    const finalReady = wg.length > 0 && wg.every(isFinal);
    const settlementReady = finalReady && ws.length > 0;
    let stale = false;
    const staleReasons = [];
    if (contextReady && context?.captured_at && !forecastReady) {
      const age = (now - new Date(context.captured_at)) / 36e5;
      if (Number.isFinite(age) && age > 72) { stale = true; staleReasons.push(`Football context is ${age.toFixed(1)}h old without a frozen forecast.`); }
    }
    const blocked = blockedReasons.length > 0;
    const status = statusFor({scheduleReady, contextReady, forecastReady, finalReady, settlementReady, stale, blocked});
    return {week,status,schedule_ready:scheduleReady,context_ready:contextReady,source_ready:sourceReady,forecast_ready:forecastReady,final_ready:finalReady,settlement_ready:settlementReady,calibration_status:calibration?.status || null,governance_decision:governance?.decision || null,stale_reasons:staleReasons,blocked_reasons:blocked ? [...blockedReasons] : []};
  });

  const rank = {BLOCKED:0,STALE:1,WAITING_FOR_SOURCE:2,WAITING_FOR_CONTEXT:3,WAITING_FOR_FORECAST:4,WAITING_FOR_FINAL:5,WAITING_FOR_SETTLEMENT:6,READY:7};
  const overall = [...rows].sort((a,b)=>rank[a.status]-rank[b.status])[0]?.status || 'WAITING_FOR_SOURCE';
  return {
    schema_version:'1.1.0', season:2026, mode:'OBSERVATIONAL_ONLY', actionable:false,
    overall_status:overall, current_week:rows.find(r=>r.status!=='READY')?.week ?? rows.at(-1)?.week ?? null, weeks:rows,
    blocked_reasons:blockedReasons, stale_reasons:rows.flatMap(r=>r.stale_reasons.map(x=>`Week ${r.week}: ${x}`)),
    summary:{ready_weeks:rows.filter(r=>r.status==='READY').length,waiting_weeks:rows.filter(r=>r.status.startsWith('WAITING_')).length,stale_weeks:rows.filter(r=>r.status==='STALE').length,blocked_weeks:rows.filter(r=>r.status==='BLOCKED').length},
    reason:`Pipeline status derived observationally from ${rows.length} detected week(s).`, generated_at:null
  };
}

function selfTest() {
  const scheduleOnly={schedule:{games:[{week:1,status:'SCHEDULED'}]},context:{week:1,players:{},captured_at:new Date().toISOString(),sportsbook_inputs_used:false},forecasts:{forecasts:[]},results:{settlements:[]},calibration:{status:'AWAITING_SETTLED_FORECASTS',actionable:false},governance:{decision:'HOLD',actionable:false}};
  const z=evaluate(scheduleOnly); if(z.overall_status!=='WAITING_FOR_CONTEXT') throw Error('context wait test failed');
  const base={...scheduleOnly,context:{...scheduleOnly.context,players:{A:{}}}};
  const a=evaluate(base); if(a.overall_status!=='WAITING_FOR_FORECAST') throw Error('forecast wait test failed');
  const b=evaluate({...base,forecasts:{forecasts:[{week:1}]}}); if(b.overall_status!=='WAITING_FOR_FINAL') throw Error('final wait test failed');
  const c=evaluate({...base,schedule:{games:[{week:1,status:'FINAL'}]},forecasts:{forecasts:[{week:1}]}}); if(c.overall_status!=='WAITING_FOR_SETTLEMENT') throw Error('settlement wait test failed');
  const d=evaluate({...base,schedule:{games:[{week:1,status:'FINAL'}]},forecasts:{forecasts:[{week:1}]},results:{settlements:[{week:1}]}}); if(d.overall_status!=='READY') throw Error('ready test failed');
  const e=evaluate({...base,context:{...base.context,sportsbook_inputs_used:true}}); if(e.overall_status!=='BLOCKED') throw Error('blocked test failed');
  console.log('Step 20 pipeline health self-test passed');
}

if (process.argv.includes('--self-test')) selfTest();
else {
  const c=read(CONTRACT);
  const out=evaluate({schedule:read(c.inputs.schedule),context:read(c.inputs.football_context),forecasts:read(c.inputs.forecasts),results:read(c.inputs.settlements),calibration:read(c.inputs.calibration),governance:read(c.inputs.governance)});
  write(OUTPUT,out);
  console.log(`Step 20 pipeline health: ${out.overall_status}`);
}
