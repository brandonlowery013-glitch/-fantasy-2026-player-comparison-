import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync('frontend/runtime-model-state-semantics-2026.js','utf8');
async function run(expected,count){
 const banner={dataset:{},textContent:''};const events=[];
 const document={documentElement:{dataset:{}},getElementById:id=>id==='ctdModelStateBanner'?banner:id==='ctd-model-state-style'?{}:null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},dispatchEvent:e=>events.push(e.type)};
 const window={};
 vm.runInNewContext(code,{window,document,Map,Set,Date,Number,Array,console,CustomEvent:class{constructor(type){this.type=type}},MutationObserver:class{observe(){}},setInterval(){},setTimeout(){},fetch:async url=>({ok:true,json:async()=>String(url).includes('MODEL_SOURCE_OF_TRUTH')?{active_player_model:expected}:String(url).includes('market-value-board')?{universe:count,status:'STEP_3_MARKET_DISCREPANCY_VALUE_BOARD',authority:'COMPANION_ONLY_NO_INTRINSIC_RANK_MUTATION',board:Array.from({length:count},(_,i)=>({player:'Player '+i}))}:{status:'SHADOW_ONLY',mode:'SHADOW_ONLY',actionable:false}})});
 for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));
 return {window,events};
}
for(const expected of [197,198]){const {window,events}=await run(expected,expected);assert.equal(window.CTD_PUBLISHED_DATA_2026.status,'READY');assert.equal(window.CTD_PUBLISHED_DATA_2026.market_universe,expected);assert(events.includes('ctd:model-state-ready'));}
for(const [expected,count] of [[197,166],[0,0]]){const {window}=await run(expected,count);assert.equal(window.CTD_PUBLISHED_DATA_2026.status,'FAIL');assert.equal(window.CTD_MODEL_STATE_2026.actionable,false);}
console.log('PASS: live model-state adapter accepts the canonical 197-player universe and future additions; rejects incomplete or invalid coverage without enabling actions');
