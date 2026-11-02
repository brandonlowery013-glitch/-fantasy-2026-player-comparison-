import assert from 'node:assert/strict';
import {maintainPublisher} from './prepared-model-publisher-loop.mjs';
const order=[],pauses=[];
const result=await maintainPublisher({cycles:3,intervalMs:1,cycle:async n=>order.push(n),pause:async ms=>pauses.push(ms),log:()=>{}});
assert.deepEqual(order,[0,1,2]);assert.equal(result.successes,3);assert.equal(pauses.length,2);assert(pauses.every(ms=>ms>=0&&ms<=1));
let calls=0;const recovered=await maintainPublisher({cycles:3,intervalMs:0,cycle:async()=>{if(++calls===1)throw Error('provider timeout')},pause:async()=>{},log:()=>{}});assert.equal(recovered.successes,2);
calls=0;await assert.rejects(maintainPublisher({cycles:5,intervalMs:0,cycle:async()=>{calls++;throw Error('down')},pause:async()=>{},log:()=>{}}),/Three consecutive/);assert.equal(calls,3);
await assert.rejects(maintainPublisher({cycles:0,cycle:()=>{}}),/Invalid/);
console.log('PASS: bounded repeated publication, cadence waits, transient recovery, sustained-failure exit and invalid-loop rejection.');
