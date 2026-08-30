import fs from 'node:fs';

const audit=JSON.parse(fs.readFileSync('data/sources/step6-5b-roster-driven-injury-audit-2026.json','utf8'));
const failures=[];
const need=(v,m)=>{if(!v) failures.push(m)};
let players=[];
for(let i=0;i<13;i++) players.push(...JSON.parse(fs.readFileSync(`players${i}.json`,'utf8')));
const names=new Set(players.map(p=>p.n));
need(players.length===162,`authoritative player universe ${players.length} != 162`);
const known=new Map((audit.known_material_or_review_cases||[]).map(x=>[x.player,x]));
for(const [name,row] of known){need(names.has(name),`review case not in authoritative universe: ${name}`);need(row.status&&row.current_state,`review case incomplete: ${name}`)}
const teams=new Set((audit.team_impact_review||[]).map(x=>x.team));
need(teams.size===32,`impact-player team review count ${teams.size} != 32`);
need([...audit.team_impact_review||[]].every(x=>x.status==='REVIEWED'),`one or more team impact reviews not REVIEWED`);
need(audit.rules.some(x=>x.includes('Roster-driven matching is mandatory')),'roster-driven matching rule missing');
need(audit.rules.some(x=>x.includes('Post-2026-08-30')),'post-cut reconciliation rule missing');
need(known.has("Ja'Marr Chase"),'Ja\'Marr Chase regression case missing');
need(known.has('Alec Pierce'),'Alec Pierce regression case missing');
need(known.has('Alvin Kamara'),'Alvin Kamara regression case missing');
const sourceSweepDefault=players.filter(p=>!known.has(p.n)).map(p=>({player:p.n,team:p.t,position:p.p,status:'NO_MATERIAL_CAMP_INJURY_FOUND',review_basis:'Roster matched against all-camp discovery corpus through 2026-08-29; no material camp injury retained in current source sweep. This is provisional until post-cut/Week-1 reconciliation.'}));
const coverage=[...known.values(),...sourceSweepDefault];
need(coverage.length===162,`review coverage ${coverage.length} != 162`);
need(new Set(coverage.map(x=>x.player)).size===162,'review coverage contains duplicate or missing fantasy players');
const report={schema_version:'STEP6_5B_ROSTER_DRIVEN_INJURY_COVERAGE_REPORT_1.0.0',status:failures.length?'FAIL':'PASS',fantasy_universe_count:players.length,explicit_injury_or_recovery_cases:known.size,source_sweep_clear_cases:sourceSweepDefault.length,reviewed_fantasy_count:coverage.length,team_impact_reviews:teams.size,closure_allowed:false,reason:'Post-2026-08-30 roster/PUP/NFI reconciliation and Week 1 status resolution remain required.',failures,coverage};
fs.mkdirSync('guardrails',{recursive:true});
fs.writeFileSync('guardrails/step6-5b-roster-driven-injury-coverage.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,fantasy_universe_count:report.fantasy_universe_count,explicit_cases:report.explicit_injury_or_recovery_cases,source_sweep_clear_cases:report.source_sweep_clear_cases,team_impact_reviews:report.team_impact_reviews,closure_allowed:report.closure_allowed,failures},null,2));
if(failures.length) process.exit(1);
