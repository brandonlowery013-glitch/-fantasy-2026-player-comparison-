import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {validateQueueEntry} from './process-admissions.mjs';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const exists=p=>fs.existsSync(path.join(root,p));
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const errors=[];
const source=read('MODEL_SOURCE_OF_TRUTH.json');
let active=[];
for(let i=0;i<Number(source.runtime_player_shards);i++) active.push(...read(`players${i}.json`));
const activeNames=active.map(x=>x.n),activeSet=new Set(activeNames);
if(active.length!==Number(source.active_player_model)) errors.push(`active player count ${active.length} != ${source.active_player_model}`);
if(activeSet.size!==active.length) errors.push('duplicate active player names');

if(!exists('admissions/queue.json')) errors.push('missing admissions/queue.json');
else{
  const q=read('admissions/queue.json');
  if(q.version!==1||!Array.isArray(q.entries)) errors.push('admissions/queue.json must be version 1 with entries[]');
  const ids=(q.entries||[]).map(x=>x.candidate_id);
  if(new Set(ids).size!==ids.length) errors.push('duplicate candidate_id values');
  for(const e of q.entries||[]){
    errors.push(...validateQueueEntry(e).map(x=>`${e.candidate_id||'UNKNOWN'}: ${x}`));
    const activeCopies=activeNames.filter(n=>n===e.player_name).length;
    if(e.status!=='COMPLETE') errors.push(`${e.player_name} admission remains pending (${e.status||'UNKNOWN'})`);
    if(e.status==='COMPLETE'){
      if(e.onboarding_complete!==true) errors.push(`${e.player_name} COMPLETE queue entry missing onboarding_complete=true`);
      if(activeCopies!==1) errors.push(`${e.player_name} COMPLETE admission must exist exactly once in active universe; found ${activeCopies}`);
      const completedPath=`admissions/completed/${e.candidate_id}.json`;
      if(!exists(completedPath)) errors.push(`${e.player_name} missing completion manifest ${completedPath}`);
      if(!e.package_path||!exists(e.package_path)) errors.push(`${e.player_name} missing calibrated package ${e.package_path||''}`);
      if(e.package_path&&exists(e.package_path)){
        const digest=hash(read(e.package_path));
        if(e.package_sha256!==digest) errors.push(`${e.player_name} package SHA does not match queue`);
        if(exists(completedPath)){
          const done=read(completedPath);
          if(done.package_sha256!==digest) errors.push(`${e.player_name} completion manifest package SHA mismatch`);
        }
      }
    }else if(activeCopies>0) errors.push(`${e.player_name} is active before admission completion`);
  }
}

const report={generated_at:new Date().toISOString(),canonical_player_count:Number(source.active_player_model),result:errors.length?'BLOCKED':'PASS',errors};
fs.writeFileSync(path.join(root,'guardrails/admission-state-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(errors.length) process.exit(1);
