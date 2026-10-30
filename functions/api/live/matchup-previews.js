import {enrichPreviewFeed} from './football-preview-context.mjs';
let pending=null,latest=null,until=0;
export async function onRequestGet({env}){
 const path='/matchup-previews/latest.json';
 try{
  if(!pending&&(!latest||Date.now()>=until))pending=(async()=>{
   const r=env.SPLITS_SCHEDULER?await env.SPLITS_SCHEDULER.fetch('https://store'+path):await fetch('https://ctd-background-splits.brandonlowery013.workers.dev'+path,{signal:AbortSignal.timeout(20000)});
   if(!r.ok)throw Error('Written football report unavailable');
   const base=await r.json();latest=await enrichPreviewFeed(base,env);until=Date.now()+60000;return latest;
  })().finally(()=>{pending=null;});
  const data=pending?await pending:latest;
  return Response.json(data,{headers:{'cache-control':'no-store'}});
 }catch(e){if(latest)return Response.json({...latest,stale:true,context_status:'SAVED_REPORT'},{headers:{'cache-control':'no-store'}});return Response.json({status:'UNAVAILABLE',error:e.message},{status:502});}
}
