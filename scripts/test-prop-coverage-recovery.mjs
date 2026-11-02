import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const root=process.cwd(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'ctd-prop-recovery-')),now=Date.now(),kickoff=new Date(now+86400000).toISOString(),id='a'.repeat(32);
const write=(p,d)=>{fs.mkdirSync(path.dirname(path.join(dir,p)),{recursive:true});fs.writeFileSync(path.join(dir,p),typeof d==='string'?d:JSON.stringify(d));};
try{
 write('MODEL_SOURCE_OF_TRUTH.json',{runtime_player_shards:1});write('players0.json',[{n:'Test Quarterback',p:'QB',t:'Chicago Bears'}]);
 write('data/calibration/weekly-event-schedule-2026.json',{week:8,games:{'2026-W8-CHI-SEA':{week:8,home_team:'SEA',away_team:'CHI',event_start:kickoff}}});
 write('data/ingestion/team-personnel-2026.json',{teams:{CHI:{team:'CHI',players:[{name:'Test Quarterback',position:'QB',athlete_id:'123',team:'CHI'}]}}});
 write('data/market/player-prop-market-snapshots-2026.json',{snapshots:[]});
 write('data/sources/live-market-ingestion-2026.json',{background_prop_feed_url:'https://quotes.test/current',provider:{host:'https://provider.test',sport_key:'americanfootball_nfl',api_key_env:'ODDS_API_KEY',regions:'us',weekly_player_prop_markets:{player_pass_yds:'passing_yards'}},cadence:{max_provider_market_credits_per_run:128}});
 const event={id,commence_time:kickoff,home_team:'Seattle Seahawks',away_team:'Chicago Bears'};
 const odds={...event,bookmakers:[{key:'testbook',title:'Test Book',markets:[{key:'player_pass_yds',outcomes:[{description:'Test Quarterback',name:'Over',point:200.5,price:-110},{description:'Test Quarterback',name:'Under',point:200.5,price:-115}]}]}]};
 write('mock.mjs',`import fs from 'node:fs';const calls=[];globalThis.fetch=async input=>{const u=new URL(input);calls.push(u.pathname);fs.writeFileSync('requests.json',JSON.stringify(calls));if(u.hostname==='quotes.test')return Response.json({event:'cloudflare-cron',health:{status:'STALE'},games:[]});if(u.pathname.endsWith('/events'))return Response.json(${JSON.stringify([event])},{headers:{'x-requests-remaining':'50000','x-requests-last':'0'}});if(u.pathname.endsWith('/odds'))return Response.json(${JSON.stringify(odds)},{headers:{'x-requests-remaining':'49999','x-requests-last':'1'}});throw Error('Unexpected request');};`);
 const run=()=>execFileSync(process.execPath,['--import',path.join(dir,'mock.mjs'),path.join(root,'scripts/adaptive-player-prop-refresh.mjs')],{cwd:dir,env:{...process.env,ODDS_API_KEY:'TEST_ONLY',MARKET_INGEST_NOW:new Date(now).toISOString()},encoding:'utf8'});
 let output=run(),rows=JSON.parse(fs.readFileSync(path.join(dir,'data/market/cloudflare-player-prop-current-2026.json'))).snapshots;
 assert.equal(rows.length,1);assert.equal(rows[0].game_id,'2026-W8-CHI-SEA');assert.equal(rows[0].line,200.5);assert.equal(rows[0].over_price,-110);assert.equal(rows[0].identity_status,'ROSTER_MATCHED');assert.equal(rows[0].source,'The Odds API v4 event odds');assert(output.includes('"recovery_provider_requests":1'));
 const original=rows[0].captured_at;output=run();rows=JSON.parse(fs.readFileSync(path.join(dir,'data/market/cloudflare-player-prop-current-2026.json'))).snapshots;
 assert.equal(rows[0].captured_at,original);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'requests.json'))),['/current'],'fresh retained quotes must avoid another paid request');assert(output.includes('"recovery_provider_requests":0'));
 console.log('PASS: missing/stale background feed recovers the exact scheduled matchup through the provider; fresh observations retain timestamps and avoid paid duplicate fetches');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
