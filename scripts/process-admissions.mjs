import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=process.cwd();
const read=(p,base=root)=>JSON.parse(fs.readFileSync(path.join(base,p),'utf8'));
const exists=(p,base=root)=>fs.existsSync(path.join(base,p));
const writeAtomic=(p,value,base=root)=>{const dst=path.join(base,p);fs.mkdirSync(path.dirname(dst),{recursive:true});const tmp=`${dst}.tmp-${process.pid}`;fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n');fs.renameSync(tmp,dst);};
const sha256=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const norm=s=>String(s||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

export function validateQueueEntry(entry){
  const errors=[];
  for(const k of ['candidate_id','player_name','team','position','decision','status','package_path']) if(!entry?.[k]) errors.push(`missing ${k}`);
  if(entry?.decision!=='ADMIT') errors.push('decision must be ADMIT');
  if(entry?.position&&!['QB','RB','WR','TE'].includes(String(entry.position).toUpperCase())) errors.push(`invalid position ${entry.position}`);
  if(entry?.candidate_id&&entry.candidate_id!==norm(entry.candidate_id)) errors.push('candidate_id must be normalized kebab-case');
  if(entry?.package_path&&!String(entry.package_path).startsWith('admissions/packages/')) errors.push('package_path must be under admissions/packages/');
  if(!Array.isArray(entry?.evidence)||entry.evidence.length===0) errors.push('evidence must contain at least one item');
  return errors;
}

export function validatePackageShape(pkg,entry){
  const errors=[];
  if(!pkg||pkg.version!==1) errors.push('package version must be 1');
  if(pkg?.candidate_id!==entry.candidate_id) errors.push('package candidate_id does not match queue entry');
  if(pkg?.player_name!==entry.player_name) errors.push('package player_name does not match queue entry');
  if(pkg?.calibration?.reviewed!==true) errors.push('calibration.reviewed must be true');
  for(const k of ['method','generated_at','source_run']) if(!pkg?.calibration?.[k]) errors.push(`calibration.${k} is required`);
  const integ=pkg?.integration;
  for(const k of ['expected_before_count','expected_after_count','expected_before_shards','expected_after_shards']) if(!Number.isInteger(Number(integ?.[k]))) errors.push(`integration.${k} must be an integer`);
  if(Number(integ?.expected_after_count)!==Number(integ?.expected_before_count)+1) errors.push('expected_after_count must equal expected_before_count + 1');
  if(!integ?.canonical_files||typeof integ.canonical_files!=='object'||Array.isArray(integ.canonical_files)) errors.push('integration.canonical_files must be an object of complete JSON replacements');
  const files=Object.keys(integ?.canonical_files||{});
  if(!files.includes('MODEL_SOURCE_OF_TRUTH.json')) errors.push('canonical_files must include MODEL_SOURCE_OF_TRUTH.json');
  if(!files.includes('guardrails/universe-change-manifest.json')) errors.push('canonical_files must include guardrails/universe-change-manifest.json');
  if(!files.some(f=>/^players\d+\.json$/.test(f))) errors.push('canonical_files must include at least one player shard');
  if(files.some(f=>path.isAbsolute(f)||f.includes('..'))) errors.push('canonical_files contains unsafe path');
  return errors;
}

function loadPlayers(base,shards,replacements={}){
  let players=[];
  for(let i=0;i<shards;i++){
    const file=`players${i}.json`;
    const shard=Object.hasOwn(replacements,file)?replacements[file]:read(file,base);
    if(!Array.isArray(shard)) throw new Error(`${file} is not an array`);
    players.push(...shard);
  }
  return players;
}

export function validatePostState({base=root,entry,pkg,cfg,truth}){
  const errors=[];
  const repl=pkg.integration.canonical_files;
  const beforeCount=Number(truth.active_player_model),beforeShards=Number(truth.runtime_player_shards);
  if(Number(pkg.integration.expected_before_count)!==beforeCount) errors.push(`expected_before_count ${pkg.integration.expected_before_count} != canonical ${beforeCount}`);
  if(Number(pkg.integration.expected_before_shards)!==beforeShards) errors.push(`expected_before_shards ${pkg.integration.expected_before_shards} != canonical ${beforeShards}`);
  const before=loadPlayers(base,beforeShards,{});
  if(before.some(p=>p.n===entry.player_name)) errors.push(`${entry.player_name} is already active`);
  const nextTruth=repl['MODEL_SOURCE_OF_TRUTH.json'];
  const afterCount=Number(pkg.integration.expected_after_count),afterShards=Number(pkg.integration.expected_after_shards);
  if(Number(nextTruth?.active_player_model)!==afterCount) errors.push('replacement MODEL_SOURCE_OF_TRUTH active_player_model mismatch');
  if(Number(nextTruth?.runtime_player_shards)!==afterShards) errors.push('replacement MODEL_SOURCE_OF_TRUTH runtime_player_shards mismatch');
  let after=[];
  try{after=loadPlayers(base,afterShards,repl);}catch(e){errors.push(e.message);return errors;}
  if(after.length!==afterCount) errors.push(`post-state player count ${after.length} != ${afterCount}`);
  const names=after.map(p=>p.n);
  if(new Set(names).size!==after.length) errors.push('post-state contains duplicate player names');
  if(names.filter(n=>n===entry.player_name).length!==1) errors.push(`${entry.player_name} must exist exactly once in post-state`);
  for(const field of ['o','tr']){
    const ranks=after.map(p=>Number(p[field])).sort((a,b)=>a-b);
    ranks.forEach((v,i)=>{if(v!==i+1&&errors.length<100) errors.push(`${field} rank gap/collision at ${i+1}: ${v}`);});
  }
  const required=cfg.required_player_numeric_fields||[],bounds=cfg.numeric_bounds||{};
  for(const p of after){
    for(const k of required) if(!Number.isFinite(Number(p[k]))) errors.push(`${p.n} missing/invalid ${k}`);
    for(const [k,[lo,hi]] of Object.entries(bounds)){const v=Number(p[k]);if(Number.isFinite(v)&&(v<lo||v>hi)) errors.push(`${p.n} ${k}=${v} outside ${lo}-${hi}`);}
    if(errors.length>=100) break;
  }
  const manifest=repl['guardrails/universe-change-manifest.json'];
  const changes=Array.isArray(manifest?.changes)?manifest.changes:[];
  const admission=changes.find(x=>x.player===entry.player_name&&['ADMIT','MODEL_CHANGE'].includes(x.action));
  if(!admission||!admission.reason||!admission.source) errors.push('universe-change manifest lacks sourced admission entry');
  return errors;
}

export function processAdmission({base=root,candidateId,apply=false}){
  const queuePath='admissions/queue.json';
  const q=read(queuePath,base);
  if(q.version!==1||!Array.isArray(q.entries)) throw new Error('admissions/queue.json must be version 1 with entries[]');
  const ids=q.entries.map(x=>x.candidate_id);
  if(new Set(ids).size!==ids.length) throw new Error('admission queue has duplicate candidate_id values');
  const entry=q.entries.find(x=>x.candidate_id===candidateId);
  if(!entry) throw new Error(`candidate not found: ${candidateId}`);
  const qe=validateQueueEntry(entry);
  if(qe.length) throw new Error(`queue entry invalid: ${qe.join('; ')}`);
  if(entry.status==='COMPLETE') return {result:'PASS',candidate_id:candidateId,status:'COMPLETE',idempotent:true};
  if(!exists(entry.package_path,base)) throw new Error(`calibrated model package missing: ${entry.package_path}`);
  const pkg=read(entry.package_path,base),pe=validatePackageShape(pkg,entry);
  if(pe.length) throw new Error(`package invalid: ${pe.join('; ')}`);
  const cfg=read('guardrails/guardrails-config.json',base),truth=read('MODEL_SOURCE_OF_TRUTH.json',base);
  const postErrors=validatePostState({base,entry,pkg,cfg,truth});
  if(postErrors.length) throw new Error(`post-state invalid: ${postErrors.slice(0,30).join('; ')}`);
  const digest=sha256(pkg);
  if(!apply) return {result:'PASS',candidate_id:candidateId,status:'READY_FOR_APPLY',package_sha256:digest,post_count:Number(pkg.integration.expected_after_count)};
  for(const [file,value] of Object.entries(pkg.integration.canonical_files)) writeAtomic(file,value,base);
  entry.status='COMPLETE';entry.onboarding_complete=true;entry.completed_at=new Date().toISOString();entry.package_sha256=digest;
  writeAtomic(queuePath,q,base);
  writeAtomic(`admissions/completed/${candidateId}.json`,{version:1,candidate_id:candidateId,player_name:entry.player_name,completed_at:entry.completed_at,package_path:entry.package_path,package_sha256:digest,post_count:Number(pkg.integration.expected_after_count)},base);
  return {result:'PASS',candidate_id:candidateId,status:'COMPLETE',package_sha256:digest,post_count:Number(pkg.integration.expected_after_count)};
}

function main(){
  const args=process.argv.slice(2),apply=args.includes('--apply'),validateQueue=args.includes('--validate-queue');
  if(validateQueue){
    const q=read('admissions/queue.json'),errors=[];
    if(q.version!==1||!Array.isArray(q.entries)) errors.push('queue must be version 1 with entries[]');
    const ids=(q.entries||[]).map(x=>x.candidate_id);if(new Set(ids).size!==ids.length) errors.push('duplicate candidate_id');
    for(const e of q.entries||[]) errors.push(...validateQueueEntry(e).map(x=>`${e.candidate_id||'UNKNOWN'}: ${x}`));
    if(errors.length) throw new Error(errors.join('; '));
    console.log(JSON.stringify({result:'PASS',entries:q.entries.length},null,2));return;
  }
  const candidateId=args.find(x=>!x.startsWith('--'));
  if(!candidateId) throw new Error('usage: node scripts/process-admissions.mjs [--apply] <candidate_id> OR --validate-queue');
  console.log(JSON.stringify(processAdmission({candidateId,apply}),null,2));
}

if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)) main();
