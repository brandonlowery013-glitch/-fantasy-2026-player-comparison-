import assert from 'node:assert/strict';
import {collectSplits,publication,ROOT} from '../lib/background-splits.mjs';
import {refresh} from './refresh-background-splits.mjs';
const row=(name,m,b)=>`<div class="tb-sodd"><div>${name}</div><div>-110</div><div>${m}%</div><div>${b}%</div></div>`;
const market=(name,a,b)=>`<div><div class="tb-se-head"><div>${name}</div><div>Odds</div><div>% Handle</div><div>% Bets</div></div>${row(a,70,40)}${row(b,30,60)}</div>`;
const html=`<div class="tb-se"><div class="tb-se-title"><img src="https://x/teams/nfl/NE.png"><img src="https://x/teams/nfl/BUF.png">10/25, 01:00PM</div><div class="tb-market-wrap">${market('Moneyline','NE Patriots','BUF Bills')}${market('Spread','NE +3','BUF -3')}${market('Total','Over 40','Under 40')}</div></div>`;
const event={id:'next',date:'2099-10-25T17:00:00Z',status:{type:{completed:false}},competitions:[{competitors:[{homeAway:'away',team:{abbreviation:'NE'}},{homeAway:'home',team:{abbreviation:'BUF'}}]}]};
let requests=[],offline=false;
const provider=async url=>{requests.push(url);if(offline)throw Error('provider offline');return new Response(url.includes('espn.com')?JSON.stringify(url.includes('week=7')?{events:[event]}:{week:{number:6},season:{year:2099},events:[{...event,status:{type:{completed:true}}}]}):html);};
const capture=await collectSplits({fetcher:provider});
assert.equal(capture.status,'CURRENT');assert.equal(capture.games.length,1);assert.equal(capture.games[0].moneyline[0].bets,40);assert.equal(capture.games[0].moneyline[0].money,70);assert.equal(requests.filter(u=>u.includes('draftkings')).length,2);assert(requests.some(u=>u.includes('week=7')));
const malformed=await collectSplits({fetcher:async u=>new Response(u.includes('espn.com')?JSON.stringify({events:[event]}):html.replaceAll('70%','120%'))}).then(()=>false,()=>true);assert(malformed,'invalid percentages rejected');
const p=publication(null,null,null,capture,{id:'one',event:'schedule',url:'https://github.com/run/one'});
const updated={...capture,observed_at:new Date(Date.parse(capture.observed_at)+900000).toISOString(),games:capture.games.map(g=>({...g,observed_at:new Date(Date.parse(g.observed_at)+900000).toISOString(),moneyline:[{...g.moneyline[0],money:71},{...g.moneyline[1],money:29}]}))};
const q=publication(p.latest,p.index,p.history,updated,{id:'two',event:'schedule',url:'https://github.com/run/two'});
assert.equal(q.history.snapshots.length,2);assert.deepEqual(q.history.snapshots[0],p.history.snapshots[0]);assert.equal(q.latest.games[0].moneyline[0].money,71);
assert.equal(publication(q.latest,q.index,q.history,updated,{id:'two'}).history.snapshots.length,2,'retry does not duplicate history');
const files=new Map(),calls=[];let staged={},head='initial',conflict=true;
const fetcher=async(url,options={})=>{
 if(!url.includes('api.github.com'))return provider(url);
 const path=url.split('/repos/test/repo/')[1],method=options.method||'GET';calls.push([method,path]);const body=options.body&&JSON.parse(options.body);
 if(path.startsWith('git/ref/heads/'))return Response.json({object:{sha:head}});
 if(path.startsWith('git/commits/')&&method==='GET')return Response.json({tree:{sha:'tree'}});
 if(path.startsWith('contents/')){const name=path.slice('contents/'.length).split('?')[0];return files.has(name)?Response.json(files.get(name)):new Response('',{status:404});}
 if(path==='git/trees'){staged=Object.fromEntries(body.tree.map(e=>[e.path,JSON.parse(e.content)]));return Response.json({sha:'newtree'});}
 if(path==='git/commits')return Response.json({sha:'commit-'+calls.length});
 if(path.startsWith('git/refs/heads/')){if(conflict){conflict=false;return new Response('',{status:422});}head=body.sha;for(const [name,value] of Object.entries(staged))files.set(name,value);return Response.json({object:{sha:head}});}
 throw Error('Unexpected API request '+method+' '+path);
};
const env={GITHUB_REPOSITORY:'test/repo',GITHUB_TOKEN:'test-only',GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',GITHUB_EVENT_NAME:'schedule'};
await refresh({fetcher,env});assert.equal(files.get(ROOT+'/status.json').event,'schedule');assert.equal(files.get(ROOT+'/latest.json').games.length,1);
const historyPath=[...files.keys()].find(p=>p.includes('/history/'));assert.equal(files.get(historyPath).snapshots.length,1);
const before=JSON.stringify(files.get(ROOT+'/latest.json')),beforeHistory=JSON.stringify(files.get(historyPath));offline=true;
await assert.rejects(refresh({fetcher,env:{...env,GITHUB_RUN_ID:'124'}}),/provider offline/);
assert.equal(JSON.stringify(files.get(ROOT+'/latest.json')),before);assert.equal(JSON.stringify(files.get(historyPath)),beforeHistory);assert.equal(files.get(ROOT+'/status.json').status,'FAILED');
assert.equal(files.get(ROOT+'/status.json').run_id,'124-1');
console.log('PASS: schedule rollover, real column mapping, invalid-data rejection, append-only history, idempotency, atomic publication, conflict retry and failed-collection preservation');
