import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const schedule=read('data/calibration/weekly-event-schedule-2026.json');
const currentWeek=Number(schedule.week);
const games=Object.values(schedule.games||{});
const output=process.env.GITHUB_OUTPUT||null;
if(!Number.isInteger(currentWeek)||currentWeek<1||currentWeek>18) throw new Error(`Invalid current week ${schedule.week}`);
if(!games.length) throw new Error('No current-week games available for rollover gate');

async function isFinal(g){
  if(!g.event_id) return {final:false,reason:'missing_event_id'};
  const url=`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${encodeURIComponent(g.event_id)}`;
  const r=await fetch(url,{headers:{'user-agent':'fantasy-2026-week-rollover'}});
  if(!r.ok) return {final:false,reason:`http_${r.status}`};
  const j=await r.json();
  const status=j.header?.competitions?.[0]?.status?.type||j.header?.season?.type||null;
  const final=status?.completed===true||String(status?.state||'').toLowerCase()==='post';
  return {final,reason:status?.description||status?.detail||status?.state||'unknown'};
}

const checks=[];
for(const g of games){checks.push({...g,...await isFinal(g)});}
const pending=checks.filter(x=>!x.final);
const ready=pending.length===0&&currentWeek<18;
const nextWeek=ready?currentWeek+1:null;
const report={generated_at:new Date().toISOString(),result:'PASS',current_week:currentWeek,next_week:nextWeek,rollover_ready:ready,total_games:checks.length,final_games:checks.length-pending.length,pending_games:pending.map(x=>({event_id:x.event_id,away_team:x.away_team,home_team:x.home_team,event_start:x.event_start,reason:x.reason}))};
fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});
fs.writeFileSync(path.join(root,'guardrails/week-rollover-readiness-report.json'),JSON.stringify(report,null,2)+'\n');
if(output){fs.appendFileSync(output,`ready=${ready?'true':'false'}\ncurrent_week=${currentWeek}\nnext_week=${nextWeek??''}\n`);}
console.log(JSON.stringify(report,null,2));
