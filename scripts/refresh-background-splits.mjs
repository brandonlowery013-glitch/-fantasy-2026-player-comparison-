import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {collectSplits,publication,DATA_BRANCH,ROOT} from '../lib/background-splits.mjs';
export async function refresh({fetcher=fetch,env=process.env}={}){
 const repo=env.GITHUB_REPOSITORY,token=env.GITHUB_TOKEN;
 if(!repo||!token)throw Error('Workflow repository and token are required');
 const api=async(path,method='GET',body,raw=false)=>{
  const r=await fetcher(`https://api.github.com/repos/${repo}/${path}`,{method,headers:{authorization:`Bearer ${token}`,accept:raw?'application/vnd.github.raw+json':'application/vnd.github+json','x-github-api-version':'2022-11-28'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  if(r.status===404&&method==='GET'&&path.startsWith('contents/'))return null;
  if(!r.ok)throw Error(`GitHub ${method} ${path.split('?')[0]} HTTP ${r.status}`);
  return r.json();
 };
 const run={id:`${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT||1}`,event:env.GITHUB_EVENT_NAME||'local',url:`https://github.com/${repo}/actions/runs/${env.GITHUB_RUN_ID}`};
 let capture,error;
 try{capture=await collectSplits({fetcher});}catch(e){error=e;}
 // Publish all files atomically. A failed collection changes status only;
 // it never erases the last successful snapshot or history.
 for(let attempt=0;attempt<3;attempt++){
  const ref=await api(`git/ref/heads/${DATA_BRANCH}`),head=ref.object.sha;
  const commit=await api(`git/commits/${head}`);
  const read=path=>api(`contents/${ROOT}/${path}?ref=${head}`,'GET',undefined,true);
  const at=new Date().toISOString();
  const status={schema_version:1,last_attempt_at:at,status:error?'FAILED':capture.status,run_id:run.id,event:run.event,run_url:run.url,...(error?{error:error.message}:{last_success_at:capture.observed_at,games: capture.games.length,expected_games:capture.expected_games})};
  const files={[`${ROOT}/status.json`]:status};
  if(!error){
   const [previous,index,history]=await Promise.all([read('latest.json'),read('index.json'),read(`history/${capture.observed_at.slice(0,10)}.json`)]);
   if(history&&!Array.isArray(history.snapshots))throw Error('Refusing to overwrite malformed history');
   if(index&&!Array.isArray(index.days))throw Error('Refusing to overwrite malformed history index');
   const p=publication(previous,index,history,capture,run);
   Object.assign(files,{[`${ROOT}/latest.json`]:p.latest,[`${ROOT}/index.json`]:p.index,[`${ROOT}/history/${capture.observed_at.slice(0,10)}.json`]:p.history});
  }
  const tree=await api('git/trees','POST',{base_tree:commit.tree.sha,tree:Object.entries(files).map(([path,value])=>({path,mode:'100644',type:'blob',content:JSON.stringify(value)+'\n'}))});
  const next=await api('git/commits','POST',{message:`${error?'Record failed':'Save'} background splits collection ${run.id}`,tree:tree.sha,parents:[head]});
  try{await api(`git/refs/heads/${DATA_BRANCH}`,'PATCH',{sha:next.sha,force:false});}
  catch(e){if(attempt<2&&/HTTP (409|422)/.test(e.message))continue;throw e;}
  const saved=await api(`contents/${ROOT}/status.json?ref=${next.sha}`,'GET',undefined,true);
  if(saved.run_id!==run.id)throw Error('Published status verification failed');
  const report={...status,commit:next.sha,branch:DATA_BRANCH};
  fs.mkdirSync('work',{recursive:true});fs.writeFileSync('work/background-splits-result.json',JSON.stringify(report,null,2)+'\n');
  if(env.GITHUB_STEP_SUMMARY)fs.appendFileSync(env.GITHUB_STEP_SUMMARY,`Background splits: **${status.status}**. Event: ${run.event}. Commit: ${next.sha}. Games: ${status.games??'collection failed'}/${status.expected_games??'unknown'}.\n`);
  console.log(JSON.stringify(report));
  if(error)throw error;
  return report;
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await refresh();
