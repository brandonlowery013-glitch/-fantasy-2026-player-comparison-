import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const cfg=read('guardrails/guardrails-config.json');
let names=[];
for(let i=0;i<cfg.authoritative_player_shards;i++) names.push(...read(`players${i}.json`).map(p=>p.n));
if(names.length!==cfg.authoritative_player_count) throw new Error(`fixture universe ${names.length} != ${cfg.authoritative_player_count}`);
if(new Set(names).size!==names.length) throw new Error('fixture universe contains duplicate names');

const tmpDir='guardrails/.tmp-full-universe-review-test';
fs.mkdirSync(path.join(root,tmpDir),{recursive:true});
const run=(file)=>spawnSync(process.execPath,['scripts/validate-full-universe-news-review.mjs'],{
  cwd:root,
  encoding:'utf8',
  env:{...process.env,FULL_UNIVERSE_REVIEW_LEDGER:file}
});
const write=(name,obj)=>{
  const rel=`${tmpDir}/${name}.json`;
  fs.writeFileSync(path.join(root,rel),JSON.stringify(obj,null,2)+'\n');
  return rel;
};
const entry=player=>({
  player,
  status:'REVIEWED_NO_CHANGE',
  reviewed_at:'2026-09-01T13:00:00Z',
  categories_checked:['injury','transactions','depth_chart','role_usage','offensive_environment']
});
const base=()=>({
  season:2026,
  phase:'REGULAR_SEASON',
  camp_preseason_mode:false,
  review_scope:'FULL_ACTIVE_UNIVERSE_PLUS_CONNECTED',
  active_player_count:cfg.authoritative_player_count,
  sweep_started_at:'2026-09-01T12:00:00Z',
  sweep_completed_at:'2026-09-01T13:00:00Z',
  players:names.map(entry),
  materially_implicated_untracked:[]
});
const assert=(condition,message)=>{if(!condition)throw new Error(message)};

try{
  const incomplete=base();
  incomplete.players.pop();
  let r=run(write('incomplete',incomplete));
  assert(r.status!==0,'negative test failed: incomplete 165/166 ledger was accepted');
  assert((r.stdout+r.stderr).includes('active players missing football review'),'negative test failed for wrong reason');

  const duplicate=base();
  duplicate.players.push({...duplicate.players[0]});
  r=run(write('duplicate',duplicate));
  assert(r.status!==0,'negative test failed: duplicate review was accepted');
  assert((r.stdout+r.stderr).includes('duplicate reviewed players'),'duplicate test failed for wrong reason');

  const badAdmit=base();
  badAdmit.materially_implicated_untracked=[{player:'TEST CONNECTED PLAYER',decision:'ADMIT',reason:'material connected opportunity',onboarding_complete:false}];
  r=run(write('bad-admit',badAdmit));
  assert(r.status!==0,'negative test failed: incomplete ADMIT onboarding was accepted');
  assert((r.stdout+r.stderr).includes('onboarding_complete is not true'),'ADMIT test failed for wrong reason');

  const complete=base();
  r=run(write('complete',complete));
  assert(r.status===0,`positive test failed: complete ${cfg.authoritative_player_count}-player ledger was rejected\n${r.stdout}\n${r.stderr}`);

  const completeWithConnected=base();
  completeWithConnected.materially_implicated_untracked=[
    {player:'TEST WAIT PLAYER',decision:'WAIT',reason:'connected but standalone value not yet material'},
    {player:'TEST HOLD PLAYER',decision:'HOLD_OUT',reason:'no plausible standalone or contingent fantasy value'},
    {player:'TEST ADMIT PLAYER',decision:'ADMIT',reason:'material standalone/contingent fantasy value',onboarding_complete:true}
  ];
  r=run(write('complete-connected',completeWithConnected));
  assert(r.status===0,`positive connected-player test failed\n${r.stdout}\n${r.stderr}`);

  console.log(`Full-universe news-review guardrail tests passed: incomplete/duplicate/incomplete-ADMIT blocked; complete ${cfg.authoritative_player_count}-player ledger and valid connected triage accepted.`);
} finally {
  fs.rmSync(path.join(root,tmpDir),{recursive:true,force:true});
}
