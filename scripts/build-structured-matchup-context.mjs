import fs from 'node:fs';import {createHash} from 'node:crypto';
import {parseCSV} from '../lib/game-scoring-calibration.mjs';import {buildStructuredContext} from '../lib/structured-matchup-context.mjs';
const schedule=JSON.parse(fs.readFileSync('data/calibration/weekly-event-schedule-2026.json'));
const paths=['stats_team_week_2026.csv','stats_player_week_2026.csv'];const inputs=paths.map(n=>fs.readFileSync('.cache/matchup-context/'+n,'utf8'));
const context=buildStructuredContext(...inputs.map(parseCSV),{season:schedule.season,week:schedule.week,captured_at:new Date().toISOString(),source:'nflverse weekly team and player statistics'});
context.matchups=Object.values(schedule.games);
context.sources=paths.map((p,i)=>({url:`https://github.com/nflverse/nflverse-data/releases/download/${i?'stats_player':'stats_team'}/${p}`,sha256:createHash('sha256').update(inputs[i]).digest('hex')}));
fs.writeFileSync('data/probability/generated/structured-matchup-context-2026.json',JSON.stringify(context,null,2)+'\n');
console.log({teams:Object.keys(context.teams).length,players:Object.keys(context.players).length,week:context.week});
