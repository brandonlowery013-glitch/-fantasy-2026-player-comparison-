import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {canon,parseCSV} from '../lib/game-scoring-calibration.mjs';
import {parseCompletedWeek,scoreCurrentGame} from '../lib/current-game-scoring.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const modelPath='data/probability/generated/game-scoring-model-2026.json';
const artifact=read(modelPath),schedule=read('data/calibration/weekly-event-schedule-2026.json'),validation=read(artifact.validation_path);
if(artifact.status!=='VALIDATED_SHADOW_CANDIDATE'||validation.gates.scoring_vs_deployed!==true)throw Error('Scoring validation gate not passed');
if(schedule.season!==2026||!Number.isInteger(schedule.week)||schedule.week<1||schedule.week>18||schedule.sportsbook_inputs_used!==false)throw Error('Invalid verified schedule');
async function fetchText(url) {const r=await fetch(url,{headers:{'user-agent':'fantasy-2026-scoring-refresh'},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`${url}: ${r.status}`);return r.text();}
const completed=[],sources=[];
for(let week=1;week<schedule.week;week++) {
  const url=`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=2026&seasontype=2&week=${week}`;
  const text=await fetchText(url);completed.push(...parseCompletedWeek(JSON.parse(text),week));
  sources.push({url,sha256:createHash('sha256').update(text).digest('hex')});
}
const restUrl='https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv';
const restText=await fetchText(restUrl);
// Discard every market and target-result field immediately.
const restRows=parseCSV(restText).filter(r=>+r.season===2026&&+r.week===schedule.week&&r.game_type==='REG')
  .map(r=>({home:canon(r.home_team),away:canon(r.away_team),home_rest:r.home_rest===''?null:Number(r.home_rest),away_rest:r.away_rest===''?null:Number(r.away_rest),date:r.gameday}));
sources.push({url:restUrl,sha256:createHash('sha256').update(restText).digest('hex')});
const games={};
for(const [id,g] of Object.entries(schedule.games||{})) {
  if(g.verified!==true||g.week!==schedule.week)throw Error(`Unverified game ${id}`);
  const matches=restRows.filter(r=>r.home===canon(g.home_team)&&r.away===canon(g.away_team));
  if(matches.length!==1)throw Error(`Missing or duplicate rest schedule ${id}`);
  // NFL schedule dates use the local game day, whereas ESPN kickoff is UTC.
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(g.event_start));
  if(matches[0].date!==day)throw Error(`Rest schedule date mismatch ${id}`);
  games[id]={home_team:g.home_team,away_team:g.away_team,event_start:g.event_start,...scoreCurrentGame(artifact,g,completed,{home:matches[0].home_rest,away:matches[0].away_rest})};
}
if(!Object.keys(games).length)throw Error('No verified games');
const output={schema_version:1,season:2026,week:schedule.week,status:'READY',mode:'SHADOW_ONLY',actionable:false,sportsbook_inputs_used:false,
  generated_at:new Date().toISOString(),model_version:artifact.model_version,artifact_sha256:createHash('sha256').update(fs.readFileSync(modelPath)).digest('hex'),
  sources,completed_games:completed.length,games};
fs.writeFileSync('data/probability/generated/current-game-scoring-2026.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({result:'PASS',week:schedule.week,game_count:Object.keys(games).length,completed_games:completed.length,model_version:artifact.model_version}));
