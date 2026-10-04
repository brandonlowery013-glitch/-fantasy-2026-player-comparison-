import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const context={window:{},Map,Date,Promise,fetch:()=>{throw Error('No network in source-selection test')}};vm.runInNewContext(fs.readFileSync('frontend/cloudflare/game-model-source.js','utf8'),context);
const select=context.window.CTD_GAME_MODEL.select;
const r=JSON.parse(fs.readFileSync('frontend/cloudflare/all-game-model-rerun-2026.json'));const p=JSON.parse(fs.readFileSync('frontend/cloudflare/all-game-rerun-projections-2026.json'));
const original={season:r.season,week:r.week,games:Object.fromEntries(Object.keys(r.games).map(k=>[k,{}]))};
assert.equal(select(original,r),r);assert.equal(select({...original,week:r.week+1},r).week,r.week+1);assert.equal(select(original,null),original);assert.equal(select(original,{...r,games:{}}),original);
assert.equal(Object.keys(r.games).length,16);
for(const [id,g]of Object.entries(r.games)){assert.equal(g.football_projection.model_total,p.games[id].model.model_total);for(const kind of ['spread','total','moneyline'])assert.deepEqual(g.current_recommendations[kind],g.snapshot_evaluations[0].markets[kind]?.recommendation);}
for(const f of ['index.html','game-detail-panels.js','restore-lock1.js'])assert.ok(fs.readFileSync('frontend/cloudflare/'+f,'utf8').includes('CTD_GAME_MODEL.load'));
console.log('PASS: all 16 game sources share rerun output; missing/incomplete/wrong-week reruns cannot replace current data.');
