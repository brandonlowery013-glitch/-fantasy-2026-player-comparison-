import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {parseCSV} from '../lib/game-scoring-calibration.mjs';
import {quarterbackReplacementContext} from '../lib/quarterback-replacement-context.mjs';
const root='.cache/matchup-context/';
const files=['players.csv','games.csv',...Array.from({length:7},(_,i)=>`stats_player_week_${2020+i}.csv`),'stats_team_week_2026.csv'];
const read=f=>parseCSV(fs.readFileSync(root+f,'utf8'));
const common={season:2026,week:4,players:read('players.csv'),games:read('games.csv'),stats:files.filter(f=>f.startsWith('stats_player')).flatMap(read),teamStats:read('stats_team_week_2026.csv')};
const profiles=[['Jalon Daniels','TB','GB'],['Baker Mayfield','TB','GB'],['Jordan Love','GB','TB'],['Tyson Bagent','CHI','NYJ'],['Case Keenum','CHI','NYJ']].map(([name,team,opponent])=>{
 const player=common.players.find(p=>p.display_name===name);if(!player)throw new Error(`Missing ${name}`);
 return quarterbackReplacementContext({...common,playerId:player.gsis_id,team,opponent});
});
const report={status:'RESEARCH_ONLY',production_probability_changed:false,profiles,sources:files.map(file=>({file,sha256:createHash('sha256').update(fs.readFileSync(root+file)).digest('hex')}))};
fs.writeFileSync('data/probability/generated/quarterback-replacement-review-2026.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(profiles.map(p=>({name:p.name,starts:p.observed_starts,complete:p.starts_history_complete,attempts:p.prior_nfl.attempts,epa:p.prior_nfl.passing_epa_per_dropback,same_team_attempts:p.same_team.attempts})),null,2));
