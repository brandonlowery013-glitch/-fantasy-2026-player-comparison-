import {collectSplits} from '../lib/background-splits.mjs';
import {preservePublished} from '../lib/splits-history.mjs';
const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','access-control-allow-origin':'*'}});
const validPath=p=>['/latest.json','/status.json','/index.json'].includes(p)||/^\/history\/\d{4}-\d{2}-\d{2}\.json$/.test(p);
const store=env=>env.SPLITS_STORE.get(env.SPLITS_STORE.idFromName('production'));
export default {
 async scheduled(controller,env){
  const response=await store(env).fetch('https://store/collect',{method:'POST',body:JSON.stringify({scheduled_time:controller.scheduledTime,cron:controller.cron})});
  if(!response.ok)throw Error('Scheduled splits collection failed: '+await response.text());
  console.log('splits-scheduled-publication',await response.text());
 },
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  if(!validPath(path))return json({error:'Not found'},404);
  return store(env).fetch('https://store'+path);
 }
};
// Collection is reachable only through the bound object, never through public HTTP.
export class SplitsStore {
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.pending=null;}
 async fetch(request){
  const path=new URL(request.url).pathname;
  if(path==='/collect'&&request.method==='POST'){
   if(this.pending)return this.pending.then(r=>r.clone());
   this.pending=this.collect(await request.json());
   try{return (await this.pending).clone();}finally{this.pending=null;}
  }
  if(request.method!=='GET'||!validPath(path))return json({error:'Not found'},404);
  if(path.startsWith('/history/')){
   const day=path.slice(9,-5);
   const entries=await this.ctx.storage.list({prefix:'capture:'+day+':'});
   if(!entries.size)return json({error:'No Cloudflare captures for date'},404);
   return json({schema_version:1,date:day,snapshots:[...entries.values()]});
  }
  const data=await this.ctx.storage.get(path.slice(1,-5));
  return data?json(data):json({error:'No successful Cloudflare collection yet'},404);
 }
 async collect({scheduled_time,cron}){
  if(!Number.isFinite(scheduled_time)||cron!=='*/15 * * * *')return json({error:'Invalid scheduled event'},400);
  const capture_id='cloudflare:'+scheduled_time,key='capture:'+new Date(scheduled_time).toISOString().slice(0,10)+':'+scheduled_time;
  const existing=await this.ctx.storage.get(key);
  if(existing)return json({capture_id,duplicate:true});
  const last_attempt_at=new Date().toISOString();
  try{
   const capture=await collectSplits();
   const entry={...capture,capture_id,event:'cloudflare-cron',scheduled_at:new Date(scheduled_time).toISOString(),cron};
   await this.ctx.storage.transaction(async tx=>{
    if(await tx.get(key))return;
    const previous=await tx.get('latest'),index=await tx.get('index'),day=entry.scheduled_at.slice(0,10);
    const latest={...preservePublished(capture,previous),collection:{capture_id,event:entry.event,scheduled_at:entry.scheduled_at,cron,last_success_at:capture.observed_at,status:capture.status,cadence_minutes:15},history:{index:'/api/live/splits?history=index',date:day}};
    await tx.put({[key]:entry,latest,index:{schema_version:1,updated_at:capture.observed_at,days:[...new Set([...(index?.days||[]),day])].sort(),latest_capture_id:capture_id},status:{status:capture.status,event:entry.event,capture_id,scheduled_at:entry.scheduled_at,last_attempt_at,last_success_at:capture.observed_at}});
   });
   return json({capture_id,status:capture.status,games:capture.games.length,scheduled_at:entry.scheduled_at,observed_at:capture.observed_at});
  }catch(error){
   const previous=await this.ctx.storage.get('status');
   await this.ctx.storage.put('status',{...previous,status:'FAILED',event:'cloudflare-cron',capture_id,last_attempt_at,scheduled_at:new Date(scheduled_time).toISOString(),error:String(error.message).slice(0,300)});
   console.error('splits-scheduled-failure',capture_id,error.message);
   return json({error:error.message,capture_id},502);
  }
 }
}
