import fs from 'node:fs';

const shell=fs.readFileSync('index.html','utf8');
const ui=fs.readFileSync('runtime-player-board-profile-step4.js','utf8');
const fail=m=>{throw new Error(m)};
const need=(s,x,m)=>{if(!s.includes(x))fail(m)};

need(shell,'82e47f6b53599bff2e47fd868b8f58daf52ef0ca/index.html','Step 4 must pin the fully merged Step 3 shell');
need(shell,'runtime-player-board-profile-step4.js','Step 4 runtime must load');
need(ui,"const POSITIONS=['QB','RB','WR','TE']",'Position groups missing');
need(ui,'lastKey(a.n).localeCompare(lastKey(b.n))','Players must remain alphabetical by last name inside position');
need(ui,'data-position-group','Position section marker missing');
need(ui,"metricHtml('Player Quality'",'Player Quality presentation missing');
need(ui,"metricHtml('Draft Rank'",'Draft Rank presentation missing');
need(ui,"metricHtml('Market ADP'",'Market ADP presentation missing');
need(ui,'Draft price does not determine Player Quality.','Player Quality vs price explanation missing');
need(ui,'football-only','Player Quality football-only explanation missing');
need(ui,'price context only','Sportsbook context separation missing');
need(ui,"dataset.uiStep4='player-board-profile'",'Step 4 DOM marker missing');
need(ui,'@media(max-width:520px)','Mobile layout fallback missing');

for(const forbidden of [
  'p.pd*.35',
  '0.35*clamp',
  'americanProb(',
  'Math.round(p.ad-p.o)',
  'P.push(',
  'P.splice(',
  'Object.assign(p,'
]) if(ui.includes(forbidden)) fail(`Step 4 presentation layer contains forbidden model/data mutation logic: ${forbidden}`);

console.log('UI Step 4 player board/profile QA PASS');