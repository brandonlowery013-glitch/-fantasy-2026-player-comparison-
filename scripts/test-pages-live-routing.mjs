import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../frontend/_worker.js';

const routes=JSON.parse(fs.readFileSync('frontend/_routes.json','utf8'));
const env={ASSETS:{fetch:async()=>new Response('static',{status:404})}};
const ctx={waitUntil:()=>{}};
const request=(path,method='GET')=>worker.fetch(new Request('https://ctd.test'+path,{method}),env,ctx);
const original=globalThis.fetch;
const competitors=[{homeAway:'away',team:{id:'1',abbreviation:'WSH'},score:'17'},{homeAway:'home',team:{id:'2',abbreviation:'SF'},score:'24'}];
let calls=[];
try {
 globalThis.fetch=async url=>{
  calls.push(String(url));
  if(String(url).includes('/scoreboard'))return Response.json({events:[{id:'401873008',status:{type:{state:'post',completed:true,shortDetail:'Final'}},competitions:[{competitors}]}]});
  return Response.json({header:{id:'401873008',competitions:[{id:'401873008',competitors,status:{type:{state:'post',completed:true,shortDetail:'Final'}}}]},boxscore:{players:[{team:{abbreviation:'SF'},statistics:[{name:'passing',labels:['YDS'],athletes:[{athlete:{id:'12345',displayName:'Test Player'},stats:['250']}]}]}]}});
 };
 for(const path of ['/api/live/scoreboard','/api/live/game'])assert(routes.include.includes(path));
 let response=await request('/api/live/scoreboard?week=6');
 assert.equal(response.status,200);
 let body=await response.json();
 assert.equal(body.games[0].event_id,'401873008');
 assert.equal(body.games[0].completed,true);
 assert(calls[0].includes('year=2026&seasontype=2&week=6'));
 response=await request('/api/live/game?event=401873008');
 assert.equal(response.status,200);
 body=await response.json();
 assert.equal(body.game.provider_event_id,'401873008');
 assert.equal(body.game.home_score,24);
 assert.equal(body.game.player_stats[0].player_id,'12345');
 assert.equal(body.game.player_stats[0].stats.YDS,'250');
 const before=calls.length;
 assert.equal((await request('/api/live/scoreboard?week=invalid')).status,400);
 assert.equal((await request('/api/live/game')).status,400);
 assert.equal((await request('/api/live/scoreboard','POST')).status,405);
 assert.equal(calls.length,before);
 assert.equal((await request('/cloudflare/')).status,404);
 globalThis.fetch=async()=>new Response('failure',{status:503});
 assert.equal((await request('/api/live/scoreboard?week=6')).status,502);
} finally {globalThis.fetch=original;}
console.log('PASS: Pages route inclusion, Worker dispatch, historical-week forwarding, final score/player IDs, invalid inputs, static forwarding and upstream failure');
