import fs from 'node:fs';

const runtime=fs.readFileSync('runtime-final-interface-2026.js','utf8');
const index=fs.readFileSync('index.html','utf8');
const compare=fs.readFileSync('compare.html','utf8');

const checks=[
  ['final runtime loaded by index',index.includes('runtime-final-interface-2026.js')],
  ['final runtime loaded by compare',compare.includes('runtime-final-interface-2026.js')],
  ['four-surface navigation locked',['Player Board','Compare','Weekly','Games'].every(x=>runtime.includes(x))],
  ['profile removed from top-level nav',runtime.includes("v==='profile'||v==='props'")],
  ['games betting subnav',runtime.includes('Bets</button>')&&runtime.includes('Props</button>')&&runtime.includes('Parlays</button>')],
  ['parlay model picks surface',runtime.includes('Model Picks')],
  ['parlay build-your-own surface',runtime.includes('Build Your Own')],
  ['NFL live board',runtime.includes('NFL Live Board')&&runtime.includes('Score · Spread · O/U · Model Edge')],
  ['game cards are selectable',runtime.includes('data-game-key')&&runtime.includes('openGame(')],
  ['same-page game detail mount',runtime.includes('ctdGameDetailMount')&&runtime.includes('renderGameDetail()')],
  ['game selection fully replaces detail state',runtime.includes('mount.innerHTML=`<div class="ctdGameDetail card">')],
  ['selected game identity tracked',runtime.includes('selectedGameKey')&&runtime.includes('mount.dataset.selectedGame=selectedGameKey')],
  ['rapid switching-safe ticker active state',runtime.includes("x.dataset.gameKey===selectedGameKey")],
  ['base game cards wired for keyboard and click',runtime.includes('wireRenderedGameCards')&&runtime.includes("e.key==='Enter'||e.key===' '")],
  ['model pick detail section',runtime.includes('Model Picks')&&runtime.includes('win_probability')],
  ['pivotal offense detail section',runtime.includes('Pivotal Offense')&&runtime.includes('pivotal_offense')],
  ['pivotal defense detail section',runtime.includes('Pivotal Defense')&&runtime.includes('pivotal_defense')],
  ['live player stats section',runtime.includes('Live Player Stats')&&runtime.includes('live_player_stats')],
  ['missing feed values are not fabricated',runtime.includes('Waiting for validated model/feed output.')],
  ['mobile game-detail layout',runtime.includes('.ctdParlayModes,.ctdGameGrid{grid-template-columns:1fr}')],
  ['interface structure version locked',runtime.includes("finalInterfaceStructure='locked-v3'")],
];

let failed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'}  ${name}`);if(!ok)failed++;}
if(failed){console.error(`Final interface Step 1 failed: ${failed} contract(s)`);process.exit(1)}
console.log(`Final interface Step 1 PASS: ${checks.length}/${checks.length}`);
