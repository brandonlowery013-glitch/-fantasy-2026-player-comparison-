import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const path=process.argv[2]||'frontend/cloudflare/league-recap-week-7.js';
const source=fs.readFileSync(path,'utf8');
const reports=JSON.parse(source.match(/const reports=(\{.*?\}),latest=8;/s)[1]);
assert.deepEqual(Object.keys(reports),['7','8']);
assert.equal(createHash('sha256').update(reports[7]).digest('hex'),'ff17456a7ad31091837c037bfd35220c38892f41eff98e33eee350fea5ee2fb3');
assert.equal((reports[8].match(/data-recap-matchup=/g)||[]).length,6);
assert.equal((reports[8].match(/data-power-team=/g)||[]).length,12);
assert.equal((reports[8].match(/data-forecast-matchup=/g)||[]).length,6);
assert(reports[8].includes('161.36')&&reports[8].includes('149.86')&&reports[8].includes('56.80'));
assert(reports[8].includes('SHEET: PENDING')&&reports[8].includes('sign still needs confirmation')&&reports[8].includes('No payment is confirmed'));
function boot(hash){
 const ids={},events={},location={hash};let shown=0;
 function node(){const n={dataset:{},events:{},append(child){if(child.id)ids[child.id]=child;this.child=child;},addEventListener(name,fn){this.events[name]=fn;},querySelector(){return this.selector;},querySelectorAll(){return [];}};
 Object.defineProperty(n,'innerHTML',{get(){return this.html||'';},set(v){this.html=v;this.selector=node();}});return n;}
 ids.nav=node();ids.gamesPage={parentElement:node()};
 const context={document:{getElementById:id=>ids[id]||null,createElement:node,head:node()},location,history:{replaceState(a,b,h){location.hash=h;}},window:{addEventListener:(name,fn)=>events[name]=fn,scrollTo(){}},showPage(){shown++;}};
 vm.runInNewContext(source,context);return {ids,events,location,shown:()=>shown};
}
const archive=boot('#league-recap-week-7');assert(archive.ids.leagueRecapPage.innerHTML.includes('Seven weeks. Twelve egos.'));assert(archive.ids.leagueRecapPage.innerHTML.includes('Read latest report'));assert(archive.shown()>0);
archive.ids.nav.child.events.click();assert.equal(archive.location.hash,'#league-recap-week-8');assert(archive.ids.leagueRecapPage.innerHTML.includes('149.86 points. Still a loser.'));
archive.ids.leagueRecapPage.selector.events.change({target:{value:'7'}});assert.equal(archive.location.hash,'#league-recap-week-7');assert(archive.ids.leagueRecapPage.innerHTML.includes('Seven weeks. Twelve egos.'));
archive.location.hash='#league-recap-week-8';archive.events.hashchange();assert(archive.ids.leagueRecapPage.innerHTML.includes('Week 9 forecast'));
assert(boot('').ids.leagueRecapPage.innerHTML.includes('149.86 points. Still a loser.'));
console.log('PASS: unchanged Week 7 archive, six Week 8 results, twelve rankings, six forecasts, pending-money labels, latest navigation, selector and direct links.');
