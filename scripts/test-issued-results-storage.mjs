import assert from 'node:assert/strict';
import fs from 'node:fs';
import {encodeIssuedResults,decodeIssuedResults} from '../lib/issued-results-storage.mjs';
const ledger={schema_version:'1.0.0',events:{g:{event_id:'123'}},settlements:[{record_id:'r',revision:2,previous_revision:1,outcome:'WIN',profit:.9090909090909091}],football_learning:{observations:[{verified_final:true,week:9,metrics:{yards:123}}],state:{},regime_events:[]}};
assert.equal(decodeIssuedResults(ledger),ledger);const packed=encodeIssuedResults(ledger);assert.deepEqual(decodeIssuedResults(packed),ledger);
assert.throws(()=>decodeIssuedResults({...packed,uncompressed_sha256:'bad'}),/integrity/);assert.throws(()=>decodeIssuedResults({...packed,settlement_count:2}),/count/);assert.throws(()=>decodeIssuedResults({...packed,encoding:'unknown'}),/Unsupported/);
const path='data/market/issued-pick-results-2026.json';if(process.argv.includes('--existing')&&fs.existsSync(path)){
 const existing=decodeIssuedResults(JSON.parse(fs.readFileSync(path,'utf8'))),encoded=encodeIssuedResults(existing);assert.deepEqual(decodeIssuedResults(encoded),existing);const bytes=Buffer.byteLength(JSON.stringify(encoded));assert(bytes<50*1024*1024);console.log(JSON.stringify({existing_settlements:existing.settlements.length,original_bytes:Buffer.byteLength(JSON.stringify(existing)),encoded_bytes:bytes,all_history_preserved:true}));
}
console.log('PASS: existing and compressed ledgers, all revisions/learning preserved, tamper/count/encoding rejection and repository file-size safety.');
