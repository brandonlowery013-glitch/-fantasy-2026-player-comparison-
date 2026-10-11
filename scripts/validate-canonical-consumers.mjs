import fs from 'node:fs';
import assert from 'node:assert/strict';
import {loadCanonicalPlayers} from '../lib/canonical-player-source.mjs';
import {buildWordExport} from '../lib/canonical-word-export.mjs';
import {buildExcelExport} from '../lib/canonical-excel-export.mjs';
const {truth,players}=await loadCanonicalPlayers(p=>JSON.parse(fs.readFileSync(p)));
const weeklyPath='data/weekly/in-season-ranking-layer-2026.json';const weekly=fs.existsSync(weeklyPath)?JSON.parse(fs.readFileSync(weeklyPath)):null;
const bytes=Buffer.from(buildExcelExport(players,truth,weekly));
if(process.argv.includes('--write-excel')||process.argv.includes('--write-exports')){fs.mkdirSync('exports',{recursive:true});fs.writeFileSync('exports/fantasy-2026-current.xlsx',bytes);}
assert.deepEqual(fs.readFileSync('exports/fantasy-2026-current.xlsx'),bytes,'Excel export differs from canonical rows');
const word=Buffer.from(buildWordExport(players,truth,weekly));
if(process.argv.includes('--write-exports')){fs.mkdirSync('exports',{recursive:true});fs.writeFileSync('exports/fantasy-2026-current.xlsx',bytes);fs.writeFileSync('exports/fantasy-2026-current.docx',word);}
assert.ok(fs.existsSync('exports/fantasy-2026-current.docx'),'Word export missing');
assert.deepEqual(fs.readFileSync('exports/fantasy-2026-current.docx'),word,'Word export differs from canonical rows');
const boards=JSON.parse(fs.readFileSync('canonicalBoards2026.json'));
const locks=JSON.parse(fs.readFileSync('lockedRanks2026.json'));
for(const key of ['overall','trueValue']){
  assert.equal(boards[key].length,players.length,`${key} board count mismatch`);
  for(const p of players){const row=boards[key].find(x=>x.n===p.n);assert.ok(row,`Missing ${p.n} in ${key}`);for(const k of ['o','tr','pr','tp','s','pd','ce','r','e','a','rl','su','mp'])assert.equal(row[k],p[k],`${key} ${p.n}.${k} mismatch`);}
}
assert.equal(Object.values(boards.positions).flat().length,players.length,'Positional board coverage mismatch');
assert.equal(Object.keys(locks.players).length,players.length,'Locked rank coverage mismatch');
for(const p of players){assert.equal(locks.players[p.n]?.trueValueRank,p.tr,`Locked rank mismatch ${p.n}`);assert.equal(locks.players[p.n]?.trueValuePos,p.tp,`Locked position mismatch ${p.n}`);}
const html=fs.readFileSync('index.html','utf8');
for(const source of ['./lib/canonical-player-source.mjs','./lib/canonical-excel-export.mjs','./lib/canonical-word-export.mjs'])assert.ok(html.includes(source),`Missing consumer ${source}`);
console.log(JSON.stringify({result:'PASS',players:players.length,shards:truth.runtime_player_shards,excel_sheets:2,excel_rows_per_sheet:players.length,word_profiles:players.length,site_source:'same-origin dynamic canonical shards plus patch'}));
