import assert from 'node:assert/strict';
import {repairTimer} from './repair-splits-timer.mjs';
const env={GITHUB_REPOSITORY:'test/repo',GITHUB_TOKEN:'test-only'};
let state='active',calls=[],failEnable=0,disableTimeout=false,wrongTarget=false;
const fetcher=async(url,options)=>{
 calls.push([options.method,url]);assert(url.startsWith('https://api.github.com/repos/test/repo/actions/workflows/background-betting-splits.yml'));
 if(options.method==='GET')return Response.json({id:123,path:wrongTarget?'different.yml':'.github/workflows/background-betting-splits.yml',name:'Background Betting Splits',state});
 if(url.endsWith('/disable')){state='disabled_manually';if(disableTimeout)throw Error('simulated timeout');return new Response(null,{status:204});}
 if(url.endsWith('/enable')){if(failEnable-->0)return new Response('',{status:503});state='active';return new Response(null,{status:204});}
 throw Error('Unexpected request');
};
const report=await repairTimer({fetcher,env});assert.equal(report.after,'active');assert.equal(report.timer_execution_verified,false);assert.deepEqual(calls.map(c=>c[0]),['GET','PUT','PUT','GET']);
calls=[];failEnable=1;await repairTimer({fetcher,env});assert.equal(state,'active');assert.equal(calls.filter(c=>c[1].endsWith('/enable')).length,2);
calls=[];disableTimeout=true;await assert.rejects(repairTimer({fetcher,env}),/simulated timeout/);assert.equal(state,'active','ambiguous disable failure must still restore the timer');
calls=[];disableTimeout=false;wrongTarget=true;await assert.rejects(repairTimer({fetcher,env}),/unexpected workflow/);assert.equal(calls.length,1,'wrong target must never be changed');
console.log('PASS: only the splits workflow is targeted, active state restored, transient enable failures retried, ambiguous disable failure recovered, and registration never mislabeled as timer execution');
