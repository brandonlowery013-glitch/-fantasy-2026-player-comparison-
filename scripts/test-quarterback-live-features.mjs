import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseCSV} from '../lib/game-scoring-calibration.mjs';
import {quarterbackLiveFeatures as features} from '../lib/quarterback-live-features.mjs';
const read=f=>parseCSV(fs.readFileSync('.cache/matchup-context/'+f,'utf8'));
const model=JSON.parse(fs.readFileSync('data/probability/generated/quarterback-score-model-2026.json'));
const expected=JSON.parse(fs.readFileSync('data/probability/generated/quarterback-score-scenario-features-2026.json'));
const common={game:{id:expected.game_id,season:2026,week:4,home_team:'TB',away_team:'GB'},awayQb:'00-0036264',players:read('players.csv'),schedule:read('games.csv'),stats:Array.from({length:7},(_,i)=>read(`stats_player_week_${2020+i}.csv`)).flat(),teamStats:Array.from({length:7},(_,i)=>read(`stats_team_week_${2020+i}.csv`)).flat(),model};
for(const scenario of expected.scenarios){
 const result=features({...common,homeQb:scenario.player_id});
 for(const key of ['margin_features','total_features'])result[key].forEach((v,i)=>assert.ok(Math.abs(v-scenario[key][i])<1e-9,`${key} ${i}`));
}
assert.throws(()=>features({...common,homeQb:'unknown'}));
assert.throws(()=>features({...common,homeQb:'00-0041251',teamStats:[]}));
const poisoned=common.schedule.map(g=>g.game_id===expected.game_id?{...g,home_score:'99',away_score:'0'}:g);
assert.deepEqual(features({...common,homeQb:'00-0041251',schedule:poisoned}),features({...common,homeQb:'00-0041251'}));
console.log('PASS: live-generated features reproduce both fitted QB scenarios; missing coverage and target-game leakage rejected.');
