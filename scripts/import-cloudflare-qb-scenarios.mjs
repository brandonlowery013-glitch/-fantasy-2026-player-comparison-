import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
export function validatedQuarterbackSnapshot(feed,schedule,now=Date.now()){
 if(feed.simulation||feed.collection_event!=='cloudflare-cron'||feed.sportsbook_inputs_used!==false||feed.model_version!=='qb-receiver-effects-2026-v1')throw Error('Only real scheduled football-only QB scenarios may be imported');
 const age=now-Date.parse(feed.checked_at);if(!Number.isFinite(age)||age<0||age>30*60000||feed.health?.status==='STALE')throw Error('Fresh background QB scenarios are required');
 if(Number(feed.week)!==Number(schedule.week)||feed.season!==2026||!/^[a-f0-9]{64}$/.test(feed.revision_id||''))throw Error('QB scenario identity/week mismatch');
 for(const s of Object.values(feed.scenarios||{})){
  const g=schedule.games?.[s.game_id];if(!g||String(g.event_id)!==String(s.event_id)||Date.parse(g.event_start)!==Date.parse(s.kickoff)||![g.home_team,g.away_team].includes(s.team))throw Error('QB scenario does not match the verified event');
  if(s.status==='BACKUP_EXPECTED'&&(!s.starter||!s.expected_qb||!s.report?.out))throw Error('Replacement scenario lacks a reported unavailable starter');
 }
 return {schema_version:1,season:2026,week:feed.week,revision_id:feed.revision_id,observed_at:feed.changed_at||feed.checked_at,model_version:feed.model_version,source:'Cloudflare Cron Trigger',sportsbook_inputs_used:false,scenarios:feed.scenarios};
}
async function main(){
 const schedule=JSON.parse(fs.readFileSync('data/calibration/weekly-event-schedule-2026.json'));
 const response=await fetch('https://ctd-background-splits.brandonlowery013.workers.dev/quarterbacks/latest.json',{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Background QB HTTP '+response.status);
 const snapshot=validatedQuarterbackSnapshot(await response.json(),schedule),file='data/ingestion/current-quarterback-scenarios-2026.json';
 const previous=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null,changed=previous?.revision_id!==snapshot.revision_id;
 if(changed){fs.mkdirSync('data/ingestion',{recursive:true});fs.writeFileSync(file,JSON.stringify(snapshot,null,2)+'\n');}
 console.log(JSON.stringify({result:'PASS',source:snapshot.source,week:snapshot.week,revision_id:snapshot.revision_id,changed,backup_teams:Object.values(snapshot.scenarios).filter(s=>s.status==='BACKUP_EXPECTED').map(s=>s.team),paid_provider_requests:0}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
