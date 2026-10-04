import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const base='frontend/cloudflare/';const feed=JSON.parse(fs.readFileSync(base+'matchup-writeups.json'));const script=fs.readFileSync(base+'runtime-matchup-facts-2026.mjs','utf8').replace(/^import .*;\n/gm,'').replace("new URL('./matchup-writeups.json',import.meta.url)","'matchup-writeups.json'");
let renders=0;const sandbox={assessment:()=>({sections:[{title:'IND availability',text:'A current injury warning'}],risk:'Keep injury warning'}),loadMatchup:async()=>({}),canon:s=>({WAS:'WSH',LA:'LAR',JAC:'JAX'}[s]||s),fetch:async()=>({ok:true,json:async()=>feed}),renderSelectedGame:()=>{renders++},BET_FEED:{games:[]},selectedGameIndex:0,document:{addEventListener:()=>{}},AbortSignal,console};vm.createContext(sandbox);vm.runInContext(script,sandbox);await new Promise(r=>setImmediate(r));
assert(renders>0);
for(const g of Object.values(feed.games)){
 const data={away:sandbox.canon(g.away_team),home:sandbox.canon(g.home_team),kickoff:g.kickoff};
 for(const kind of ['spread','total','moneyline']){const a=sandbox.CTD_MATCHUP_ASSESSMENT({kind},data);assert.equal(a.sections.length,3);assert.equal(a.risk,'Keep injury warning');assert.equal(a.sections[0].title,g.sections[0].title);}
 assert.equal(sandbox.CTD_MATCHUP_ASSESSMENT({}, {...data,kickoff:'2027-01-01T00:00:00Z'}).sections.length,1);
}
const show=fs.readFileSync(base+'show-work.js','utf8');assert(!show.includes("r.kind==='spread'?a.sections:[]"));
console.log('PASS: all 16 matchups rendered for all three markets; wrong kickoff rejected; injury warnings preserved; async load rerenders');
