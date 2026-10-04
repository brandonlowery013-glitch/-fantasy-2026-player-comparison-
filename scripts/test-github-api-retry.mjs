import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'github-retry-'));
try{
  const count=path.join(tmp,'count');
  fs.writeFileSync(path.join(tmp,'gh'),`#!/usr/bin/env bash
n=0; [ ! -f "$TEST_COUNT" ] || n=$(cat "$TEST_COUNT")
n=$((n + 1)); echo "$n" > "$TEST_COUNT"
if [ "$n" -le "$TEST_FAILURES" ]; then echo "gh: test error (HTTP $TEST_HTTP)" >&2; exit 1; fi
printf '%s\\n' "$*"
`,{mode:0o755});
  const run=(http,failures)=>{
    fs.rmSync(count,{force:true});
    const result=spawnSync('bash',['-c','source scripts/github-api-retry.sh; github_api_retry --method POST repos/example/check-runs -f conclusion=success'],{cwd:process.cwd(),encoding:'utf8',env:{...process.env,PATH:`${tmp}:${process.env.PATH}`,TEST_COUNT:count,TEST_HTTP:String(http),TEST_FAILURES:String(failures),GITHUB_RETRY_DELAY_SECONDS:'0'}});
    return {...result,attempts:Number(fs.readFileSync(count))};
  };
  for(const http of [429,500,502,503,504]){
    const r=run(http,2);assert.equal(r.status,0);assert.equal(r.attempts,3);assert.match(r.stdout,/--method POST repos\/example\/check-runs -f conclusion=success/);
  }
  for(const http of [401,403,404,422]){const r=run(http,1);assert.equal(r.status,1);assert.equal(r.attempts,1);assert.equal(r.stdout,'');}
  const exhausted=run(503,10);assert.equal(exhausted.status,1);assert.equal(exhausted.attempts,4);assert.equal(exhausted.stdout,'');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
console.log('PASS: transient GitHub retries preserve request; permissions/validation failures and retry exhaustion fail closed');
