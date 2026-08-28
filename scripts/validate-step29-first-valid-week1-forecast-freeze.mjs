import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const exists=p=>fs.existsSync(path.join(root,p));
const write=(p,x)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),JSON.stringify(x,null,2)+'\n');};
const contract=read('data/sources/first-valid-week1-forecast-freeze-2026.json');
const arr=x=>Array.isArray(x)?x:Object.values(x||{});
const iso=x=>{const t=Date.parse(String(x||''));return Number.isFinite(t)?t:null;};

export function evaluate({schedule,context,distributions,ledger}){
  const blocked=[];
  const games=arr(schedule?.games);
  const verified=games.filter(g=>g?.verified===true&&iso(g.event_start||g.kickoff)!=null);
  const scheduleWeek=Number(schedule?.week??verified[0]?.week??NaN);
  if(!verified.length)return {status:'WAITING_FOR_SOURCE',blocked,evidence:{verified_games:0}};
  const contextPlayers=Object.values(context?.players||{});
  const contextWeek=Number(context?.week);
  if(context?.sportsbook_inputs_used===true)blocked.push('sportsbook contamination in football context');
  if(contextWeek!==scheduleWeek||!contextPlayers.length)return {status:blocked.length?'BLOCKED':'WAITING_FOR_CONTEXT',blocked,evidence:{verified_games:verified.length,context_players:contextPlayers.length,schedule_week:scheduleWeek,context_week:Number.isFinite(contextWeek)?contextWeek:null}};
  if(contextPlayers.some(p=>typeof p?.expected_active!=='boolean'))blocked.push('context contains non-explicit expected_active');
  if(blocked.length)return {status:'BLOCKED',blocked,evidence:{verified_games:verified.length,context_players:contextPlayers.length}};
  const distPlayers=Object.values(distributions?.distributions||{});
  if(Number(distributions?.week)!==contextWeek||Number(distributions?.season)!==2026||!distPlayers.length)return {status:'WAITING_FOR_DISTRIBUTIONS',blocked,evidence:{verified_games:verified.length,context_players:contextPlayers.length,distribution_players:distPlayers.length}};
  if(distributions?.sportsbook_inputs_used===true)blocked.push('sportsbook contamination in probability distributions');
  const forecasts=arr(ledger?.forecasts).filter(f=>Number(f.week)===1&&Number(f.season)===2026);
  const ids=new Set();
  for(const f of forecasts){
    if(ids.has(f.forecast_id))blocked.push(`duplicate forecast_id ${f.forecast_id}`);ids.add(f.forecast_id);
    if(f.frozen!==true)blocked.push(`${f.forecast_id} not frozen`);
    if(f.split!=='HOLDOUT')blocked.push(`${f.forecast_id} not HOLDOUT`);
    const cap=iso(f.captured_at),start=iso(f.event_start);if(cap==null||start==null||cap>=start)blocked.push(`${f.forecast_id} not captured pregame`);
  }
  if(blocked.length)return {status:'BLOCKED',blocked,evidence:{verified_games:verified.length,context_players:contextPlayers.length,distribution_players:distPlayers.length,frozen_forecasts:forecasts.length}};
  if(!forecasts.length)return {status:'WAITING_FOR_FREEZE',blocked,evidence:{verified_games:verified.length,context_players:contextPlayers.length,distribution_players:distPlayers.length,frozen_forecasts:0}};
  return {status:'FROZEN',blocked,evidence:{verified_games:verified.length,context_players:contextPlayers.length,distribution_players:distPlayers.length,frozen_forecasts:forecasts.length}};
}

function fixture(stage){
  const schedule={season:2026,week:1,games:{G1:{week:1,verified:true,event_start:'2026-09-10T20:00:00Z'}}};
  const context={season:2026,week:1,sportsbook_inputs_used:false,players:{P1:{expected_active:true}}};
  const distributions={season:2026,week:1,sportsbook_inputs_used:false,distributions:{P1:{position:'WR',distributions:{receiving_yards:{status:'SHADOW_ONLY',mean:70,sd:20}}}}};
  const ledger={season:2026,forecasts:[{forecast_id:'F1',season:2026,week:1,player:'P1',stat:'receiving_yards',event_start:'2026-09-10T20:00:00Z',captured_at:'2026-09-10T12:00:00Z',frozen:true,split:'HOLDOUT'}]};
  if(stage==='source')return {schedule:{games:{}},context:{},distributions:{},ledger:{forecasts:[]}};
  if(stage==='context')return {schedule,context:{week:null,players:{}},distributions:{},ledger:{forecasts:[]}};
  if(stage==='dist')return {schedule,context,distributions:{week:1,distributions:{}},ledger:{forecasts:[]}};
  if(stage==='freeze')return {schedule,context,distributions,ledger:{forecasts:[]}};
  if(stage==='blocked'){const bad=structuredClone(ledger);bad.forecasts[0].captured_at='2026-09-10T21:00:00Z';return {schedule,context,distributions,ledger:bad};}
  return {schedule,context,distributions,ledger};
}

const self=process.argv.includes('--self-test');
let report;
if(self){
  const expected={source:'WAITING_FOR_SOURCE',context:'WAITING_FOR_CONTEXT',dist:'WAITING_FOR_DISTRIBUTIONS',freeze:'WAITING_FOR_FREEZE',frozen:'FROZEN',blocked:'BLOCKED'};const cases={};const failures=[];
  for(const [k,v] of Object.entries(expected)){const r=evaluate(fixture(k));cases[k]=r.status;if(r.status!==v)failures.push(`${k}: expected ${v}, got ${r.status}`);}
  report={generated_at:new Date().toISOString(),result:failures.length?'BLOCKED':'PASS',cases,failures};
}else{
  const safe=p=>exists(p)?read(p):{};
  const r=evaluate({schedule:safe(contract.inputs.schedule),context:safe(contract.inputs.context),distributions:safe(contract.inputs.distributions),ledger:safe(contract.inputs.ledger)});
  report={generated_at:new Date().toISOString(),result:r.status==='BLOCKED'?'BLOCKED':'PASS',status:r.status,mode:'SHADOW_ONLY',actionable:false,evidence:r.evidence,blocked:r.blocked};
  write('data/calibration/first-valid-week1-forecast-freeze-status-2026.json',report);
}
write('guardrails/step29-first-valid-week1-forecast-freeze-report.json',report);
console.log(JSON.stringify(report,null,2));if(report.result==='BLOCKED')process.exit(1);
