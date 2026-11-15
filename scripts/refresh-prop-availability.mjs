import fs from 'node:fs';
import {parseTeamPersonnel} from '../lib/team-personnel.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const fetchJson=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Availability source HTTP '+r.status);return r.json();};
const schedule=read('data/calibration/weekly-event-schedule-2026.json'),personnel=read('data/ingestion/team-personnel-2026.json');
const target='data/ingestion/prop-availability-2026.json';
let prior;try{prior=read(target);}catch{}
const unavailable=reason=>{if(!prior)fs.writeFileSync(target,JSON.stringify({week:Number(schedule.week),status:'UNAVAILABLE',observed_at:null,games:[],injuries:[],rosters:{},reason})+'\n');console.log(JSON.stringify({status:'UNAVAILABLE',reason}));};
let feed;try{feed=await fetchJson('https://ctd-background-splits.brandonlowery013.workers.dev/availability/latest.json');}catch(e){unavailable(e.message);process.exit(0);}
const now=Date.now(),age=now-Date.parse(feed.observed_at);
if(Number(feed.week)!==Number(schedule.week)||!Number.isFinite(age)||age< -300000||age>30*60000){unavailable('STALE_OR_WRONG_WEEK');process.exit(0);}
const rosters={...(prior?.week===feed.week?prior.rosters:{})},errors=[];
const teams=[...new Set(Object.values(schedule.games).filter(g=>Date.parse(g.event_start)>now&&Date.parse(g.event_start)-now<=2*3600000).flatMap(g=>[g.home_team,g.away_team]))];
await Promise.all(teams.map(async team=>{
 const old=rosters[team];if(old&&now-Date.parse(old.captured_at)<30*60000)return;
 const url=personnel.teams?.[team]?.source_url;if(!url){errors.push(team+': missing roster source');return;}
 try{const captured_at=new Date().toISOString();rosters[team]=parseTeamPersonnel(await fetchJson(url),team,[],[],captured_at,url);}catch(e){errors.push(team+': '+e.message);}
}));
fs.writeFileSync(target,JSON.stringify({...feed,rosters,roster_errors:errors},null,2)+'\n');
console.log(JSON.stringify({status:errors.length?'PARTIAL':'CURRENT',week:feed.week,official_reports:feed.games?.length,refreshed_teams:teams,errors,paid_provider_requests:0}));
