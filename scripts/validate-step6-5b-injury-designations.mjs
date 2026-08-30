import fs from 'node:fs';

const p='data/sources/step6-5b-player-injury-designations-2026.json';
const c=JSON.parse(fs.readFileSync(p,'utf8'));
const profileContract=JSON.parse(fs.readFileSync('data/sources/step6-5b-player-profile-status-news-contract-2026.json','utf8'));
const ui=fs.readFileSync('index.html','utf8');
const fail=[];
const need=(v,m)=>{if(!v)fail.push(m)};
const allowed=new Set(['Q','D','O','IR','SSPD']);
need(c.schema_version==='STEP6_5B_PLAYER_INJURY_DESIGNATIONS_1.1.0','schema mismatch');
need(c.season===2026,'season mismatch');
need(c.display_labels&&Object.keys(c.display_labels).sort().join(',')==='D,IR,O,Q,SSPD','required Q/D/O/IR/SSPD labels missing');
need(Array.isArray(c.rules)&&c.rules.some(x=>x.includes('stale Q/D/O tags are prohibited')),'stale-tag prohibition missing');
need(c.rules.some(x=>x.includes('reserve/injured transaction')),'IR transaction rule missing');
need(c.rules.some(x=>x.includes('SSPD')),'SSPD rule missing');
for(const [name,x] of Object.entries(c.players||{})){
  need(allowed.has(x.tag),`${name}: invalid tag ${x.tag}`);
  need(Boolean(x.reason),`${name}: reason missing`);
  need(/^2026-\d\d-\d\d$/.test(x.captured_at||''),`${name}: captured_at missing/invalid`);
}
need(c.players?.["Ja'Marr Chase"]?.tag==='Q',"Ja'Marr Chase current injury tag regression missing");
need(c.players?.['Alvin Kamara']?.tag==='O','Alvin Kamara current injury tag regression missing');
need(c.players?.['Alec Pierce']?.tag==='Q','Alec Pierce current injury tag regression missing');
need(profileContract.status_badge?.clickable===true,'status badge must be clickable');
need(profileContract.status_badge?.labels?.includes('SSPD'),'profile contract missing SSPD');
need(ui.includes("data/sources/step6-5b-player-injury-designations-2026.json"),'profile shell does not load injury designation registry');
need(ui.includes("data/ingestion/live-injury-poll-2026.json"),'profile shell does not prefer live status state');
need(ui.includes("data/calibration/weekly-outcomes-2026.json"),'profile shell does not load recent-game outcomes');
need(ui.includes('function injuryBadge(name)'),'profile shell injury badge renderer missing');
need(ui.includes('data-status-toggle'),'clickable player-status trigger missing');
need(ui.includes('function statusPanel(name)'),'expandable status/news panel missing');
need(ui.includes('Expected return:'),'expected-return display missing');
need(ui.includes('Previous game'),'previous-game news context missing');
need(ui.includes("row('Injury status',inj?.tag||'—')"),'profile injury-status row missing');
need(ui.includes('injuryBadge(p.n)'),'profile hero injury badge missing');
if(fail.length){console.error(JSON.stringify({status:'FAIL',failures:fail},null,2));process.exit(1)}
console.log(JSON.stringify({status:'PASS',tagged_players:Object.keys(c.players||{}).length,labels:[...allowed],profile_ui:true,clickable_status_news:true,recent_game_context:true},null,2));
