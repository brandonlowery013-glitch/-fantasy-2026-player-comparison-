import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {weights,numeric,fitProduction,score} from '../lib/admission-model.mjs';
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const read=(base,p)=>JSON.parse(fs.readFileSync(path.join(base,p),'utf8'));
const write=(base,p,x)=>{const f=path.join(base,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(x,null,2)+'\n');};
export function generateAdmission({base=process.cwd(),entry,input=null,now=new Date().toISOString(),persist=true}){
  const truth=read(base,'MODEL_SOURCE_OF_TRUTH.json'),before=[];
  for(let i=0;i<truth.runtime_player_shards;i++)before.push(...read(base,`players${i}.json`));
  if(before.length!==truth.active_player_model||new Set(before.map(p=>p.n)).size!==before.length)throw Error('Canonical pre-state count/identity mismatch');
  const patch=read(base,truth.current_update_layer);
  const effective=before.map(p=>({...p,...patch.players?.[p.n]}));
  if(effective.some(p=>p.n===entry.player_name))return {status:'ALREADY_CANONICAL',canonical_count:before.length};
  const inputPath=`admissions/inputs/${entry.candidate_id}.json`;
  if(!input&&fs.existsSync(path.join(base,inputPath)))input=read(base,inputPath);
  const calPath=`admissions/calibrations/${entry.candidate_id}.json`;
  if(!input&&fs.existsSync(path.join(base,calPath))){
    const cal=read(base,calPath),p=cal.player_record||{};
    input=cal.model_inputs||{player_name:cal.player_name,team:p.t,position:p.p,calibration:cal,
      roster_review:cal.roster_review,projection:{mp:p.mp,method:cal.projection_method,source:cal.source},
      components:Object.fromEntries(Object.keys(weights).map(k=>[k,{value:p[k],method:cal.component_methods?.[k],source:cal.component_sources?.[k]}])),
      overall_rank:p.o,overall_review:cal.overall_review,writeup:p,connected_review:cal.connected_review,consumer_review:cal.consumer_review};
  }
  const blockers=[];
  if(!input?.calibration?.method||!input?.calibration?.source_run)blockers.push('REVIEWED_CALIBRATION_METHOD_AND_SOURCE_RUN');
  if(input?.calibration?.reviewed!==true)blockers.push('CALIBRATION_REVIEW');
  if(input?.player_name!==entry.player_name||input?.team!==entry.team||input?.position!==entry.position)blockers.push('CURRENT_ROSTER_IDENTITY_REVIEW');
  if(input?.roster_review?.status!=='ACTIVE_FANTASY_ROLE'||!input?.roster_review?.source||!input?.roster_review?.as_of)blockers.push('SOURCED_CURRENT_ACTIVE_ROLE_REVIEW');
  const reviewAge=(Date.parse(now)-Date.parse(input?.roster_review?.as_of))/86400000;
  if(!Number.isFinite(reviewAge)||reviewAge<0||reviewAge>7)blockers.push('CURRENT_ROSTER_REVIEW_WITHIN_7_DAYS');
  if(!numeric(input?.projection?.mp)||input.projection.mp<0||!input?.projection?.method||!input?.projection?.source)blockers.push('CALIBRATED_ROS_PPR_PROJECTION');
  const components={};
  for(const k of Object.keys(weights)){
    const v=input?.components?.[k];
    if(k==='pd'&&!v){const fitted=fitProduction(effective,entry.position,input?.projection?.mp);if(fitted!==null){components.pd=fitted;continue;}}
    if(!numeric(v?.value)||v.value<0||v.value>10||!v?.method||!v?.source)blockers.push(`CALIBRATED_COMPONENT_${k.toUpperCase()}`);else components[k]=v.value;
  }
  // Overall/actionable is a separately reviewed overlay, never inferred from ECR/ADP or TV score.
  if(!Number.isInteger(input?.overall_rank)||input.overall_rank<1||input.overall_rank>before.length+1||!input?.overall_review?.method||!input?.overall_review?.source)blockers.push('REVIEWED_OVERALL_ACTIONABLE_PLACEMENT');
  for(const k of ['m','cl','en','nm','na','current_recommendation'])if(!input?.writeup?.[k])blockers.push(`COMPARISON_WRITEUP_${k.toUpperCase()}`);
  const teammates=effective.filter(p=>p.t===entry.team).map(p=>p.n);
  if(!Array.isArray(input?.connected_review)||teammates.some(n=>!input.connected_review.some(x=>x.player===n&&x.decision==='HOLD'&&x.reason&&x.source)))blockers.push('CONNECTED_TEAMMATE_HOLD_REVIEW');
  const consumerReview={runtime:{source:'lib/canonical-player-source.mjs'},site:{source:'index.html'},excel:{source:'lib/canonical-excel-export.mjs'},word:{source:'lib/canonical-word-export.mjs'}};
  const dossier={version:1,candidate_id:entry.candidate_id,player_name:entry.player_name,team:entry.team,position:entry.position,decision:'ADMIT',generated_at:now,canonical_before:{players:before.length,shards:truth.runtime_player_shards},expected_after_count:before.length+1,input_path:inputPath,evidence:entry.evidence,components,score: blockers.some(x=>x.startsWith('CALIBRATED_COMPONENT'))?null:score(components),connected_teammates:teammates,blockers,status:blockers.length?'BLOCKED_MODEL_INPUTS':'READY_FOR_APPLY',market_status:'PRICE PENDING',adp_status:'ARCHIVAL_INACTIVE'};
  let pkg=null;
  if(!blockers.length){
    const row={...input.writeup,n:entry.player_name,p:entry.position,t:entry.team,...components,s:score(components),mp:input.projection.mp,ad:null,cp:null,px:'PRICE PENDING',fw:'PRICE PENDING',market_as_of:null,market_source:null,projection_context:{method:input.projection.method,source:input.projection.source,recalibrated_projected_ppr:input.projection.mp}};
    const tv=effective.toSorted((a,b)=>a.tr-b.tr);const insertion=tv.findIndex(p=>p.s<row.s);tv.splice(insertion<0?tv.length:insertion,0,row);
    const ov=effective.toSorted((a,b)=>a.o-b.o);ov.splice(input.overall_rank-1,0,row);
    for(const [list,rank,posRank]of [[tv,'tr','tp'],[ov,'o','pr']]){const counts={};list.forEach((p,i)=>{p[rank]=i+1;counts[p.p]=(counts[p.p]||0)+1;p[posRank]=`${p.p}${counts[p.p]}`;});}
    // Preserve the current relative ordering and every existing component/projection; only insertion shifts ranks.
    const all=[...effective,row],files={};const sizes=[];
    for(let i=0;i<truth.runtime_player_shards;i++)sizes.push(read(base,`players${i}.json`).length);
    const capacity=Math.max(...sizes);if(sizes.at(-1)>=capacity)sizes.push(1);else sizes[sizes.length-1]++;
    let offset=0;sizes.forEach((size,i)=>{files[`players${i}.json`]=all.slice(offset,offset+size);offset+=size;});
    files['MODEL_SOURCE_OF_TRUTH.json']={...truth,active_player_model:all.length,runtime_player_shards:sizes.length,effective_date:now.slice(0,10),current_update_layer_effective_date:now.slice(0,10),status:'authoritative_current_fluid_universe_admission'};
    files[truth.current_update_layer]={...patch,updated:now.slice(0,10),players:{...patch.players,...Object.fromEntries(all.map(p=>[p.n,p]))}};
    // Weekly membership follows the universe immediately. Missing week-specific calibration remains explicit and nonactionable.
    for(const file of ['data/probability/weekly-football-context-inputs-2026.json','data/probability/weekly-projection-inputs-2026.json']){
      if(!fs.existsSync(path.join(base,file)))continue;
      const weekly=read(base,file);
      files[file]={...weekly,players:{...weekly.players,[row.n]:{position:row.p,status:'REVIEW_REQUIRED',context_status:'REVIEW_REQUIRED',source_context_status:'REVIEW_REQUIRED',projections:{},signals:{},actionable:false,reason:'New canonical admission: current-week football inputs require sourced review; season projection is not a weekly stat projection.'}}};
    }
    const cfg=read(base,'guardrails/guardrails-config.json');files['guardrails/guardrails-config.json']={...cfg,authoritative_player_count:all.length,authoritative_player_shards:sizes.length};
    const boards=read(base,'canonicalBoards2026.json');files['canonicalBoards2026.json']={...boards,updated:now.slice(0,10),active_players:all.length,overall:ov,trueValue:tv,positions:Object.fromEntries(['QB','RB','WR','TE'].map(pos=>[pos,tv.filter(p=>p.p===pos)]))};
    const locks=read(base,'lockedRanks2026.json');files['lockedRanks2026.json']={...locks,as_of:now.slice(0,10),players:Object.fromEntries(all.map(p=>[p.n,{...locks.players?.[p.n],trueValueRank:p.tr,trueValuePos:p.tp}]))};
    const manifest=read(base,'guardrails/universe-change-manifest.json');files['guardrails/universe-change-manifest.json']={...manifest,changes:[...(manifest.changes||[]),{action:'ADMIT',player:entry.player_name,from_count:before.length,to_count:all.length,reason:entry.reason,source:entry.evidence.map(x=>x.source||x.url||x.summary).join('; ')}]};
    pkg={version:1,candidate_id:entry.candidate_id,player_name:entry.player_name,calibration:{...input.calibration,generated_at:now,input_sha256:hash(input),production_rule:input.components?.pd?'REVIEWED_COMPONENT_TARGET':'EXISTING_NEAREST_12_POSITIONAL_REGRESSION',weights},integration:{expected_before_count:before.length,expected_after_count:all.length,expected_before_shards:truth.runtime_player_shards,expected_after_shards:sizes.length,baseline_sha256:hash({truth,players:before,patch}),canonical_files:files},onboarding_review:{connected_review:input.connected_review,consumer_review:consumerReview,market_status:'PRICE PENDING'}};
    dossier.package_sha256=hash(pkg);
  }
  if(persist){write(base,`admissions/staged/${entry.candidate_id}.json`,dossier);if(pkg)write(base,entry.package_path,pkg);}
  return {...dossier,package:pkg};
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname){
  const q=read(process.cwd(),'admissions/queue.json'),id=process.argv[2];
  const entries=q.entries.filter(e=>e.status!=='COMPLETE'&&(!id||id===e.candidate_id));
  if(id&&!entries.length){if(q.entries.some(e=>e.candidate_id===id&&e.status==='COMPLETE')){console.log(JSON.stringify({candidate_id:id,status:'COMPLETE',idempotent:true}));process.exit(0);}throw Error(`No pending candidate: ${id}`);}
  for(const entry of entries){const result=generateAdmission({entry});entry.status=result.status;entry.blockers=result.blockers||[];entry.staged_path=`admissions/staged/${entry.candidate_id}.json`;console.log(JSON.stringify({candidate_id:entry.candidate_id,status:entry.status,blockers:entry.blockers}));}
  write(process.cwd(),'admissions/queue.json',q);
}
