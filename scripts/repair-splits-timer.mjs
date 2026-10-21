import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
export async function repairTimer({fetcher=fetch,env=process.env}={}){
 if(!env.GITHUB_REPOSITORY||!env.GITHUB_TOKEN)throw Error('Repository and job-scoped token required');
 const base=`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/background-betting-splits.yml`;
 const api=async(method,suffix='')=>{const r=await fetcher(base+suffix,{method,headers:{authorization:`Bearer ${env.GITHUB_TOKEN}`,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28'},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`Splits timer ${method} ${suffix||'metadata'} HTTP ${r.status}`);return r.status===204?null:r.json();};
 const before=await api('GET');
 if(before.path!=='.github/workflows/background-betting-splits.yml'||before.name!=='Background Betting Splits')throw Error('Refusing to change an unexpected workflow');
 let disableError;
 try{await api('PUT','/disable');}catch(e){disableError=e;}
 // Always restore the timer, including a timeout whose server-side outcome
 // was not returned. Never disable any model or protected-check workflow.
 let enableError;
 for(let i=0;i<3;i++){try{await api('PUT','/enable');enableError=null;break;}catch(e){enableError=e;}}
 if(enableError)throw enableError;
 const after=await api('GET');if(after.state!=='active')throw Error('Splits timer did not return to active state');
 if(disableError)throw disableError;
 const report={verified_at:new Date().toISOString(),workflow:after.path,workflow_id:after.id,before:before.state,after:after.state,registration_reset:true,timer_execution_verified:false};
 if(env.GITHUB_STEP_SUMMARY)fs.appendFileSync(env.GITHUB_STEP_SUMMARY,'Splits timer registration reset; workflow confirmed active. A subsequent event=schedule run is still required to verify timer execution.\n');
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const report=await repairTimer();fs.mkdirSync('work',{recursive:true});fs.writeFileSync('work/splits-timer-registration.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
