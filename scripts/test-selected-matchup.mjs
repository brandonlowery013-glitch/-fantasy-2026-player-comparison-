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

const heroSource=fs.readFileSync('frontend/cloudflare/game-dashboard-enhancements.js','utf8');
const hero={innerHTML:'',remove(){this.removed=true;}};
const heroScope=vm.createContext({BET_FEED:{games:[{away_team:'IND',home_team:'WSH',away_score:6,home_score:6},{away_team:'ARI',home_team:'NYG',state:'pre',away_score:0,home_score:0}]},selectedGameIndex:0,document:{getElementById:id=>id==='ctdMatchupHero'?hero:{}},esc:String,logo:String,teamName:String,renderSelectedGame(){},Date});
vm.runInContext(heroSource.slice(heroSource.indexOf('  function gameHero(){'),heroSource.indexOf('  function removeNarrative(){')),heroScope);
heroScope.renderSelectedGame();assert.match(hero.innerHTML,/IND/);assert.match(hero.innerHTML,/6 — 6/);
heroScope.selectedGameIndex=1;heroScope.renderSelectedGame();assert.match(hero.innerHTML,/ARI/);assert.doesNotMatch(hero.innerHTML,/IND|WSH|6 — 6/);assert.match(hero.innerHTML,/>VS</);
heroScope.selectedGameIndex=99;heroScope.renderSelectedGame();assert(hero.removed);
console.log('PASS: header logos and scores switch synchronously; scheduled games show VS and missing selections clear the header');

const html=fs.readFileSync('frontend/cloudflare/index.html','utf8');
const a={event_id:'a',away_team:'PIT',home_team:'CLE'},b={event_id:'b',away_team:'IND',home_team:'WAS'},c={event_id:'c',away_team:'ARI',home_team:'NYG'};
const selection=vm.createContext({BET_FEED:{week:4,games:[a,b,c]},selectedGameIndex:1});
vm.runInContext(html.slice(html.indexOf('let rememberedGame='),html.indexOf('function orderGameFeed(){')),selection);
selection.replaceGameFeed({week:4,games:[{...c},{...a},{...b,home_team:'WSH',event_id:'provider-b'}]});assert.equal(selection.selectedGameIndex,2);
selection.replaceGameFeed({week:4,games:[{...a},{...c}]});assert.equal(selection.selectedGameIndex,-1);
selection.replaceGameFeed({week:4,games:[{...b},{...a},{...c}]});assert.equal(selection.selectedGameIndex,0);
selection.selectedGameIndex=2;selection.replaceGameFeed({week:4,games:[{...c},{...b},{...a}]});assert.equal(selection.selectedGameIndex,0);
assert.equal((html.match(/replaceGameFeed\(\{/g)||[]).length,3);
console.log('PASS: cloned/reordered feeds preserve matchup identity, missing games do not switch teams, return restores selection, and later user choices win');
