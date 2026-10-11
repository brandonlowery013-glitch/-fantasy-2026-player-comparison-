import assert from 'node:assert/strict';
import '../runtime-league-csv-2026.js';
const {parse}=globalThis.CTD_LEAGUE_CSV;
const csv='Pick Detail,Brandon,Biasco\r\nOdds,-185,\r\nResult,Pending,Pending\r\nNotes,"Quote, with comma and ""quotes""\nand newline",\r\nPicks Entered,0,\r\n';
const rows=parse(csv);
assert.equal(rows[0][1],'Brandon');assert.equal(rows[1][1],'-185');assert.equal(rows[4][1],'0');assert.equal(rows[3][1],'Quote, with comma and "quotes"\nand newline');assert.equal(rows[3][2],'');
assert.throws(()=>parse('"unfinished'));
console.log('PASS: manager names, mixed numeric/text cells, blanks, quotes and multiline notes preserved');
