import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const code=fs.readFileSync('frontend/cloudflare/restore-lock1.js','utf8');
const nodes=new Map();for(const id of ['ctdScoreComparison','ctdMarketContext','awayProb','homeProb','#awayProb + span','#homeProb + span','.implied','.lowgrid .panel:nth-child(1)','.lowgrid .panel:nth-child(2)'])nodes.set(id,{textContent:'PIT CLE',innerHTML:'old market',remove(){this.removed=true;}});
const context=vm.createContext({document:{getElementById:id=>nodes.get(id),querySelector:id=>nodes.get(id)}});
vm.runInContext(code.slice(code.indexOf('  const teamKey='),code.indexOf('  const e=x=>',code.indexOf('  const teamKey='))),context);
const sameMatchup=vm.runInContext("sameMatchup",context);
assert(sameMatchup({away_team:'IND',home_team:'WAS'},{away_team:'IND',home_team:'WSH'}));
assert(sameMatchup({away_team:'LA',home_team:'PHI'},{away_team:'LAR',home_team:'PHI'}));
assert(!sameMatchup({away_team:'PIT',home_team:'CLE'},{away_team:'IND',home_team:'WSH'}));
for(const g of [{away_team:'PIT',home_team:'CLE'},{away_team:'IND',home_team:'WSH'},{away_team:'ARI',home_team:'NYG'}]){
 context.clearMarketDetail(g);assert.equal(nodes.get('#awayProb + span').textContent,g.away_team);assert.equal(nodes.get('#homeProb + span').textContent,g.home_team);assert.equal(nodes.get('awayProb').textContent,'—');assert(nodes.get('ctdMarketContext').removed);assert(!nodes.get('.lowgrid .panel:nth-child(1)').innerHTML.includes('old market'));
}
assert.match(code,/clearMarketDetail\(g\);if\(!g\|\|!feed/);
assert.equal((code.match(/version!==requestVersion/g)||[]).length,2);
console.log('PASS: team aliases, selected-team labels, stale market clearing and outdated response guards');
