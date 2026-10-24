import {jointMarketView} from '../lib/joint-game-probabilities.mjs';
import {JointProjectionStore} from './joint-projections.mjs';
import {MoneylineProjectionStore} from './moneyline-projections.mjs';
import {SpreadProjectionStore} from './spread-projections.mjs';
import {PersonnelGameStore} from './game-projections.mjs';
import {PropsRelay} from './props-relay.mjs';
import {AvailabilityStore} from './availability.mjs';
import {QuarterbackProjections} from './qb-projections.mjs';
import {collectSplits} from '../lib/background-splits.mjs';
import {preservePublished} from '../lib/splits-history.mjs';
const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','access-control-allow-origin':'*'}});
const validPath=p=>['/latest.json','/status.json','/index.json'].includes(p)||/^\/history\/\d{4}-\d{2}-\d{2}\.json$/.test(p);
const store=env=>env.SPLITS_STORE.get(env.SPLITS_STORE.idFromName('production'));
export default {
 async scheduled(controller,env){
  if(controller.cron!=='*/15 * * * *')throw Error('Unsupported schedule');
  const jobs=[['splits','/collect'],...(env.PROPS_RELAY_URL?[['props','/props/collect']]:[]),...(env.AVAILABILITY_ENABLED==='true'?[['availability','/availability/collect']]:[]),...(env.SPREAD_MODEL_ENABLED==='true'?[['spread','/spread-projections/collect']]:[]),...(env.MONEYLINE_MODEL_ENABLED==='true'?[['moneyline','/moneyline-projections/collect']]:[])];
  let splitsComplete=Promise.resolve();
  const operations=jobs.map(([name,path])=>{const run=(async()=>{if(name==='moneyline')await splitsComplete.catch(()=>{});
   const response=await store(env).fetch('https://store'+path,{method:'POST',body:JSON.stringify({scheduled_time:controller.scheduledTime,cron:controller.cron})});
   const body=await response.text();if(!response.ok)throw Error('Scheduled '+name+' collection failed: '+body);
   console.log(name+'-scheduled-publication',body);
   if(name==='availability'&&env.QB_PROJECTIONS_ENABLED==='true'){
    const qbResponse=await store(env).fetch('https://store/quarterbacks/collect',{method:'POST',body:JSON.stringify({scheduled_time:controller.scheduledTime,cron:controller.cron})});
    const qbBody=await qbResponse.text();if(!qbResponse.ok)throw Error('Scheduled quarterback projection update failed: '+qbBody);
    console.log('quarterbacks-scheduled-publication',qbBody);
    if(env.PERSONNEL_GAME_ENABLED==='true'){const r=await store(env).fetch('https://store/game-projections/collect',{method:'POST',body:JSON.stringify({scheduled_time:controller.scheduledTime,cron:controller.cron})});const b=await r.text();if(!r.ok)throw Error('Personnel game publication failed: '+b);console.log('personnel-games-scheduled-publication',b);}
   }
  })();if(name==='splits')splitsComplete=run;return run;});
  const results=await Promise.allSettled(operations);
  if(env.JOINT_MODEL_ENABLED==='true'){const jointResponse=await store(env).fetch('https://store/joint-projections/collect',{method:'POST',body:JSON.stringify({scheduled_time:controller.scheduledTime,cron:controller.cron})});
  if(!jointResponse.ok)throw Error('Scheduled joint publication failed: '+await jointResponse.text());
  console.log('joint-scheduled-publication',await jointResponse.text());}
  const errors=results.filter(r=>r.status==='rejected').map(r=>r.reason);
  if(errors.length)throw new AggregateError(errors,errors.map(e=>e.message).join('; '));
 },
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(['/moneyline-projections/latest.json','/spread-projections/latest.json'].includes(path)&&request.method==='GET'){const jointResponse=await store(env).fetch('https://store/joint-projections/latest.json');if(!jointResponse.ok)return jointResponse;const joint=await jointResponse.json();if(!['CURRENT','PARTIAL'].includes(joint.health?.status))return json({status:'JOINT_MODEL_UNAVAILABLE'},503);const rawResponse=await store(env).fetch('https://store'+path);if(!rawResponse.ok)return rawResponse;return json(jointMarketView(await rawResponse.json(),joint,path.includes('moneyline')?'moneyline':'spread'));}
  if(path.startsWith('/joint-projections/')&&request.method==='GET')return store(env).fetch(new Request('https://store'+path+new URL(request.url).search,request));
  if(path.startsWith('/moneyline-projections/')&&request.method==='GET')return store(env).fetch(new Request('https://store'+path+new URL(request.url).search,request));
  if(path.startsWith('/spread-projections/')&&request.method==='GET')return store(env).fetch(new Request('https://store'+path+new URL(request.url).search,request));
  if(path.startsWith('/game-projections/')&&request.method==='GET')return store(env).fetch(new Request('https://store'+path+new URL(request.url).search,request));
  if(path.startsWith('/quarterbacks/')&&request.method==='GET')return store(env).fetch(new Request('https://store'+path+new URL(request.url).search,request));
  if(path.startsWith('/availability/')&&request.method==='GET')return store(env).fetch(new Request('https://store'+path,request));
  if(path.startsWith('/props/')&&(request.method==='GET'||path==='/props/claim'&&request.method==='POST'))return store(env).fetch(new Request('https://store'+path,request));
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  if(!validPath(path))return json({error:'Not found'},404);
  return store(env).fetch('https://store'+path);
 }
};
// Collection is reachable only through the bound object, never through public HTTP.
export class SplitsStore {
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.pending=null;this.props=new PropsRelay(ctx.storage,env);this.availability=new AvailabilityStore(ctx.storage);this.quarterbacks=new QuarterbackProjections(ctx.storage);this.games=new PersonnelGameStore(ctx.storage,this.quarterbacks);this.spreads=new SpreadProjectionStore(ctx.storage);this.moneylines=new MoneylineProjectionStore(ctx.storage);this.joint=new JointProjectionStore(ctx.storage);}
 async fetch(request){
  const path=new URL(request.url).pathname;
  if(path.startsWith('/joint-projections/'))return this.joint.handle(request);
  if(path.startsWith('/moneyline-projections/'))return this.moneylines.handle(request);
  if(path.startsWith('/spread-projections/'))return this.spreads.handle(request);
  if(path.startsWith('/game-projections/'))return this.games.handle(request);
  if(path.startsWith('/quarterbacks/'))return this.quarterbacks.handle(request);
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
