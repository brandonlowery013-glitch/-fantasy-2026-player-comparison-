import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const source=read('MODEL_SOURCE_OF_TRUTH.json');
const count=Number(source.active_player_model),shards=Number(source.runtime_player_shards);
let names=[];
for(let i=0;i<shards;i++) names.push(...read(`players${i}.json`).map(p=>p.n));
if(names.length!==count) throw new Error(`fixture universe ${names.length} != ${count}`);
if(new Set(names).size!==names.length) throw new Error('fixture universe contains duplicate names');

const tmpDir='guardrails/.tmp-full-universe-review-test';
fs.mkdirSync(path.join(root,tmpDir),{recursive:true});
const run=file=>spawnSync(process.execPath,['scripts/validate-full-universe-news-review.mjs'],{cwd:root,encoding:'utf8',env:{...process.env,FULL_UNIVERSE_REVIEW_LEDGER:file}});
const write=(name,obj)=>{const rel=`${tmpDir}/${name}.json`;fs.writeFileSync(path.join(root,rel),JSON.stringify(obj,null,2)+'\n');return rel;};
const entry=player=>({player,status:'REVIEWED_NO_CHANGE',reviewed_at:'2026-09-01T13:00:00Z',categories_checked:['injury','transactions','depth_chart','role_usage','offensive_environment']});
const base=()=>({season:2026,phase:'REGULAR_SEASON',camp_preseason_mode:false,review_scope:'FULL_ACTIVE_UNIVERSE_PLUS_CONNECTED',active_player_count:count,active_player_shards:shards,sweep_started_at:'2026-09-01T12:00:00Z',sweep_completed_at:'2026-09-01T13:00:00Z',players:names.map(entry),materially_implicated_untracked:[]});
const assert=(condition,message)=>{if(!condition)throw new Error(message)};

try{
  const incomplete=base();incomplete.players.pop();
  let r=run(write('incomplete',incomplete));
  assert(r.status!==0,`negative test failed: incomplete ${count-1}/${count} ledger was accepted`);
  assert((r.stdout+r.stderr).includes('active players missing football review'),'negative test failed for wrong reason');

  const duplicate=base();duplicate.players.push({...duplicate.players[0]});
  r=run(write('duplicate',duplicate));
  assert(r.status!==0,'negative test failed: duplicate review was accepted');
  assert((r.stdout+r.stderr).includes('duplicate reviewed players'),'duplicate test failed for wrong reason');

  const badAdmit=base();
  badAdmit.materially_implicated_untracked=[{player:'TEST CONNECTED PLAYER',team:'CHI',position:'RB',depth_rank:1,decision:'ADMIT',reason:'material connected opportunity',onboarding_complete:false}];
  r=run(write('bad-admit',badAdmit));
  assert(r.status!==0,'negative test failed: unstaged/incomplete ADMIT onboarding was accepted');
  assert((r.stdout+r.stderr).includes('admission_request_id is missing'),'ADMIT test failed for wrong reason');

  const badWait=base();
  badWait.materially_implicated_untracked=[{player:'TEST DEFAULT WAIT',team:'CHI',position:'RB',depth_rank:1,decision:'WAIT',reason:'default wait'}];
  r=run(write('bad-wait',badWait));
  assert(r.status!==0,'negative test failed: admission-level RB1 default WAIT was accepted');
  assert((r.stdout+r.stderr).includes('defaulted to WAIT'),'WAIT test failed for wrong reason');

  const complete=base();
  r=run(write('complete',complete));
  assert(r.status===0,`positive test failed: complete ${count}-player ledger was rejected\n${r.stdout}\n${r.stderr}`);

  const completeWithConnected=base();
  completeWithConnected.materially_implicated_untracked=[
    {player:'TEST WAIT PLAYER',team:'CHI',position:'WR',depth_rank:5,decision:'WAIT',reason:'connected but standalone value not yet material'},
    {player:'TEST HOLD PLAYER',team:'CHI',position:'RB',depth_rank:1,decision:'HOLD_OUT',reason:'explicit evidence review says no plausible fantasy value'}
  ];
  r=run(write('complete-connected',completeWithConnected));
  assert(r.status===0,`positive connected-player test failed\n${r.stdout}\n${r.stderr}`);

  console.log(`Full-universe news-review guardrail tests passed: incomplete/duplicate/incomplete-ADMIT/default-WAIT blocked; complete ${count}-player ledger and valid WAIT/HOLD triage accepted.`);
} finally {
  fs.rmSync(path.join(root,tmpDir),{recursive:true,force:true});
}
