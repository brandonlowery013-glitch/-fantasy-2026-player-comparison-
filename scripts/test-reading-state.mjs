import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

let details=[],focusCalls=0,selection=null;
const disclosure=open=>({id:'',open,getAttribute:()=>null,closest:()=>null,querySelector:()=>({textContent:'Numbers and sources'})});
details=[disclosure(true),disclosure(false)];
const focused={id:'playerSearch',isConnected:false,selectionStart:2,selectionEnd:4};
const replacement={focus:()=>focusCalls++,setSelectionRange:(...args)=>selection=args};
const root={getClientRects:()=>[{}],contains:()=>true,querySelectorAll:selector=>selector==='details'?details:[]};
const window={scrollX:0,scrollY:450,scrollTo:({left,top})=>{window.scrollX=left;window.scrollY=top;}};
const events={};
const document={activeElement:focused,getElementById:()=>replacement,addEventListener:(name,fn)=>{(events[name]??=[]).push(fn);}};
vm.runInNewContext(fs.readFileSync('frontend/cloudflare/reading-state.js','utf8'),{window,document});
window.CTD_READING.preserve(root,()=>{details=[disclosure(false),disclosure(true)];window.scrollY=0;});
assert.deepEqual(details.map(x=>x.open),[true,false]);
assert.equal(window.scrollY,450);assert.equal(focusCalls,1);assert.deepEqual(selection,[2,4]);
assert.throws(()=>window.CTD_READING.preserve(root,()=>{window.scrollY=0;throw Error('refresh failed');}),/refresh failed/);
assert.equal(window.scrollY,450);
// User choice survives an intermediate render that temporarily removes a panel.
root.id='gamesPage';const detail=details[0];detail.closest=selector=>selector==='.page'?root:null;
const summary={parentElement:detail};detail.open=false;events.click[0]({type:'click',target:{closest:()=>summary}});detail.open=true;
window.CTD_READING.preserve(root,()=>{details=[];});
window.CTD_READING.preserve(root,()=>{details=[disclosure(false)];});assert.equal(details[0].open,true);

// Execute the actual weekly renderer: refreshing another provider cannot overwrite Role Watch.
let writes=0;
const tabs={dataset:{ctdPublished:'1'}};
const mount={set innerHTML(value){writes++;}};
let active={hasAttribute:()=>false};
const doc={querySelectorAll:()=>[],querySelector:()=>active,getElementById:id=>id==='weeklyTabs'?tabs:mount,addEventListener:()=>{},documentElement:{}};
const source=fs.readFileSync('frontend/runtime-model-state-semantics-2026.js','utf8').replace('load();setInterval(load,60000);','window.testRenderWeekly=renderWeekly;');
const state={CTD_READING:{preserve:(_root,fn)=>fn()}};
vm.runInNewContext(source,{window:state,document:doc,MutationObserver:class{observe(){}},setTimeout:()=>{},setInterval:()=>{}});
state.testRenderWeekly();assert.equal(writes,0,'Custom weekly category must keep its content');
active={hasAttribute:()=>true};state.testRenderWeekly();assert.equal(writes,1,'Published weekly categories must still refresh');
console.log('PASS: refresh preserves open/closed details, reading position, focus, error recovery and weekly category ownership');
