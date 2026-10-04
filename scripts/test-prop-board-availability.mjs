import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const code=fs.readFileSync('frontend/cloudflare/prop-board.js','utf8');
let availability='ELIGIBLE';
const context=vm.createContext({Date,window:{CTD_WEEKLY_ELIGIBILITY:()=>({state:availability})}});
vm.runInContext(code.slice(code.indexOf(' function verdict('),code.indexOf(' function bookRow(')),context);
const s={player:'Test Player',week:4,kickoff:new Date(Date.now()+3600000).toISOString(),captured_at:new Date().toISOString(),line:50,evaluation:{eligibility:{eligible_for_pick:true},recommendation:{decision:'PICK',side:'OVER'},model_pick:{side:'OVER'}}};
assert.match(context.verdict(s)[1],/recommended/);
for(const state of ['WAIT','CONDITIONAL','UNAVAILABLE',undefined]){availability=state;assert.doesNotMatch(context.verdict(s)[1],/recommended/);}
availability='ELIGIBLE';
assert.doesNotMatch(context.verdict({...s,kickoff:null})[1],/recommended/);
assert.doesNotMatch(context.verdict({...s,captured_at:'invalid'})[1],/recommended/);
assert.match(context.verdict({...s,kickoff:new Date(Date.now()-1000).toISOString()})[1],/closed/);
console.log('PASS: unavailable, unknown, closed and stale props cannot be recommended');
