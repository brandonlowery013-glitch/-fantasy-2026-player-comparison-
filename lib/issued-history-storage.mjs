import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const encoding='CTD_ISSUED_HISTORY_GZIP_BASE64_V1';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function encodeIssuedHistory(history){
 if(history?.schema_version!=='1.0.0'||!Array.isArray(history.records))throw Error('Invalid issued history');
 const bytes=Buffer.from(JSON.stringify(history));
 return {encoding,record_count:history.records.length,uncompressed_sha256:digest(bytes),data:gzipSync(bytes,{level:9}).toString('base64')};
}
export function decodeIssuedHistory(stored){
 if(!stored?.encoding)return stored; // Existing plain JSON ledgers remain readable.
 if(stored.encoding!==encoding)throw Error('Unsupported issued history encoding');
 const bytes=gunzipSync(Buffer.from(stored.data,'base64'),{maxOutputLength:512*1024*1024});
 if(digest(bytes)!==stored.uncompressed_sha256)throw Error('Issued history integrity mismatch');
 const history=JSON.parse(bytes.toString('utf8'));
 if(history.schema_version!=='1.0.0'||!Array.isArray(history.records)||history.records.length!==stored.record_count)throw Error('Issued history record count/schema mismatch');
 return history;
}
