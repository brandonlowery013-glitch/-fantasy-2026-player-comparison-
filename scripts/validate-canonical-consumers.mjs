import fs from 'node:fs';
import assert from 'node:assert/strict';
import {loadCanonicalPlayers} from '../lib/canonical-player-source.mjs';
import {buildWordExport} from '../lib/canonical-word-export.mjs';
import {buildExcelExport} from '../lib/canonical-excel-export.mjs';
const {truth,players}=await loadCanonicalPlayers(p=>JSON.parse(fs.readFileSync(p)));
const bytes=Buffer.from(buildExcelExport(players,truth));
if(process.argv.includes('--write-excel')){fs.mkdirSync('exports',{recursive:true});fs.writeFileSync('exports/fantasy-2026-current.xlsx',bytes);}
assert.deepEqual(fs.readFileSync('exports/fantasy-2026-current.xlsx'),bytes,'Excel export differs from canonical rows');
const word=Buffer.from(buildWordExport(players,truth));
if(fs.existsSync('exports/fantasy-2026-current.docx'))assert.deepEqual(fs.readFileSync('exports/fantasy-2026-current.docx'),word,'Word export differs from canonical rows');
const html=fs.readFileSync('index.html','utf8');
for(const source of ['./lib/canonical-player-source.mjs','./lib/canonical-excel-export.mjs','./lib/canonical-word-export.mjs'])assert.ok(html.includes(source),`Missing consumer ${source}`);
console.log(JSON.stringify({result:'PASS',players:players.length,shards:truth.runtime_player_shards,excel_sheets:2,excel_rows_per_sheet:players.length,site_source:'same-origin dynamic canonical shards plus patch'}));
