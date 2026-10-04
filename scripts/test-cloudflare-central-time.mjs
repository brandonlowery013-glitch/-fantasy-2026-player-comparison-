import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root='frontend/cloudflare/';
for(const file of ['live-score-poller.js','runtime-published-data-2026.js']){
 const game={away_team:'IND',home_team:'WAS',event_start:'2026-10-04T13:30:00Z',status:'10/4 - 9:30 AM EDT'};
 const feed={week:4,games:[game]},window={BET_FEED:feed,addEventListener(){},renderTicker(){},renderSelectedGame(){}};
 const context=vm.createContext({BET_FEED:feed,window,document:{readyState:'loading',getElementById(){return null},documentElement:{dataset:{}},addEventListener(){},dispatchEvent(){}},CustomEvent:class {},fetch:()=>new Promise(()=>{}),setInterval(){},console});
 vm.runInContext(fs.readFileSync(root+'runtime-central-time-2026.js','utf8'),context);
 let source=fs.readFileSync(root+file,'utf8');
 source=source.replace(/(\s+)async function poll\(/,'\n globalThis.testApply=apply;\n async function poll(');
 vm.runInContext(source,context);
 const row={id:'test',away_team:'IND',home_team:'WSH',date:'2026-10-04T13:30:00Z',state:'pre',completed:false,status:'10/4 - 9:30 AM EDT',away_score:0,home_score:0,away_periods:[],home_periods:[]};
 context.testApply([row]);assert.match(game.status,/8:30 AM CT$/);assert.equal(game.state,'pre');assert.equal(game.event_start,row.date);
 context.testApply([{...row,state:'in',status:'1:18 - 1st'}]);assert.equal(game.status,'1:18 - 1st');
 context.testApply([{...row,date:'2026-10-04T17:00:00Z'}]);assert.match(game.status,/12:00 PM CT$/);
 context.testApply([{...row,status:'Postponed'}]);assert.equal(game.status,'Postponed');
 context.testApply([{...row,state:'post',completed:true,status:'FINAL'}]);assert.equal(game.status,'FINAL');
 console.log('PASS: '+file+' scheduled refresh, live, postponement and final states');
}
