import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const yaml=fs.readFileSync('.github/workflows/guardrail-failure-publisher.yml','utf8');
assert.match(yaml,/SOURCE_HEAD_SHA: \$\{\{ github.event.workflow_run.head_sha \}\}/);
const body=yaml.split('        run: |\n')[1].split('\n').map(line=>line.replace(/^          /,'')).join('\n').replace(/PR_NUMBER='\$\{\{ github.event.workflow_run.pull_requests\[0\].number \}\}'/,"PR_NUMBER='1'");
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'failure-publication-'));
try{
  const posted=path.join(tmp,'posted');
  fs.writeFileSync(path.join(tmp,'gh'),`#!/usr/bin/env bash
if [[ "$*" == *'--method POST'* ]]; then printf '%s\\n' "$*" >> "$TEST_POSTED"; else printf '%s %s %s\\n' "$TEST_PR_STATE" "$TEST_HEAD" "$TEST_MERGE"; fi
`,{mode:0o755});
  const run=(state,head,merge='synthetic-current')=>{
    fs.rmSync(posted,{force:true});
    const r=spawnSync('bash',['-c',body],{encoding:'utf8',env:{...process.env,PATH:`${tmp}:${process.env.PATH}`,SOURCE_HEAD_SHA:'current-head',GITHUB_REPOSITORY:'example/repo',GITHUB_REPOSITORY_OWNER:'example',SOURCE_HEAD_BRANCH:'repair',SOURCE_RUN_URL:'https://example.test/failed-run',RUN_CONCLUSION:'failure',TEST_PR_STATE:state,TEST_HEAD:head,TEST_MERGE:merge,TEST_POSTED:posted}});
    return {...r,posted:fs.existsSync(posted)?fs.readFileSync(posted,'utf8'):''};
  };
  const current=run('open','current-head');assert.equal(current.status,0);assert.match(current.posted,/-f head_sha=synthetic-current/);assert.match(current.posted,/-f conclusion=failure/);
  for(const [state,head] of [['open','newer-head'],['closed','current-head']]){const r=run(state,head);assert.equal(r.status,0);assert.equal(r.posted,'','stale/closed failure cannot poison current candidate');}
  const missing=run('open','current-head','');assert.equal(missing.status,1);assert.equal(missing.posted,'','current failed candidate without synthetic SHA remains blocked');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
console.log('PASS: current failures block exactly their candidate; stale/closed failures do not retarget; missing current target fails closed');
