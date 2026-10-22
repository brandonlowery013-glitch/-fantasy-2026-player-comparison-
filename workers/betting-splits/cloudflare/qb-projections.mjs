import {producerRef} from '../lib/producer-ref.mjs';
import model from './qb-receiver-model.json' with {type:'json'};
import {resolveQuarterbacks,applyQuarterbackRevisions,reviseReceiverDistributions} from '../lib/qb-receiver-projections.mjs';
import {playerKey} from '../lib/player-prop-availability.mjs';
const REPO='brandonlowery013-glitch/-fantasy-2026-player-comparison-';
const json=(x,status=200)=>Response.json(x,{status,headers:{'cache-control':'no-store','access-control-allow-origin':'*'}});
const digest=async x=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(x))))].map(x=>x.toString(16).padStart(2,'0')).join('');
const compactProjection=p=>({...p,players:Object.fromEntries(Object.entries(p.players||{}).map(([name,x])=>[name,{position:x.position,status:x.status,qb_scenario:x.qb_scenario,projections:Object.fromEntries(Object.entries(x.projections||{}).map(([stat,s])=>[stat,Object.fromEntries(Object.entries(s).filter(([k])=>['mean','sd','combined_sd','performance_sd','projection_error_sd','status','actionable','sportsbook_inputs_used','baseline','qb_adjustment'].includes(k)))]))}]))});
export function parseQuarterbackDepth(payload,roster,team,observed_at,source_url){
 const rows=[];const walk=x=>{if(!x||typeof x!=='object')return;if(Array.isArray(x)){x.forEach(walk);return;}
  if(x.position?.abbreviation==='QB'&&Array.isArray(x.athletes))for(const [i,entry] of x.athletes.entries()){
   const a=entry.athlete||entry;const matches=roster.filter(p=>String(p.athlete_id)===String(a.id)||playerKey(p.name)===playerKey(a.displayName||a.fullName));if(matches.length!==1)continue;
   rows.push({...matches[0],depth_roles:[{position:'QB',rank:Number(entry.rank||a.rank||i+1)}]});
  }
  for(const v of Object.values(x))if(v&&typeof v==='object')walk(v);
 };walk(payload.depthchart||payload.depthcharts||payload.items||payload);
 const unique=[...new Map(rows.map(p=>[p.athlete_id+':'+p.depth_roles[0].rank,p])).values()];if(!unique.length)throw Error(team+': no verified QB depth order');
 return {team,captured_at:observed_at,source_url,players:[...unique,...roster.filter(p=>!unique.some(q=>String(q.athlete_id)===String(p.athlete_id))).map(p=>({...p,depth_roles:[]}))]};
}
function compactPersonnel(p){return {...p,teams:Object.fromEntries(Object.entries(p.teams||{}).map(([team,t])=>[team,{team,captured_at:t.captured_at,source_url:t.source_url,players:(t.players||[]).filter(x=>x.position==='QB').map(x=>({name:x.name,team,athlete_id:x.athlete_id,position:'QB',roster_status:x.roster_status,depth_roles:x.depth_roles,injury_reports:(x.injury_reports||[]).map(r=>({status:r.status,source_updated_at:r.source_updated_at,conflicting_reports:r.conflicting_reports}))}))}]))};}
export class QuarterbackProjections{
 constructor(storage){this.storage=storage;this.pending=null;}
 async handle(request){const url=new URL(request.url),p=url.pathname;
  if(p==='/quarterbacks/collect'&&request.method==='POST'){const event=await request.json(),op=(this.pending||Promise.resolve()).catch(()=>{}).then(()=>this.collect(event));this.pending=op;try{return await op;}finally{if(this.pending===op)this.pending=null;}}
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  if(p==='/quarterbacks/status.json')return json(await this.storage.get('qb:status')||{status:'WAITING_FOR_FIRST_CRON'});
  if(p==='/quarterbacks/index.json')return json({captures:[...(await this.storage.list({prefix:'qb:manifest:',reverse:true,limit:96})).values()]});
  if(p==='/quarterbacks/latest.json'){
   const data=await this.storage.get('qb:latest');if(!data)return json({status:'WAITING_FOR_FIRST_CRON'},503);
   const status=await this.storage.get('qb:status'),age=Date.now()-Date.parse(data.checked_at);
   return json({...data,health:{status:status?.status==='FAILED'||age<0||age>30*60000?'STALE':data.status,last_checked_at:data.checked_at,...(status?.error?{error:status.error}:{})}});
  }
  const history=p.match(/^\/quarterbacks\/history\/([a-f0-9]{64})\.json$/);if(history){const data=await this.storage.get('qb:revision:'+history[1]);return data?json(data):json({error:'Not found'},404);}
  if(p==='/quarterbacks/verify.json'){
   const input=await this.storage.get('qb:inputs');if(!input)return json({error:'No background inputs yet'},503);
   if(Date.now()-Date.parse(input.availability.observed_at)>30*60000)return json({error:'Fresh background inputs are required'},503);
   const team=url.searchParams.get('team');if(!/^[A-Z]{2,3}$/.test(team||''))return json({error:'A team code is required'},400);
   const scenario=Object.values(input.scenarios).find(s=>s.team===team&&Date.parse(s.kickoff)>Date.now());if(!scenario)return json({error:'No upcoming game for team'},404);
   const test=structuredClone(input),starter=test.personnel.teams[team]?.players.find(p=>playerKey(p.name)===playerKey(scenario.starter));if(!starter)return json({error:'Missing starter identity'},409);
   test.availability.injuries.push({name:starter.name,athlete_id:String(starter.athlete_id),team,status:'Out',source_updated_at:new Date().toISOString(),source_url:'TEST_ONLY_NOT_AN_OFFICIAL_REPORT'});
   const scenarios=resolveQuarterbacks({...test,anchors:input.scenarios});const result=await this.build(test,scenarios);
   return json({...result,simulated_at:new Date().toISOString(),simulation:true,simulation_label:'TEST SCENARIO — starter ruled out. Not an official report. Nothing is saved.',simulation_team:team,simulation_starter:starter.name,persisted:false,base_revision_id:input.revision_id});
  }
  return json({error:'Not found'},404);
 }
 async build(input,scenarios){
  const {projection,changes}=applyQuarterbackRevisions({...input,scenarios,model}),distributions=reviseReceiverDistributions(input.distributions,changes);
  return {schema_version:1,season:2026,week:input.schedule.week,mode:'SHADOW_ONLY',actionable:false,sportsbook_inputs_used:false,model_version:model.version,source_ref:input.source_ref,base_generated_at:input.projection.generated_at,distribution_generated_at:input.distributions.generated_at,scenarios,players:changes,distributions:Object.fromEntries(Object.keys(changes).map(n=>[n,distributions.distributions[n]||{distributions:{}}])),model_validation:{training_window:model.training_window,holdout_window:model.holdout_window,limitations:model.limitations}};
 }
 async collect({scheduled_time,cron}){
  if(!Number.isFinite(scheduled_time)||cron!=='*/15 * * * *')return json({error:'Invalid schedule'},400);
  const attempt='qb:manifest:'+scheduled_time;if(await this.storage.get(attempt))return json({duplicate:true});
  const checked_at=new Date().toISOString();
  const read=async url=>{const r=await fetch(url,{headers:{accept:'application/json','user-agent':'CTD-QB-projection-scheduler/1.0'},signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('QB input HTTP '+r.status);return r.json();};
  try{
   const availability=await this.storage.get('availability:latest');if(!availability||Date.now()-Date.parse(availability.observed_at)>30*60000)throw Error('Fresh scheduled player status is required');
   const ref=await producerRef(REPO);
   const root='https://raw.githubusercontent.com/'+REPO+'/'+ref+'/';
   const [rawProjection,distributions,rawContext,rawPersonnel,schedule]=await Promise.all(['data/probability/weekly-projection-inputs-2026.json','data/probability/generated/weekly-probability-distributions-2026.json','data/probability/weekly-football-context-inputs-2026.json','data/ingestion/team-personnel-2026.json','data/calibration/weekly-event-schedule-2026.json'].map(p=>read(root+p)));
   const projection=compactProjection(rawProjection),personnel=compactPersonnel(rawPersonnel),context={...rawContext,players:Object.fromEntries(Object.entries(rawContext.players||{}).map(([n,p])=>[n,{position:p.position,signals:{role:p.signals?.role,qb_context:p.signals?.qb_context}}]))};
   if(projection.season!==2026||distributions.season!==2026||Number(projection.week)!==Number(schedule.week)||Number(distributions.week)!==Number(schedule.week))throw Error('QB projection and probability week mismatch');
   const previous=await this.storage.get('qb:latest'),anchors=previous?.week===schedule.week?previous.scenarios:{};
   let scenarios=resolveQuarterbacks({personnel,context,schedule,availability,anchors});
   // An adverse starter report must refresh its actual replacement depth chart;
   // it cannot depend on an old GitHub roster being updated first.
   for(const team of [...new Set(Object.values(scenarios).filter(s=>s.report?.out&&Date.parse(s.kickoff)>Date.now()).map(s=>s.team))]){
    const teamId=personnel.teams[team]?.source_url?.match(/\/teams\/(\d+)\/roster/)?.[1];if(!teamId)throw Error(team+': provider team identity missing');
    const [depth,rosterData]=await Promise.all([read(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/depthcharts`),read(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/roster`)]);
    const roster=(rosterData.athletes||[]).flatMap(g=>(g.items||[]).filter(a=>a.position?.abbreviation==='QB').map(a=>({name:a.displayName||a.fullName,athlete_id:String(a.id),team,position:'QB',roster_status:a.status?.name||null,injury_reports:[]})));
    personnel.teams[team]=parseQuarterbackDepth(depth,roster,team,checked_at,`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/depthcharts`);
   }
   scenarios=resolveQuarterbacks({personnel,context,schedule,availability,anchors:{...anchors,...scenarios}});
   const input={projection,distributions,context,personnel,schedule,availability,source_ref:ref,scenarios};
   const output=await this.build(input,scenarios);
   // Freeze the last actually published pregame QB scenario after kickoff.
   for(const [id,s] of Object.entries(output.scenarios))if(Date.parse(s.kickoff)<=Date.now()&&previous?.scenarios?.[id]){
    output.scenarios[id]={...previous.scenarios[id],locked_at:s.kickoff};
    for(const [name,p] of Object.entries(previous.players||{}))if(p.qb_scenario?.game_id===s.game_id&&p.qb_scenario?.team===s.team){output.players[name]=p;output.distributions[name]=previous.distributions[name];}
   }
   const semantic={week:output.week,base_generated_at:output.base_generated_at,scenarios:output.scenarios,players:output.players,model_version:model.version};
   const revision_id=await digest(semantic),status=Object.values(output.scenarios).some(s=>s.status==='REVIEW_REQUIRED')?'PARTIAL':'CURRENT';
   const data={...output,revision_id,status,checked_at,distribution_generated_at:distributions.generated_at,changed_at:previous?.revision_id===revision_id?previous.changed_at:checked_at,collection_event:'cloudflare-cron',availability_capture_id:availability.capture_id,paid_provider_requests:0};
   const existing=await this.storage.get('qb:revision:'+revision_id);
   const writes={'qb:latest':data,'qb:inputs':{...input,revision_id},'qb:status':{status,last_success_at:checked_at,revision_id},[attempt]:{scheduled_time,checked_at,revision_id,status,changed:previous?.revision_id!==revision_id,changed_players:Object.keys(data.players).length,backup_teams:Object.values(data.scenarios).filter(s=>s.status==='BACKUP_EXPECTED').map(s=>s.team),paid_provider_requests:0}};
   if(!existing)writes['qb:revision:'+revision_id]=data;
   for(const [id,s] of Object.entries(output.scenarios)){
    const prior=previous?.scenarios?.[id];
    if(Date.parse(s.kickoff)<=Date.now()||!['BACKUP_EXPECTED','EXPECTED_STARTER','STARTER_INJURY_CONCERN'].includes(s.status))continue;
    const signature=await digest([s.game_id,s.team,s.starter,s.expected_qb,s.status==='BACKUP_EXPECTED']);
    const oldSignature=prior?await digest([prior.game_id,prior.team,prior.starter,prior.expected_qb,prior.status==='BACKUP_EXPECTED']):null;
    if(signature!==oldSignature&&(s.status==='BACKUP_EXPECTED'||prior?.status==='BACKUP_EXPECTED'))writes['props:qb-invalidation:'+s.event_id]={revision_id:signature,observed_at:checked_at,expected_qb:s.expected_qb};
   }
   for(const [k,v] of Object.entries(writes))if(JSON.stringify(v).length>1800000)throw Error('QB artifact exceeds durable storage bound: '+k);
   await this.storage.put(writes);return json(writes[attempt]);
  }catch(e){await this.storage.put('qb:status',{status:'FAILED',last_attempt_at:checked_at,error:e.message});return json({error:e.message},502);}
 }
}
