import fs from 'node:fs';
import path from 'node:path';

const TZ='America/Chicago';
const event=process.env.GITHUB_EVENT_NAME||'schedule';
const nowArg=process.argv.find(x=>x.startsWith('--now='));
const now=nowArg?new Date(nowArg.slice(6)):new Date();
const outFile=process.env.GITHUB_OUTPUT||null;

function chicagoParts(d){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:TZ,weekday:'short',hour:'2-digit',hour12:false,minute:'2-digit',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
  const get=t=>parts.find(p=>p.type===t)?.value;
  return {weekday:get('weekday'),hour:Number(get('hour')),minute:Number(get('minute')),date:`${get('year')}-${get('month')}-${get('day')}`};
}
function readJson(p){try{return JSON.parse(fs.readFileSync(path.join(process.cwd(),p),'utf8'));}catch{return null;}}
function gameWindowReason(d){
  const schedule=readJson('data/calibration/weekly-event-schedule-2026.json');
  const games=Object.values(schedule?.games||{});
  if(!games.length)return null;
  const t=d.getTime();
  for(const g of games){
    const k=Date.parse(g.kickoff_utc||g.start_time_utc||g.date||'');
    if(!Number.isFinite(k))continue;
    const delta=(k-t)/3600000;
    if(delta>=0&&delta<=6)return 'GAME_WITHIN_6_HOURS';
    if(delta<0&&delta>=-4)return 'RECENT_GAME_SETTLEMENT_WINDOW';
  }
  return null;
}
function dayPolicy(parts){
  const h=parts.hour;
  if(['Tue','Wed','Fri'].includes(parts.weekday))return [0,6,12,18].includes(h)?'BASE_6_HOUR':'SKIP_BASE_6_HOUR';
  if(parts.weekday==='Sat')return [0,4,8,12,16,20].includes(h)?'SATURDAY_4_HOUR':'SKIP_SATURDAY_4_HOUR';
  if(parts.weekday==='Thu')return ([0,6,12].includes(h)||h>=14)?'THURSDAY_TNF_WINDOW':'SKIP_THURSDAY';
  if(parts.weekday==='Sun')return ([0,4,8].includes(h)||h>=9)?'SUNDAY_GAME_WINDOW':'SKIP_SUNDAY';
  if(parts.weekday==='Mon')return ([0,6,12].includes(h)||h>=14)?'MONDAY_MNF_WINDOW':'SKIP_MONDAY';
  return [0,6,12,18].includes(h)?'OFFDAY_6_HOUR':'SKIP_OFFDAY_6_HOUR';
}
function decide(d){
  if(event==='workflow_dispatch')return {run:true,reason:'MANUAL_DISPATCH'};
  const parts=chicagoParts(d);
  const gameReason=gameWindowReason(d);
  if(gameReason)return {run:true,reason:gameReason,parts};
  const reason=dayPolicy(parts);
  return {run:!reason.startsWith('SKIP_'),reason,parts};
}

if(process.argv.includes('--self-test')){
  const cases=[
    ['2026-09-08T11:10:00Z',true,'Tue base'],
    ['2026-09-08T13:10:00Z',false,'Tue skip'],
    ['2026-09-10T19:10:00Z',true,'Thu afternoon/TNF'],
    ['2026-09-13T14:10:00Z',true,'Sun game window'],
    ['2026-09-14T19:10:00Z',true,'Mon afternoon/MNF'],
    ['2026-09-12T13:10:00Z',true,'Sat 4-hour']
  ];
  const saved=process.env.GITHUB_EVENT_NAME;
  for(const [iso,expected,label] of cases){const r=decide(new Date(iso));if(r.run!==expected)throw new Error(`${label} expected ${expected} got ${r.run} (${r.reason})`);}
  if(saved!==undefined)process.env.GITHUB_EVENT_NAME=saved;
  console.log(JSON.stringify({result:'PASS',timezone:TZ,cases:cases.length},null,2));
  process.exit(0);
}

const decision=decide(now);
const report={generated_at:new Date().toISOString(),evaluated_at:now.toISOString(),timezone:TZ,event,run:decision.run,reason:decision.reason,chicago:decision.parts||chicagoParts(now),policy:{tue_wed_fri:'every 6 hours',sat:'every 4 hours',thu:'00/06/12 plus hourly from 14:00 through 23:00 CT',sun:'00/04/08 plus hourly from 09:00 through 23:00 CT',mon:'00/06/12 plus hourly from 14:00 through 23:00 CT',dynamic:'hourly when a persisted kickoff is within 6 hours or within 4 hours after kickoff for settlement'}};
fs.mkdirSync('guardrails',{recursive:true});
fs.writeFileSync('guardrails/production-cadence-gate-report.json',JSON.stringify(report,null,2)+'\n');
if(outFile)fs.appendFileSync(outFile,`run=${decision.run?'true':'false'}\nreason=${decision.reason}\n`);
console.log(JSON.stringify(report,null,2));
