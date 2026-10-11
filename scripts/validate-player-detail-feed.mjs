import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const truth=read('MODEL_SOURCE_OF_TRUTH.json'),feed=read('data/weekly/player-detail-feed-2026.json'),ranks=read('data/weekly/in-season-ranking-layer-2026.json');
const names=Array.from({length:truth.runtime_player_shards},(_,i)=>read('players'+i+'.json')).flat().map(p=>p.n);
assert.equal(feed.universe,truth.active_player_model);assert.equal(feed.week,ranks.week);assert.equal(Object.keys(feed.players).length,names.length);
for(const name of names){const p=feed.players[name];assert.ok(p,name);assert.equal(p.name,name);assert.ok(p.injury);assert.ok(Array.isArray(p.news));assert.equal(p.injury.questionable_numeric_effect,0);assert.equal(p.adp,undefined);
 const row=ranks.players[name];assert.equal(p.weekly_overall_rank,row.weekly_overall_rank);
 if(p.injury.expected_absence){assert.equal(row.weekly_overall_rank,null);assert.equal(row.weekly_score,null);assert.equal(row.weekly_actionable,false);}
 if(p.injury.tag==='Q')assert.ok(!row.weekly_matchup_context.components.some(c=>c.signal==='injury'),'Questionable numeric rank adjustment: '+name);
 for(const n of p.news){assert.ok(Number.isFinite(Date.parse(n.published_at)));assert.ok(Date.parse(n.published_at)<=Date.now());assert.ok(/^https?:\/\//.test(n.url));}
}
for(const [name,p]of Object.entries(feed.roster_players||{})){assert.equal(p.name,name);assert.equal(p.modelled,false);assert.equal(p.ros_overall_rank,null);assert.equal(p.season_projected_ppr,null);for(const n of p.news){assert.ok(Number.isFinite(Date.parse(n.published_at)));assert.ok(Date.parse(n.published_at)<=Date.now());assert.ok(/^https?:\/\//.test(n.url));}}
console.log(JSON.stringify({result:'PASS',canonical_profiles:names.length,additional_roster_profiles:Object.keys(feed.roster_players||{}).length,universal:true,questionable_numeric_penalty:0}));
