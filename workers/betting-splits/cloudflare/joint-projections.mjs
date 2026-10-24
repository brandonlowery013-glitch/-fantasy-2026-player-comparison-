import seed from '../model/spread-training-2026.json' with {type:'json'};
import historical from '../model/ne-chi-current-models.json' with {type:'json'};
import {overlaySpreadFeed} from '../lib/spread-feed.mjs';
import {overlayMoneylineFeed} from '../lib/moneyline-feed.mjs';
import {applyHistoricalSelection} from '../lib/historical-model-selection.mjs';
import {cohereGameFeed,JOINT_VERSION} from '../lib/joint-game-probabilities.mjs';
import {producerRef} from '../lib/producer-ref.mjs';
const json=(d,s=200)=>Response.json(d,{status:s,headers:{'cache-control':'no-store','access-control-allow-origin':'*'}}),hash=async d=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(d))))].map(x=>x.toString(16).padStart(2,'0')).join(''),REPO='brandonlowery013-glitch/-fantasy-2026-player-comparison-';
export async function packJoint(saved){const bytes=new TextEncoder().encode(JSON.stringify(saved.consumer)),compressed=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());const {consumer,...metadata}=saved;return {...metadata,consumer_encoding:'gzip-json-v1',consumer_gzip:compressed};}
export async function hydrateJoint(saved){if(!saved||saved.consumer)return saved;if(saved.consumer_encoding!=='gzip-json-v1')throw Error('Unknown joint storage encoding');const consumer=JSON.parse(await new Response(new Blob([saved.consumer_gzip]).stream().pipeThrough(new DecompressionStream('gzip'))).text()),{consumer_gzip,consumer_encoding,...metadata}=saved;return {...metadata,consumer};}
export class JointProjectionStore{
 constructor(storage,read=(...args)=>fetch(...args),now=()=>Date.now()){this.storage=storage;this.read=read;this.now=now;this.pending=null;}
 async handle(request){const u=new URL(request.url);
 if(u.pathname==='/joint-projections/collect'&&request.method==='POST'){const event=await request.json(),p=(this.pending||Promise.resolve()).catch(()=>{}).then(()=>this.collect(event));this.pending=p;try{return await p;}finally{if(this.pending===p)this.pending=null;}}
 if(request.method!=='GET')return json({error:'Read only'},405);
 if(u.pathname==='/joint-projections/index.json')return json({captures:[...(await this.storage.list({prefix:'joint:manifest:',reverse:true,limit:96})).values()]});
 if(u.pathname==='/joint-projections/status.json')return json(await this.storage.get('joint:status')||{status:'WAITING_FOR_FIRST_CRON'});
 const match=u.pathname.match(/^\/joint-projections\/history\/([a-f0-9]{64})\.json$/);if(match){const saved=await hydrateJoint(await this.storage.get('joint:revision:'+match[1]));return saved?json(saved):json({error:'Not found'},404);}
 if(u.pathname==='/joint-projections/latest.json'){const saved=await hydrateJoint(await this.storage.get('joint:latest')),status=await this.storage.get('joint:status');if(!saved)return json({status:'WAITING_FOR_FIRST_CRON'},503);return json({...saved,health:{status:status?.status==='FAILED'||this.now()-Date.parse(saved.checked_at)>30*60000?'STALE':saved.status,error:status?.error||null}});}
 return json({error:'Not found'},404);
 }
 async collect({scheduled_time,cron}){
 if(!Number.isFinite(scheduled_time)||cron!=='*/15 * * * *')return json({error:'Invalid scheduled event'},400);
 const key='joint:manifest:'+scheduled_time;if(await this.storage.get(key))return json({duplicate:true});
 const now=this.now(),checked_at=new Date(now).toISOString();
 try{
 const ref=await producerRef(REPO,this.read),root='https://raw.githubusercontent.com/'+REPO+'/'+ref+'/',read=async p=>{const r=await this.read(root+p,{signal:AbortSignal.timeout(40000)});if(!r.ok)throw Error('Joint input '+r.status);return r.json();};
 const [base,ledger,schedule,spread,moneyline]=await Promise.all([read('data/market/game-model-consumer-2026.json'),read('data/market/postgame-model-learning-2026.json'),read('data/calibration/weekly-event-schedule-2026.json'),this.storage.get('spread:latest'),this.storage.get('moneyline:latest')]);
 if(base.week!==schedule.week||base.season!==2026||(schedule.season!=null&&base.season!==schedule.season))throw Error('Joint schedule mismatch');
 const prior=[...(await this.storage.list({prefix:'joint:pregame:'})).values()],training=[...seed.rows],norm=t=>({LAR:'LA',WSH:'WAS'}[t]||t);
 for(const f of prior){if(f.week>=base.week||Date.parse(f.kickoff)>now)continue;const original=(ledger.forecasts||[]).find(x=>x.game_id===f.game_id&&String(x.event_id)===String(f.event_id)&&norm(x.home_team)===norm(f.home_team)&&norm(x.away_team)===norm(f.away_team)&&Date.parse(x.kickoff)===Date.parse(f.kickoff)),final=original&&(ledger.settlements||[]).filter(x=>x.forecast_id===original.forecast_id&&x.verified_final&&Number.isFinite(x.home_score)&&Number.isFinite(x.away_score)&&Date.parse(x.observed_at)<=now).sort((a,b)=>Date.parse(b.observed_at)-Date.parse(a.observed_at))[0];if(final)training.push({...f,final:{...final,home_team:f.home_team,away_team:f.away_team,kickoff:f.kickoff}});}
 // A failed upstream refresh must not silently publish an old candidate as current.
 const statusS=await this.storage.get('spread:status'),statusM=await this.storage.get('moneyline:status');
 const consumer=cohereGameFeed(applyHistoricalSelection(overlayMoneylineFeed(overlaySpreadFeed(base,statusS?.status==='FAILED'?null:spread,now),statusM?.status==='FAILED'?null:moneyline,now),historical),training,now);
 for(const [id,g] of Object.entries(consumer.games||{})){
 if(Date.parse(g.kickoff)<=now){const frozen=prior.find(f=>f.game_id===id);if(frozen)consumer.games[id]=frozen.game;continue;}
 const qs=(g.snapshot_evaluations||[]).filter(q=>q.eligible_for_current_recommendation!==false&&q.joint_distribution).sort((a,b)=>Date.parse(b.captured_at)-Date.parse(a.captured_at)),q=qs.find(q=>q.book==='draftkings')||qs[0];
 if(q)await this.storage.put('joint:pregame:'+id,{game_id:id,event_id:schedule.games?.[id]?.event_id,week:base.week,home_team:g.home_team,away_team:g.away_team,kickoff:g.kickoff,home_line:q.market.home_spread,captured_at:checked_at,game:g});
 }
 const held=Object.values(consumer.games||{}).filter(g=>Date.parse(g.kickoff)>now&&g.joint_model?.status!=='CURRENT').length,status=held?'PARTIAL':'CURRENT',core={schema_version:1,model_version:JOINT_VERSION,season:base.season,week:base.week,status,consumer,source_ref:ref,source_spread_revision:spread?.revision_id,source_moneyline_revision:moneyline?.revision_id},revision_id=await hash(core),saved={...core,revision_id,checked_at,collection_event:'cloudflare-cron',paid_provider_requests:0},manifest={scheduled_time,checked_at,status,revision_id,game_count:Object.keys(consumer.games||{}).length,held_count:held};
 const packed=await packJoint(saved);if(packed.consumer_gzip.byteLength>1900000)throw Error('Joint publication exceeds storage limit');await this.storage.put({'joint:latest':packed,'joint:status':{status,last_success_at:checked_at,revision_id},[key]:manifest});if(!await this.storage.get('joint:revision:'+revision_id))await this.storage.put('joint:revision:'+revision_id,packed);return json(manifest);
 }catch(e){await this.storage.put('joint:status',{status:'FAILED',checked_at,error:e.message});return json({status:'FAILED',error:e.message},502);}
 }
}
