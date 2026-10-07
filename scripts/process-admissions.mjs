import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {generateAdmission} from './generate-admission-package.mjs';
import {buildExcelExport} from '../lib/canonical-excel-export.mjs';
import {weights,score} from '../lib/admission-model.mjs';

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
  const allowedOutputs=new Set(['MODEL_SOURCE_OF_TRUTH.json','guardrails/guardrails-config.json','guardrails/universe-change-manifest.json','canonicalBoards2026.json','lockedRanks2026.json','data/probability/weekly-football-context-inputs-2026.json','data/probability/weekly-projection-inputs-2026.json',truth.current_update_layer]);
  for(const file of Object.keys(repl))if(!allowedOutputs.has(file)&&!/^players\d+\.json$/.test(file))errors.push(`unapproved admission output ${file}`);
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
    for(const k of required) if(typeof p[k]!=='number'||!Number.isFinite(p[k])) errors.push(`${p.n} missing/invalid ${k}`);
    for(const [k,[lo,hi]] of Object.entries(bounds)){const v=Number(p[k]);if(Number.isFinite(v)&&(v<lo||v>hi)) errors.push(`${p.n} ${k}=${v} outside ${lo}-${hi}`);}
    if(errors.length>=100) break;
  }
  if(pkg.integration.baseline_sha256){
    const allowed=new Set(['MODEL_SOURCE_OF_TRUTH.json','guardrails/guardrails-config.json','guardrails/universe-change-manifest.json','canonicalBoards2026.json','lockedRanks2026.json',truth.current_update_layer]);
    for(const f of Object.keys(repl))if(!allowedOutputs.has(f)&&!/^players\d+\.json$/.test(f))errors.push(`unapproved admission output ${f}`);
    for(const f of allowed)if(!Object.hasOwn(repl,f))errors.push(`missing synchronized output ${f}`);
    for(const file of ['data/probability/weekly-football-context-inputs-2026.json','data/probability/weekly-projection-inputs-2026.json']){
      if(!exists(file,base))continue;
      const old=read(file,base),next=repl[file];
      if(!next?.players?.[entry.player_name]||next.players[entry.player_name].status!=='REVIEW_REQUIRED'||next.players[entry.player_name].actionable!==false)errors.push(`weekly admission not safely synchronized ${file}`);
      for(const [n,p]of Object.entries(old.players||{}))if(JSON.stringify(next?.players?.[n])!==JSON.stringify(p))errors.push(`unrelated weekly mutation ${n}`);
    }
    const prior=before.map(p=>({...p,...read(truth.current_update_layer,base).players?.[p.n]}));
    const byName=new Map(after.map(p=>[p.n,p]));
    for(const p of prior){const q=byName.get(p.n);if(!q){errors.push(`existing player removed ${p.n}`);continue;}
      for(const k of Object.keys(p))if(!['o','tr','pr','tp'].includes(k)&&JSON.stringify(p[k])!==JSON.stringify(q[k]))errors.push(`unrelated model mutation ${p.n}.${k}`);
    }
    for(const rank of ['o','tr']){
      const oldOrder=[...prior].sort((a,b)=>a[rank]-b[rank]).map(p=>p.n);
      const newOrder=after.filter(p=>p.n!==entry.player_name).sort((a,b)=>a[rank]-b[rank]).map(p=>p.n);
      if(JSON.stringify(oldOrder)!==JSON.stringify(newOrder))errors.push(`unrelated ${rank} reorder`);
    }
    const candidate=byName.get(entry.player_name);
    if(candidate&&Math.abs(candidate.s-score(candidate))>1e-6)errors.push('admitted score does not match canonical seven-component formula');
    if(candidate&&(candidate.ad!==null||candidate.px!=='PRICE PENDING'))errors.push('new admission must keep archival ADP inactive and market price pending');
    const board=repl['canonicalBoards2026.json'],locks=repl['lockedRanks2026.json'],patch=repl[truth.current_update_layer],config=repl['guardrails/guardrails-config.json'];
    if(config?.authoritative_player_count!==afterCount||config?.authoritative_player_shards!==afterShards)errors.push('guardrail config count/shards not synchronized');
    for(const key of ['overall','trueValue'])if(board?.[key]?.length!==afterCount)errors.push(`board ${key} count mismatch`);
    if(board?.active_players!==afterCount||Object.keys(locks?.players||{}).length!==afterCount)errors.push('board/locked rank coverage mismatch');
    for(const p of after){
      if(JSON.stringify(patch?.players?.[p.n])!==JSON.stringify(p))errors.push(`current patch mismatch ${p.n}`);
      if(locks?.players?.[p.n]?.trueValueRank!==p.tr||locks?.players?.[p.n]?.trueValuePos!==p.tp)errors.push(`locked rank mismatch ${p.n}`);
      for(const key of ['overall','trueValue']){const row=board?.[key]?.find(x=>x.n===p.n);if(JSON.stringify(row)!==JSON.stringify(p))errors.push(`board row mismatch ${key} ${p.n}`);}
    }
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
  if(entry.status==='COMPLETE') {
    const truth=read('MODEL_SOURCE_OF_TRUTH.json',base);
    if(loadPlayers(base,Number(truth.runtime_player_shards)).filter(p=>p.n===entry.player_name).length!==1)throw new Error('COMPLETE candidate missing from current canonical universe');
    return {result:'PASS',candidate_id:candidateId,status:'COMPLETE',idempotent:true};
  }
  if(!exists(entry.package_path,base)) {
    const staged=generateAdmission({base,entry});
    entry.status=staged.status;entry.blockers=staged.blockers||[];
    entry.staged_path=`admissions/staged/${candidateId}.json`;
    writeAtomic(queuePath,q,base);
    if(!staged.package) throw new Error(`admission staged with missing model inputs: ${entry.blockers.join('; ')}`);
  }
  const pkg=read(entry.package_path,base),pe=validatePackageShape(pkg,entry);
  if(pe.length) throw new Error(`package invalid: ${pe.join('; ')}`);
  const cfg=read('guardrails/guardrails-config.json',base),truth=read('MODEL_SOURCE_OF_TRUTH.json',base);
  if(pkg.integration.baseline_sha256){
    const baseline={truth,players:loadPlayers(base,Number(truth.runtime_player_shards)),patch:read(truth.current_update_layer,base)};
    if(sha256(baseline)!==pkg.integration.baseline_sha256)throw new Error('stale admission baseline; regenerate against current canonical state');
  }
  const postErrors=validatePostState({base,entry,pkg,cfg,truth});
  if(postErrors.length) throw new Error(`post-state invalid: ${postErrors.slice(0,30).join('; ')}`);
  const digest=sha256(pkg);
  if(!apply) return {result:'PASS',candidate_id:candidateId,status:'READY_FOR_APPLY',package_sha256:digest,post_count:Number(pkg.integration.expected_after_count)};
  entry.status='COMPLETE';entry.onboarding_complete=true;entry.completed_at=new Date().toISOString();entry.package_sha256=digest;
  const workbook=buildExcelExport(loadPlayers(base,pkg.integration.expected_after_shards,pkg.integration.canonical_files),pkg.integration.canonical_files['MODEL_SOURCE_OF_TRUTH.json']);
  const workbookDigest=crypto.createHash('sha256').update(workbook).digest('hex');
  const completion={version:1,candidate_id:candidateId,player_name:entry.player_name,completed_at:entry.completed_at,package_path:entry.package_path,package_sha256:digest,excel_sha256:workbookDigest,post_count:pkg.integration.expected_after_count};
  // Include ledger, completion and Excel in the same rollback transaction as the canonical JSON.
  const outputs={...pkg.integration.canonical_files,[queuePath]:q,[`admissions/completed/${candidateId}.json`]:completion};
  const bytes=new Map(Object.entries(outputs).map(([f,v])=>[f,Buffer.from(JSON.stringify(v,null,2)+'\n')]));
  bytes.set('exports/fantasy-2026-current.xlsx',Buffer.from(workbook));
  const originals=new Map([...bytes.keys()].map(f=>[f,exists(f,base)?fs.readFileSync(path.join(base,f)):null]));
  try{for(const [file,value] of bytes){const dst=path.join(base,file);fs.mkdirSync(path.dirname(dst),{recursive:true});const tmp=`${dst}.tmp-${process.pid}`;fs.writeFileSync(tmp,value);fs.renameSync(tmp,dst);}}
  catch(error){for(const [file,value] of originals){const dst=path.join(base,file);if(value===null)fs.rmSync(dst,{force:true});else fs.writeFileSync(dst,value);}throw error;}
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
