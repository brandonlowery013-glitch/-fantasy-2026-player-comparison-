import fs from 'node:fs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const contract=read('data/sources/live-market-ingestion-2026.json');
const schedule=read('data/calibration/weekly-event-schedule-2026.json');
const status=fs.existsSync('data/market/live-market-ingestion-status-2026.json')?read('data/market/live-market-ingestion-status-2026.json'):{};
const nowMs=Date.parse(process.env.MARKET_REFRESH_NOW||new Date().toISOString());
if(!Number.isFinite(nowMs))throw new Error('MARKET_REFRESH_NOW invalid');

export function targetBand(minutesToKickoff,c=contract){
  const bands=[...(c.cadence?.adaptive_bands||[])].sort((a,b)=>Number(b.minimum_minutes_to_kickoff)-Number(a.minimum_minutes_to_kickoff));
  return bands.find(b=>minutesToKickoff>=Number(b.minimum_minutes_to_kickoff))||null;
}

export function effectiveRefreshSeconds(minutesToKickoff,c=contract){
  const band=targetBand(minutesToKickoff,c);
  if(!band)return null;
  const floor=Number(c.cadence?.github_actions_scheduler_floor_seconds||0);
  return {band:band.label,target_seconds:Number(band.target_refresh_seconds),effective_seconds:Math.max(Number(band.target_refresh_seconds),floor)};
}

function scheduleGames(s){return Object.entries(s.games||{}).map(([id,g])=>({id,...g,kickoff:g.event_start||g.kickoff}));}
function nearestPregame(s,now){return scheduleGames(s).map(g=>({...g,kickoff_ms:Date.parse(g.kickoff)})).filter(g=>Number.isFinite(g.kickoff_ms)&&g.kickoff_ms>now).sort((a,b)=>a.kickoff_ms-b.kickoff_ms)[0]||null;}
function elapsedSeconds(ts,now){const x=Date.parse(ts||'');return Number.isFinite(x)?Math.max(0,(now-x)/1000):Infinity;}
function emit(k,v){if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`${k}=${v}\n`);}

function selfTest(){
  const cases=[
    [20160,3600,'14_TO_7_DAYS_PLUS'],
    [10080,3600,'14_TO_7_DAYS_PLUS'],
    [5000,1800,'7_TO_2_DAYS'],
    [2000,900,'48_TO_24_HOURS'],
    [600,600,'24_TO_1_HOUR'],
    [30,300,'FINAL_60_TO_15_MINUTES'],
    [10,300,'FINAL_15_MINUTES']
  ];
  const failed=[];
  for(const [mins,eff,label] of cases){const x=effectiveRefreshSeconds(mins);if(!x||x.effective_seconds!==eff||x.band!==label)failed.push({mins,expected:{eff,label},actual:x});}
  const finalHourTarget=effectiveRefreshSeconds(30);if(finalHourTarget?.target_seconds!==120)failed.push({reason:'final-hour target must remain 120 seconds before scheduler floor'});
  const final15Target=effectiveRefreshSeconds(10);if(final15Target?.target_seconds!==60)failed.push({reason:'final-15 target must remain 60 seconds before scheduler floor'});
  console.log(JSON.stringify({result:failed.length?'BLOCKED':'PASS',cases:cases.length,github_actions_floor_seconds:contract.cadence.github_actions_scheduler_floor_seconds,failed},null,2));
  if(failed.length)process.exit(1);
}

if(process.argv.includes('--self-test'))selfTest();
else {
  const game=nearestPregame(schedule,nowMs);
  if(!game){emit('run','false');emit('reason','NO_FUTURE_VERIFIED_GAME');console.log('No future verified game; market refresh not due.');process.exit(0);}
  const minutes=(game.kickoff_ms-nowMs)/60000;
  const cadence=effectiveRefreshSeconds(minutes);
  if(!cadence)throw new Error('No adaptive cadence band matched');
  const elapsed=elapsedSeconds(status.last_featured_fetch_at,nowMs);
  const run=elapsed>=cadence.effective_seconds;
  emit('run',String(run));emit('band',cadence.band);emit('target_seconds',String(cadence.target_seconds));emit('effective_seconds',String(cadence.effective_seconds));emit('minutes_to_kickoff',String(Math.round(minutes)));
  console.log(JSON.stringify({run,week:schedule.week??null,event_id:game.id,minutes_to_kickoff:Math.round(minutes),band:cadence.band,target_seconds:cadence.target_seconds,effective_seconds:cadence.effective_seconds,last_featured_fetch_at:status.last_featured_fetch_at??null,elapsed_seconds:Number.isFinite(elapsed)?Math.round(elapsed):null},null,2));
}
