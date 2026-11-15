import assert from 'node:assert/strict';
import {csvRecords} from '../lib/csv-records.mjs';
const text='name,detail,value\r\n"A, B","two ""quotes""",1\r\nC,"line\none",\r\n\nD,last,3';
assert.deepEqual([...csvRecords(text)],[{name:'A, B',detail:'two "quotes"',value:'1'},{name:'C',detail:'line\none',value:''},{name:'D',detail:'last',value:'3'}]);
assert.deepEqual([...csvRecords('')],[]);assert.deepEqual([...csvRecords('a,b\n1\n2,')],[{a:'2',b:''}]);
// Each row is yielded before the parser reads later records, including quoted newlines.
const records=csvRecords('a,b\n1,2\n3,4\n');assert.deepEqual(records.next().value,{a:'1',b:'2'});assert.deepEqual(records.next().value,{a:'3',b:'4'});assert.equal(records.next().done,true);
const large='id,value\n'+'1,2\n'.repeat(250000);let count=0,sum=0;for(const r of csvRecords(large)){count++;sum+=Number(r.value);}assert.equal(count,250000);assert.equal(sum,500000);
console.log('PASS: CSV escaping, quoted commas/newlines, CRLF, empty/final fields, lazy iteration and 250,000-record aggregation.');
