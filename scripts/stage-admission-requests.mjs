import fs from 'node:fs';
import path from 'node:path';
import {generateAdmission} from './generate-admission-package.mjs';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(x,null,2)+'\n');};
const slug=s=>String(s||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

const ledgerPath=process.env.FULL_UNIVERSE_REVIEW_LEDGER||'guardrails/current-football-review.json';
const ledger=read(ledgerPath);
const queue=read('admissions/queue.json');
if(queue.version!==1||!Array.isArray(queue.entries)) throw new Error('admissions/queue.json invalid');
const byId=new Map(queue.entries.map(x=>[x.candidate_id,x]));
let staged=0;

for(const u of ledger.materially_implicated_untracked||[]){
  if(u.decision!=='ADMIT') continue;
  const id=slug(`${u.player}-${u.team||'nfl'}-${u.position||'player'}`);
  const prior=byId.get(id)||[...byId.values()].find(e=>e.player_name===u.player);
  const candidateId=prior?.candidate_id||id;
  const evidence=(u.material_news||u.material_news_signals||[]).map(x=>typeof x==='string'
    ? {source:'full-universe-review',observed_at:ledger.sweep_completed_at||new Date().toISOString(),summary:x}
    : {source:x.source||x.url||'full-universe-review',observed_at:x.published||x.observed_at||ledger.sweep_completed_at||new Date().toISOString(),summary:x.headline||x.description||x.summary||u.reason});
  const entry={
    candidate_id:candidateId,
    player_name:u.player,
    team:u.team||'UNKNOWN',
    position:String(u.position||'').toUpperCase(),
    depth_rank:Number.isFinite(Number(u.depth_rank))?Number(u.depth_rank):null,
    role:u.role||null,
    decision:'ADMIT',
    reason:u.reason,
    status:prior?.status||'AWAITING_CALIBRATED_PACKAGE',
    package_path:prior?.package_path||`admissions/packages/${candidateId}.json`,
    evidence:evidence.length? [...(prior?.evidence||[]),...evidence].filter((e,i,a)=>a.findIndex(x=>JSON.stringify(x)===JSON.stringify(e))===i):[{source:'full-universe-review',observed_at:ledger.sweep_completed_at||new Date().toISOString(),summary:u.reason}],
    first_seen_at:prior?.first_seen_at||ledger.sweep_completed_at||new Date().toISOString(),
    last_seen_at:ledger.sweep_completed_at||new Date().toISOString()
  };
  if(prior?.onboarding_complete){
    entry.onboarding_complete=true;
    entry.completed_at=prior.completed_at;
    entry.package_sha256=prior.package_sha256;
  }
  entry.review_history=[...(prior?.review_history||[]),{as_of:ledger.sweep_completed_at,decision:u.decision,reason:u.reason}].filter((e,i,a)=>a.findIndex(x=>JSON.stringify(x)===JSON.stringify(e))===i);
  if(u.calibration){
    // Keep prior reviewed sweep payloads even when the new model-input contract is incomplete.
    write(`admissions/calibrations/${candidateId}.json`,u.calibration);
  }
  if(u.model_inputs)write(`admissions/inputs/${candidateId}.json`,u.model_inputs);
  if(!entry.onboarding_complete){
    const generated=generateAdmission({entry});
    entry.status=generated.status;entry.blockers=generated.blockers||[];
    entry.staged_path=`admissions/staged/${candidateId}.json`;
  }
  byId.set(candidateId,{...prior,...entry});
  u.admission_request_id=candidateId;
  u.onboarding_manifest=`admissions/queue.json#${candidateId}`;
  u.onboarding_complete=Boolean(byId.get(candidateId).onboarding_complete);
  staged++;
}

queue.entries=[...byId.values()].sort((a,b)=>a.candidate_id.localeCompare(b.candidate_id));
queue.updated_at=new Date().toISOString();
write('admissions/queue.json',queue);
write(ledgerPath,ledger);
console.log(JSON.stringify({result:'PASS',staged,queue_entries:queue.entries.length},null,2));
