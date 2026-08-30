import fs from 'node:fs';

const p='data/sources/step6-5b-player-injury-designations-2026.json';
const c=JSON.parse(fs.readFileSync(p,'utf8'));
const ui=fs.readFileSync('index.html','utf8');
const fail=[];
const need=(v,m)=>{if(!v)fail.push(m)};
const allowed=new Set(['Q','D','O','IR']);
need(c.schema_version==='STEP6_5B_PLAYER_INJURY_DESIGNATIONS_1.0.0','schema mismatch');
need(c.season===2026,'season mismatch');
need(c.display_labels&&Object.keys(c.display_labels).sort().join(',')==='D,IR,O,Q','required Q/D/O/IR labels missing');
need(Array.isArray(c.rules)&&c.rules.some(x=>x.includes('stale Q/D/O tags are prohibited')),'stale-tag prohibition missing');
need(c.rules.some(x=>x.includes('reserve/injured transaction')),'IR transaction rule missing');
for(const [name,x] of Object.entries(c.players||{})){
  need(allowed.has(x.tag),`${name}: invalid tag ${x.tag}`);
  need(Boolean(x.reason),`${name}: reason missing`);
  need(/^2026-\d\d-\d\d$/.test(x.captured_at||''),`${name}: captured_at missing/invalid`);
}
need(c.players?.["Ja'Marr Chase"]?.tag==='Q',"Ja'Marr Chase current injury tag regression missing");
need(c.players?.['Alvin Kamara']?.tag==='O','Alvin Kamara current injury tag regression missing');
need(c.players?.['Alec Pierce']?.tag==='Q','Alec Pierce current injury tag regression missing');
need(ui.includes("data/sources/step6-5b-player-injury-designations-2026.json"),'profile shell does not load injury designation registry');
need(ui.includes('function injuryBadge(name)'),'profile shell injury badge renderer missing');
need(ui.includes("row('Injury status',inj?.tag||'—')"),'profile injury-status row missing');
need(ui.includes('injuryBadge(p.n)'),'profile hero injury badge missing');
if(fail.length){console.error(JSON.stringify({status:'FAIL',failures:fail},null,2));process.exit(1)}
console.log(JSON.stringify({status:'PASS',tagged_players:Object.keys(c.players||{}).length,labels:[...allowed],profile_ui:true},null,2));
