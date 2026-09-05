import fs from 'node:fs';
import path from 'node:path';

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
  const prior=byId.get(id);
  const evidence=(u.material_news||u.material_news_signals||[]).map(x=>typeof x==='string'
    ? {source:'full-universe-review',observed_at:ledger.sweep_completed_at||new Date().toISOString(),summary:x}
    : {source:x.source||x.url||'full-universe-review',observed_at:x.published||x.observed_at||ledger.sweep_completed_at||new Date().toISOString(),summary:x.headline||x.description||x.summary||u.reason});
  const entry={
    candidate_id:id,
    player_name:u.player,
    team:u.team||'UNKNOWN',
    position:String(u.position||'').toUpperCase(),
    depth_rank:Number.isFinite(Number(u.depth_rank))?Number(u.depth_rank):null,
    role:u.role||null,
    decision:'ADMIT',
    reason:u.reason,
    status:prior?.status||'AWAITING_CALIBRATED_PACKAGE',
    package_path:prior?.package_path||`admissions/packages/${id}.json`,
    evidence:evidence.length?evidence:[{source:'full-universe-review',observed_at:ledger.sweep_completed_at||new Date().toISOString(),summary:u.reason}],
    first_seen_at:prior?.first_seen_at||ledger.sweep_completed_at||new Date().toISOString(),
    last_seen_at:ledger.sweep_completed_at||new Date().toISOString()
  };
  if(prior?.onboarding_complete){
    entry.onboarding_complete=true;
    entry.completed_at=prior.completed_at;
    entry.package_sha256=prior.package_sha256;
  }
  byId.set(id,{...prior,...entry});
  u.admission_request_id=id;
  u.onboarding_manifest=`admissions/queue.json#${id}`;
  u.onboarding_complete=Boolean(byId.get(id).onboarding_complete);
  staged++;
}

queue.entries=[...byId.values()].sort((a,b)=>a.candidate_id.localeCompare(b.candidate_id));
queue.updated_at=new Date().toISOString();
write('admissions/queue.json',queue);
write(ledgerPath,ledger);
console.log(JSON.stringify({result:'PASS',staged,queue_entries:queue.entries.length},null,2));
