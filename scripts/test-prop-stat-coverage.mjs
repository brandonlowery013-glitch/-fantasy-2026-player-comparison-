import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {propStat,propStatKey} from '../lib/show-work.mjs';
import {lineProbabilities} from './lib/distribution-tail-math.mjs';
const spec={status:'SHADOW_ONLY',family:'normal',parameters:{mu:250,sigma:40}};
for(const [market,model] of Object.entries({passing_yards:'pass_yards',passing_tds:'pass_tds',rushing_yards:'rush_yards'})){
 assert.equal(propStatKey(market),model);assert.equal(propStat({[model]:spec},market),spec);
 assert.deepEqual(lineProbabilities(propStat({[model]:spec},market),240.5),lineProbabilities(spec,240.5));
}
assert.equal(propStat({},'passing_yards'),undefined);
assert.equal(propStat({passing_yards:0,pass_yards:100},'passing_yards'),0);
assert.equal(propStatKey('interceptions'),'interceptions');
const code=fs.readFileSync('scripts/build-player-prop-recommendations.mjs','utf8');
const scope=vm.createContext({propStat});vm.runInContext(code.slice(code.indexOf('function weeklySpec('),code.indexOf('function synthetic(')),scope);
const weekly={week:4,distributions:{Player:{distributions:{pass_yards:spec}}}};
assert.equal(scope.weeklySpec(weekly,'Player','passing_yards',4),spec);
assert.equal(scope.weeklySpec(weekly,'Player','passing_yards',3),null);
assert.equal(scope.weeklySpec(weekly,'Unknown','passing_yards',4),null);
const recs=JSON.parse(fs.readFileSync('data/market/player-prop-recommendations-2026.json'));
const distributions=JSON.parse(fs.readFileSync('data/probability/generated/weekly-probability-distributions-2026.json'));
let audited=0;
for(const [name,p] of Object.entries(recs.players))for(const e of p.weekly.evaluations){
 if(Number(e.week)!==Number(distributions.week)||propStatKey(e.stat)===e.stat)continue;
 const d=propStat(distributions.distributions[name]?.distributions,e.stat);assert(d);
 const q=lineProbabilities(d,e.line);for(const side of ['over','under','push'])assert(Math.abs(q[side]-e.model[side+'_probability'])<.000002);
 if(e.eligibility?.eligible_for_pick!==true)assert.notEqual(e.recommendation.decision,'PICK');audited++;
}
assert(audited>0);console.log(`PASS: stat aliases, unknown coverage, week isolation and ${audited} saved passing/rushing evaluations`);
