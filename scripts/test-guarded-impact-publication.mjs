import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('./publish-guarded-impact-state.sh',import.meta.url));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ctd-impact-publisher-'));
const run=(cwd,cmd,args,env={})=>{const r=spawnSync(cmd,args,{cwd,env:{...process.env,...env},encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||r.stdout);return r.stdout.trim();};
const artifacts={connected:'connected-impact-queue-2026.json',bridge:'team-scoring-market-impact-bridge-2026.json',interface:'interface-impact-payload-2026.json'};
try{
 for(const [mode,file] of Object.entries(artifacts)){
  const dir=path.join(root,mode),remote=path.join(root,mode+'-remote.git'),bin=path.join(dir,'bin');
  fs.mkdirSync(path.join(dir,'data/ingestion'),{recursive:true});fs.mkdirSync(path.join(dir,'scripts'));fs.mkdirSync(bin);
  run(dir,'git',['init','-b','main']);run(dir,'git',['config','user.name','Publisher Test']);run(dir,'git',['config','user.email','publisher@example.test']);
  fs.writeFileSync(path.join(dir,'data/ingestion',file),'old\n');fs.writeFileSync(path.join(dir,'unrelated.txt'),'original\n');
  run(dir,'git',['add','.']);run(dir,'git',['commit','-m','baseline']);run(dir,'git',['init','--bare',remote]);run(dir,'git',['remote','add','origin',remote]);run(dir,'git',['push','origin','main']);
  fs.writeFileSync(path.join(remote,'hooks/pre-receive'),'#!/usr/bin/env bash\nwhile read old new ref; do if [ "$ref" = refs/heads/main ]; then echo "protected main" >&2; exit 1; fi; done\n',{mode:0o755});
  fs.writeFileSync(path.join(dir,'scripts/merge-guarded-production-pr.sh'),'#!/usr/bin/env bash\nprintf "%s\\n" "$@" > "$TEST_ROOT/merge-args"\n');
  fs.writeFileSync(path.join(bin,'gh'),'#!/usr/bin/env bash\nprintf "%s\\n" "$@" > "$TEST_ROOT/gh-args"\nwhile [ "$#" -gt 0 ]; do if [ "$1" = --body-file ]; then cat "$2" > "$TEST_ROOT/pr-body"; fi; shift; done\necho https://github.com/test/repo/pull/123\n',{mode:0o755});
  const env={PATH:bin+path.delimiter+process.env.PATH,TEST_ROOT:dir,GH_TOKEN:'test-only',GITHUB_REPOSITORY:'test/repo',GITHUB_RUN_ID:'99',GITHUB_RUN_ATTEMPT:'1'};
  run(dir,'bash',[script,mode],env);assert(!fs.existsSync(path.join(dir,'gh-args')),'unchanged output must not create a PR');
  fs.writeFileSync(path.join(dir,'unrelated.txt'),'unrelated local change\n');fs.writeFileSync(path.join(dir,'data/ingestion',file),'updated\n');
  run(dir,'git',['add','unrelated.txt']);const staged=spawnSync('bash',[script,mode],{cwd:dir,env:{...process.env,...env},encoding:'utf8'});assert.notEqual(staged.status,0,'unrelated staged content must be rejected');run(dir,'git',['reset','--','unrelated.txt']);
  run(dir,'bash',[script,mode],env);
  const branch=`production/impact-${mode}-99-1`,files=run(dir,'git',['diff','--name-only','main',branch]).split('\n');
  assert.deepEqual(files,['data/ingestion/'+file]);
  assert(run(dir,'git',['ls-remote','--heads','origin',branch]).endsWith('refs/heads/'+branch));
  assert.equal(run(dir,'git',['show','origin/main:data/ingestion/'+file]),'old','protected main must remain unchanged until the guarded handoff');
  assert.deepEqual(fs.readFileSync(path.join(dir,'merge-args'),'utf8').trim().split('\n'),['123',branch,'merge']);
  const args=fs.readFileSync(path.join(dir,'gh-args'),'utf8');assert(args.includes('--base\nmain\n'));assert(args.includes('--body-file\n'));assert(fs.readFileSync(path.join(dir,'pr-body'),'utf8').includes('exact protected candidate'));
 }
 const bad=spawnSync('bash',[script,'unknown'],{cwd:root,encoding:'utf8'});assert.equal(bad.status,2);
 console.log('PASS: all three impact artifacts use isolated production branches, stage only declared output, preserve protected main, create reviewable PRs and invoke the existing guarded merge handoff; unchanged, unrelated staged and unknown-mode cases covered');
}finally{fs.rmSync(root,{recursive:true,force:true});}
