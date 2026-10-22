import {PropsRelay} from './props-relay.mjs';
import {AvailabilityStore} from './availability.mjs';
import {collectSplits} from '../lib/background-splits.mjs';
import {preservePublished} from '../lib/splits-history.mjs';
const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','access-control-allow-origin':'*'}});
const validPath=p=>['/latest.json','/status.json','/index.json'].includes(p)||/^\/history\/\d{4}-\d{2}-\d{2}\.json$/.test(p);
const store=env=>env.SPLITS_STORE.get(env.SPLITS_STORE.idFromName('production'));
export default {
 async scheduled(controller,env){
  const jobs=[['splits','/collect'],...(env.PROPS_RELAY_URL?[['props','/props/collect']]:[]),...(env.AVAILABILITY_ENABLED==='true'?[['availability','/availability/collect']]:[])];
  const results=await Promise.allSettled(jobs.map(async([name,path])=>{
   const response=await store(env).fetch('https://store'+path,{method:'POST',body:JSON.stringify({scheduled_time:controller.scheduledTime,cron:controller.cron})});
   const body=await response.text();if(!response.ok)throw Error('Scheduled '+name+' collection failed: '+body);
   console.log(name+'-scheduled-publication',body);
  }));
  const errors=results.filter(r=>r.status==='rejected').map(r=>r.reason);
  if(errors.length)throw new AggregateError(errors,errors.map(e=>e.message).join('; '));
 },
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path.startsWith('/availability/')&&request.method==='GET')return store(env).fetch(new Request('https://store'+path,request));
  if(path.startsWith('/props/')&&(request.method==='GET'||path==='/props/claim'&&request.method==='POST'))return store(env).fetch(new Request('https://store'+path,request));
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  if(!validPath(path))return json({error:'Not found'},404);
  return store(env).fetch('https://store'+path);
 }
};
// Collection is reachable only through the bound object, never through public HTTP.
export class SplitsStore {
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.pending=null;this.props=new PropsRelay(ctx.storage,env);this.availability=new AvailabilityStore(ctx.storage);}
 async fetch(request){
  const path=new URL(request.url).pathname;
  if(path.startsWith('/availability/'))return this.availability.handle(request);
  if(path.startsWith('/props/'))return this.props.handle(request);
  if(path==='/collect'&&request.method==='POST'){
   const event=await request.json();
   const operation=(this.pending||Promise.resolve()).catch(()=>{}).then(()=>this.collect(event));
   this.pending=operation;
   try{return (await operation).clone();}finally{if(this.pending===operation)this.pending=null;}
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
