import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const encoding='CTD_ISSUED_RESULTS_GZIP_BASE64_V1';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function valid(ledger){return ledger?.schema_version==='1.0.0'&&Array.isArray(ledger.settlements)&&ledger.events&&typeof ledger.events==='object';}
export function encodeIssuedResults(ledger){
 if(!valid(ledger))throw Error('Invalid issued results');
 const bytes=Buffer.from(JSON.stringify(ledger));
 return {encoding,settlement_count:ledger.settlements.length,uncompressed_sha256:digest(bytes),data:gzipSync(bytes,{level:9}).toString('base64')};
}
export function decodeIssuedResults(stored){
 if(!stored?.encoding)return stored;
 if(stored.encoding!==encoding)throw Error('Unsupported issued results encoding');
 const bytes=gunzipSync(Buffer.from(stored.data,'base64'),{maxOutputLength:512*1024*1024});
 if(digest(bytes)!==stored.uncompressed_sha256)throw Error('Issued results integrity mismatch');
 const ledger=JSON.parse(bytes.toString('utf8'));
 if(!valid(ledger)||ledger.settlements.length!==stored.settlement_count)throw Error('Issued results count/schema mismatch');
 return ledger;
}
