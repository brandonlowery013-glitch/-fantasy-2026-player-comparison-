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

const source=fs.readFileSync(new URL('game-model-source.js',dir),'utf8');
assert(!/overlaySpreadFeed|overlayMoneylineFeed|weekly-game-market-recommendations/.test(source));
const requests=[];const base={week:9,season:2026,games:{x:{snapshot_evaluations:[{eligible_for_current_recommendation:true,markets:{spread:{model_version:'legacy',side_a:{conditional_win_probability:.99}},moneyline:{model_version:'football-sportsbook-learning-v1',side_a:{conditional_win_probability:.61}}}}]}}};
const browser={window:{},Date,Map,URLSearchParams,AbortSignal,fetch:async url=>{requests.push(url);return {ok:true,json:async()=>url.includes('/release')?{ref:'refs/heads/main',object:{type:'commit',sha:'a'.repeat(40)}}:url.includes('recommendations')?structuredClone(base):null}}};
vm.createContext(browser);vm.runInContext(source.replace("import('./lib/personnel-matchup.mjs')","Promise.resolve({overlayGameFeed:base=>base})"),browser);
const loaded=await browser.window.CTD_GAME_MODEL.load();
assert.equal(loaded.games.x.snapshot_evaluations[0].markets.spread.side_a,undefined);
assert.equal(loaded.games.x.snapshot_evaluations[0].markets.moneyline.side_a.conditional_win_probability,.61);
assert(!requests.some(x=>x.includes('raw.githubusercontent.com')||x.includes('all-game')));
console.log('Future-week server predictions preserved; unselected inputs blocked without raw/research fallback.');
