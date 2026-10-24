import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const dir=new URL('../frontend/cloudflare/',import.meta.url);
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(new URL('show-work.js',dir),'utf8'),ctx);
const ui=ctx.CTD_SHOW_WORK;
const game={home_team:'CHI',away_team:'NE',football_projection:{home_win_probability:.99,away_win_probability:.01,home_score_mean:99,away_score_mean:0}};
for(const [kind,version] of [['moneyline','football-sportsbook-learning-v1'],['spread','sportsbook-calibration-learning-v1']]){
 const evaluation={model_version:version,side_a:{conditional_win_probability:.63},side_b:{conditional_win_probability:.37},recommendation:{decision:'PICK'}};
 const quote={market:{home_spread:-3},markets:{[kind]:evaluation}};
 assert.equal(ui.gameDirectionPrediction(game,quote,kind).probability,.63);
 assert.match(ui.gameDirectionPrediction(game,quote,kind).selection,/CHI/);
 const old=structuredClone(quote);old.markets[kind].model_version='legacy';
 assert.equal(ui.gameDirectionPrediction(game,old,kind).selection,null);
 assert.equal(ui.gameDirectionPrediction(game,null,kind).selection,null);
 assert(!JSON.stringify(ui.gameWork(game,quote,kind)).includes('99'));
}
for(const file of ['restore-lock1.js','show-work.js','game-detail-panels.js'])assert(!/PROJECTED SCORE|Projected score:|Model score:|Our projected spread:/.test(fs.readFileSync(new URL(file,dir),'utf8')),file);
console.log('Selected model probabilities retained; old probabilities, score displays and missing-model fallbacks blocked.');
