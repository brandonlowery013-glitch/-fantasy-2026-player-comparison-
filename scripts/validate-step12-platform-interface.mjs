import fs from 'node:fs';

const index = fs.readFileSync('index.html','utf8');
const compare = fs.readFileSync('compare.html','utf8');
const fail = msg => { console.error(`FAIL: ${msg}`); process.exitCode = 1; };
const pass = msg => console.log(`PASS: ${msg}`);
const requireText = (text, needle, label) => text.includes(needle) ? pass(label) : fail(label);

requireText(index,'data-view="board"','Player Board is first-class navigation');
requireText(index,'data-view="profile"','Player Profile is first-class navigation');
requireText(index,'data-view="compare"','Compare is first-class navigation');
requireText(index,'data-view="weekly"','Weekly is first-class navigation');
requireText(index,'data-view="props"','Props is first-class navigation');
requireText(index,'data-view="games"','NFL Games is first-class navigation');
requireText(index,'src="compare.html"','Existing comparison engine is isolated behind dedicated module');
requireText(index,'P.length!==162','162-player universe remains a hard UI load guard');
requireText(index,'Market information is displayed after the model projection. It does not change the underlying football forecast.','Market layer is explicitly downstream of football projection');
requireText(index,"data/calibration/weekly-forecast-capture-2026.json",'Weekly view consumes frozen forecast ledger');
requireText(index,"data/calibration/weekly-event-schedule-2026.json",'Games view consumes weekly schedule ledger');
requireText(index,"vegasOdds2026.json",'Props view consumes stored player market layer');
requireText(compare,'runtime-comparison-decision-2026.js','Dedicated compare module preserves production comparison runtime');
requireText(compare,'b6b965159ffbb0c027c26b9467c7586171e97c64/index.html','Dedicated compare module preserves locked stable comparison base');

if (/Player \d+/.test(index)) fail('Rank-style labels must not be attached to player names'); else pass('No rank labels attached to player names');
if (/projection_override|core_rank_override/.test(index)) fail('UI must not introduce model/market core overrides'); else pass('UI introduces no core projection/rank market override');

if (!process.exitCode) console.log('Step 12 platform interface architecture QA passed.');
