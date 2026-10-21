import assert from 'node:assert/strict';
import {onRequestGet} from '../functions/api/live/splits.js';
const now=Date.now(),at=new Date(now).toISOString(),start=new Date(now+86400000).toISOString();
const pair=[{side:'NE',bets:40,money:70},{side:'BUF',bets:60,money:30}];
const game={event_id:'one',home:'BUF',away:'NE',start_at:start,observed_at:at,moneyline:pair,spread:pair,total:[{...pair[0],side:'Over'},{...pair[1],side:'Under'}]};
let feed={schema_version:1,status:'CURRENT',observed_at:at,games:[game],collection:{last_success_at:at,event:'schedule'},history:{date:at.slice(0,10)}},status={status:'CURRENT',last_attempt_at:at},offline=false,calls=[];
const originalFetch=globalThis.fetch;
const saved=new Map(),jobs=[];
globalThis.caches={default:{async match(k){return saved.get(k.url)?.clone();},async put(k,r){saved.set(k.url,r.clone());}}};
globalThis.fetch=async url=>{calls.push(url);if(offline)throw Error('offline');return Response.json(url.includes('status.json')?status:url.includes('index.json')?{days:[at.slice(0,10)]}:url.includes('/history/')?{snapshots:[{games:[game]}]}:feed);};
const ctx={request:new Request('https://site.test/api/live/splits'),env:{ASSETS:{fetch:async()=>Response.json({games:[]})}},waitUntil:p=>jobs.push(p)};
try{
 let data=await(await onRequestGet(ctx)).json();await Promise.all(jobs);
 assert.equal(data.health.status,'CURRENT');assert.equal(data.health.collection_event,'schedule');assert.deepEqual(data.games[0].moneyline,pair);assert(calls.every(u=>u.includes('raw.githubusercontent.com')),'read-only endpoint must not collect from provider');
 status={status:'FAILED',error:'provider unavailable',last_attempt_at:at};data=await(await onRequestGet(ctx)).json();await Promise.all(jobs);assert.equal(data.health.status,'STALE');assert.equal(data.games.length,1);assert.equal(data.health.last_success_at,at);
 offline=true;data=await(await onRequestGet(ctx)).json();assert.equal(data.health.status,'STALE');assert.equal(data.games.length,1);assert.equal(data.games[0].observed_at,at);
 offline=false;status={status:'CURRENT'};feed={...feed,collection:{last_success_at:new Date(now-3600000).toISOString()}};data=await(await onRequestGet(ctx)).json();assert.equal(data.health.status,'STALE');
 for(const value of ['../status','2026-02-31','not-a-date']){ctx.request=new Request('https://site.test/api/live/splits?history='+value);assert.equal((await onRequestGet(ctx)).status,400);}
 ctx.request=new Request('https://site.test/api/live/splits?history=index');assert.deepEqual((await(await onRequestGet(ctx)).json()).days,[at.slice(0,10)]);
 ctx.request=new Request('https://site.test/api/live/splits?history='+at.slice(0,10));assert.equal((await(await onRequestGet(ctx)).json()).snapshots.length,1);
 // Cloudflare is authoritative when bound; retain all earlier GitHub archives.
 ctx.env.SPLITS_SCHEDULER={fetch:async request=>Response.json(request.url.includes('index.json')?{days:['2099-01-01']}:request.url.includes('/history/')?{snapshots:[{capture_id:'cloudflare:one',observed_at:at,games:[game]}]}:request.url.includes('status.json')?{status:'CURRENT'}:{...feed,status:'CURRENT',games:[game],collection:{last_success_at:at,event:'cloudflare-cron'}})};
 ctx.request=new Request('https://site.test/api/live/splits');
 assert.equal((await(await onRequestGet(ctx)).json()).health.collection_event,'cloudflare-cron');
 ctx.request=new Request('https://site.test/api/live/splits?history=index');
 assert.deepEqual((await(await onRequestGet(ctx)).json()).days,[at.slice(0,10),'2099-01-01']);
 ctx.request=new Request('https://site.test/api/live/splits?history='+at.slice(0,10));
 assert.equal((await(await onRequestGet(ctx)).json()).snapshots.length,2,'Cloudflare and GitHub history both retained');
 delete ctx.env.SPLITS_SCHEDULER;
 // A delayed or failed timer must not disable the previously working live
 // quote path. Its observations must not be presented as archived job data.
 saved.clear();calls=[];ctx.request=new Request('https://site.test/api/live/splits');
 const staleAt=new Date(now-3600000).toISOString();feed={...feed,collection:{last_success_at:staleAt,event:'schedule'},games:[{...game,observed_at:staleAt}]};
 const md=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'numeric',day:'numeric'}).format(new Date(start));
 const row=(name,m,b)=>`<div class="tb-sodd"><div>${name}</div><div>-110</div><div>${m}%</div><div>${b}%</div></div>`;
 const market=(name,a,b)=>`<div><div class="tb-se-head"><div>${name}</div><div>Odds</div><div>% Handle</div><div>% Bets</div></div>${row(a,75,45)}${row(b,25,55)}</div>`;
 const html=`<div class="tb-se"><div class="tb-se-title"><img src="https://x/teams/nfl/NE.png"><img src="https://x/teams/nfl/BUF.png">${md}, 01:00PM</div><div class="tb-market-wrap">${market('Moneyline','NE Patriots','BUF Bills')}${market('Spread','NE +3','BUF -3')}${market('Total','Over 40','Under 40')}</div></div>`;
 const event={id:'one',date:start,status:{type:{completed:false}},competitions:[{competitors:[{homeAway:'away',team:{abbreviation:'NE'}},{homeAway:'home',team:{abbreviation:'BUF'}}]}]};
 globalThis.fetch=async url=>{calls.push(url);return url.includes('espn.com')?Response.json({events:[event]}):url.includes('draftkings.com')?new Response(html):Response.json(url.includes('status.json')?status:feed);};
 const backed=await(await onRequestGet(ctx)).json();await Promise.all(jobs);
 assert.equal(backed.health.status,'CURRENT');assert.equal(backed.health.source,'live-request-fallback');assert.equal(backed.background_health.status,'STALE');assert.equal(backed.background_health.last_success_at,staleAt);assert.equal(backed.collection.event,'schedule');assert.equal(backed.games.find(g=>g.event_id==='one').moneyline[0].bets,45);
 assert.equal(calls.filter(u=>u.includes('draftkings.com')).length,2,'backup collection remains bounded');
 feed={...feed,collection:{last_success_at:new Date(now-20*60000).toISOString(),event:'schedule'},games:[{...game,observed_at:new Date(now-20*60000).toISOString()}]};
 const delayed=await(await onRequestGet(ctx)).json();assert.equal(delayed.background_health.status,'DELAYED');assert.equal(delayed.health.status,'CURRENT');assert.equal(calls.filter(u=>u.includes('draftkings.com')).length,2,'same-slot backup reuses its verified cache');
}finally{globalThis.fetch=originalFetch;}
console.log('PASS: background delivery, fresh-source request suppression, failed/stale status, last-good preservation, dated history, path validation and bounded live backup without relabeling background history');
