import fs from 'node:fs';
import crypto from 'node:crypto';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
const scoreboard=read('data/weekly/scoreboard-2026.json');
const file='data/history/2026/completed-game-ledger.json';
const ledger=fs.existsSync(file)?read(file):{schema_version:'1.0.0',season:2026,policy:'APPEND_ONLY_OFFICIAL_CORRECTIONS_CREATE_REVISIONS',games:[]};
const forecasts=read('data/calibration/weekly-forecast-capture-2026.json');
const schedule=read('data/calibration/weekly-event-schedule-2026.json');
let added=0;
for(const game of scoreboard.games.filter(g=>g.completed)){
 const url=`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${game.id}`;
 const response=await fetch(url);if(!response.ok)throw Error(response.status);const raw=await response.json();
 if(raw.header?.competitions?.[0]?.status?.type?.completed!==true)throw Error('Final status unverified');
 const result={event_id:game.id,date:game.date,away_team:game.away_team,home_team:game.home_team,away_score:game.away_score,home_score:game.home_score,competitors:raw.header.competitions[0].competitors.map(t=>({team:t.team.abbreviation,homeAway:t.homeAway,score:t.score,linescores:t.linescores})),players:raw.boxscore?.players||[],team_statistics:raw.boxscore?.teams||[]};
 const hash=crypto.createHash('sha256').update(JSON.stringify(stable(result))).digest('hex');
 const previous=ledger.games.filter(g=>g.event_id===game.id);if(previous.at(-1)?.sha256===hash)continue;
 const revision=previous.length+1,path=`data/history/2026/events/${game.id}/revision-${revision}.json`;
 const ids=new Set(Object.entries(schedule.games).filter(([,g])=>String(g.event_id)===String(game.id)).map(([id])=>id));
 const frozen=forecasts.forecasts.filter(f=>ids.has(f.game_id)&&f.frozen&&Date.parse(f.captured_at)<Date.parse(f.event_start));
 fs.mkdirSync(path.slice(0,path.lastIndexOf('/')),{recursive:true});fs.writeFileSync(path,JSON.stringify({source:url,retrieved_at:new Date().toISOString(),sha256:hash,result},null,2)+'\n');
 ledger.games.push({event_id:game.id,revision,path,sha256:hash,verified_final:true,forecast_ids:frozen.map(f=>f.forecast_id),calibration_status:frozen.length?'READY_TO_SETTLE':'NO_PREGAME_FORECAST_RECORDED'});added++;
}
fs.mkdirSync('data/history/2026',{recursive:true});fs.writeFileSync(file,JSON.stringify(ledger,null,2)+'\n');console.log(JSON.stringify({added,total_revisions:ledger.games.length}));
