import assert from 'node:assert/strict';
import {propBoardQuotes} from '../lib/prop-board-quotes.mjs';
const now=Date.now(),s={snapshot_id:'original',horizon:'WEEKLY',week:8,game_id:'CHI-SEA',player:'Test',stat:'rushing_yards',book:'book',line:10.5,over_price:-110,under_price:-110,captured_at:new Date(now-60000).toISOString(),kickoff:new Date(now+86400000).toISOString()};
let q=propBoardQuotes([s,{...s,snapshot_id:'older',line:9.5,captured_at:new Date(now-120000).toISOString()},{...s,game_id:'PHI-WAS',player:'Other'}],{week:8,now});
assert.equal(q.snapshots.length,2);assert.equal(q.snapshots[0].snapshot_id,'original');assert.equal(q.snapshots[0].captured_at,s.captured_at);
for(const bad of [{week:7},{kickoff:new Date(now-1).toISOString()},{captured_at:new Date(now-151*60000).toISOString()},{under_price:null},{captured_at:new Date(now+6*60000).toISOString()}])assert.equal(propBoardQuotes([{...s,...bad}],{week:8,now}).snapshots.length,0);
console.log('PASS: two-game coverage, latest exact book quote, original timestamps, week/kickoff/freshness/price gates');
