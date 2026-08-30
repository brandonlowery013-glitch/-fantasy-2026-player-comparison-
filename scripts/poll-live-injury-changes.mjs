import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const outPath='data/ingestion/live-injury-poll-2026.json';
const outFile=process.env.GITHUB_OUTPUT||null;
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
const canon=x=>({LAR:'LA',WSH:'WAS',JAC:'JAX'}[String(x||'').toUpperCase()]||String(x||'').toUpperCase());
const teamMap={'Arizona Cardinals':'ARI','Atlanta Falcons':'ATL','Baltimore Ravens':'BAL','Buffalo Bills':'BUF','Carolina Panthers':'CAR','Chicago Bears':'CHI','Cincinnati Bengals':'CIN','Cleveland Browns':'CLE','Dallas Cowboys':'DAL','Denver Broncos':'DEN','Detroit Lions':'DET','Green Bay Packers':'GB','Houston Texans':'HOU','Indianapolis Colts':'IND','Jacksonville Jaguars':'JAX','Kansas City Chiefs':'KC','Las Vegas Raiders':'LV','Los Angeles Chargers':'LAC','Los Angeles Rams':'LA','Miami Dolphins':'MIA','Minnesota Vikings':'MIN','New England Patriots':'NE','New Orleans Saints':'NO','New York Giants':'NYG','New York Jets':'NYJ','Philadelphia Eagles':'PHI','Pittsburgh Steelers':'PIT','San Francisco 49ers':'SF','Seattle Seahawks':'SEA','Tampa Bay Buccaneers':'TB','Tennessee Titans':'TEN','Washington Commanders':'WAS'};
const readJson=p=>{try{return JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));}catch{return null;}};
const players=[];for(let i=0;i<13;i++)for(const p of readJson(`players${i}.json`)||[])players.push({name:p.n,team:teamMap[p.t],position:p.p});
const byName=new Map(players.map(p=>[norm(p.name),p]));

function designation(status,practice){const s=`${status||''} ${practice||''}`.toLowerCase();if(/suspend|suspension|sspd/.test(s))return 'SSPD';if(/injured reserve|reserve\/injured|\bir\b/.test(s))return 'IR';if(/\bout\b|physically unable|\bpup\b|\bnfi\b/.test(s))return 'O';if(/doubtful/.test(s))return 'D';if(/questionable|limited|did not practice|dnp/.test(s))return 'Q';if(/full participant|full practice|active/.test(s))return 'CLEARED';return null;}
function stableRows(rows){const priority={SSPD:6,IR:5,O:4,D:3,Q:2,CLEARED:1};const by=new Map();for(const r of rows){const prev=by.get(r.player);if(!prev||(priority[r.designation]||0)>(priority[prev.designation]||0))by.set(r.player,r);}return [...by.values()].sort((a,b)=>a.player.localeCompare(b.player)).map(x=>({player:x.player,team:x.team,position:x.position,designation:x.designation,status:x.status||null,practice_status:x.practice_status||null,body_part:x.body_part||null,source:x.source||null}));}
function changed(prev,next){const a=JSON.stringify(stableRows(prev?.players||[])),b=JSON.stringify(stableRows(next.players||[]));return a!==b;}
async function getJson(url){const r=await fetch(url,{headers:{'user-agent':'fantasy-2026-injury-poll'}});if(!r.ok)throw new Error(`${url} -> ${r.status}`);return r.json();}
function parseInjury(payload,team){const out=[];const walk=x=>{if(Array.isArray(x)){for(const y of x)walk(y);return;}if(!x||typeof x!=='object')return;const athlete=x.athlete||x.player;const rawName=athlete?.displayName||athlete?.fullName||x.displayName||x.fullName;const p=byName.get(norm(rawName));const status=x.status||x.type?.description||x.type?.name||x.description;const practice=x.practiceStatus||x.details?.practiceStatus||null;const body=x.details?.type||x.injury?.type||x.bodyPart||x.details?.detail||null;if(p&&p.team===team&&status){const d=designation(status,practice);if(d)out.push({player:p.name,team:p.team,position:p.position,designation:d,status:String(status),practice_status:practice,body_part:body,source:'ESPN public NFL team injury endpoint'});}for(const v of Object.values(x))if(v&&typeof v==='object'&&v!==athlete)walk(v);};walk(payload);return out;}
function parseRosterSuspensions(payload,team){const out=[];const walk=x=>{if(Array.isArray(x)){for(const y of x)walk(y);return;}if(!x||typeof x!=='object')return;const rawName=x.displayName||x.fullName||x.name||x.athlete?.displayName||x.athlete?.fullName;const p=byName.get(norm(rawName));const statusParts=[x.status,x.status?.name,x.status?.description,x.type?.name,x.type?.description,x.description,x.rosterStatus,x.roster_status].filter(v=>typeof v==='string');const status=statusParts.join(' ');if(p&&p.team===team&&/suspend|suspension|sspd/i.test(status))out.push({player:p.name,team:p.team,position:p.position,designation:'SSPD',status:status||'Suspended',practice_status:null,body_part:null,source:'ESPN public NFL team roster endpoint'});for(const v of Object.values(x))if(v&&typeof v==='object')walk(v);};walk(payload);return out;}
async function live(){const d=await getJson('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams?limit=40');const teams=new Map();for(const t of d.sports?.[0]?.leagues?.[0]?.teams||[]){const x=t.team||t,a=canon(x.abbreviation);if(a&&x.id)teams.set(a,String(x.id));}const rows=[];const errors=[];for(const [team,id] of teams){if(!players.some(p=>p.team===team))continue;try{rows.push(...parseInjury(await getJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${id}/injuries`),team));}catch(e){errors.push(`injury ${team}: ${e.message}`);}try{rows.push(...parseRosterSuspensions(await getJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${id}/roster`),team));}catch(e){errors.push(`roster ${team}: ${e.message}`);}}return {rows,errors};}
function synthetic(){return {rows:[{player:"Ja'Marr Chase",team:'CIN',position:'WR',designation:'Q',status:'Questionable',practice_status:'Limited',body_part:'Knee',source:'self-test injury'},{player:'Rashee Rice',team:'KC',position:'WR',designation:'SSPD',status:'Suspended',practice_status:null,body_part:null,source:'self-test roster'}],errors:[]};}
function runTransitionTests(){const q={player:'Test Player',team:'CHI',position:'WR',designation:'Q',status:'Questionable',practice_status:'Limited',body_part:'Hamstring',source:'self-test'};const o={...q,designation:'O',status:'Out',practice_status:'Did Not Practice'};const s={...q,designation:'SSPD',status:'Suspended',practice_status:null,body_part:null};const cases=[
  ['healthy_to_q',{players:[]},{players:[q]},true],
  ['q_to_o',{players:[q]},{players:[o]},true],
  ['o_to_cleared',{players:[o]},{players:[]},true],
  ['active_to_sspd',{players:[]},{players:[s]},true],
  ['sspd_to_cleared',{players:[s]},{players:[]},true],
  ['unchanged_q',{players:[q]},{players:[q]},false]
];const results=cases.map(([name,prev,next,expected])=>({name,expected,actual:changed(prev,next),pass:changed(prev,next)===expected}));const designationChecks=[['Suspended',null,'SSPD'],['Injured Reserve',null,'IR'],['Out',null,'O'],['Doubtful',null,'D'],['Questionable',null,'Q'],['Active','Full Practice','CLEARED']].map(([status,practice,expected])=>({status,practice,expected,actual:designation(status,practice),pass:designation(status,practice)===expected}));return {results,designationChecks,pass:results.every(x=>x.pass)&&designationChecks.every(x=>x.pass)};}

const self=process.argv.includes('--self-test');
const prev=readJson(outPath);
const result=self?synthetic():await live();
const capturedAt=process.env.INJURY_POLL_CAPTURED_AT||new Date().toISOString();
const next={schema_version:'LIVE_INJURY_POLL_1.3.0',season:2026,captured_at:capturedAt,status:result.errors.length?'PARTIAL':'CURRENT',source:'ESPN public NFL team injury + roster endpoints',authoritative_cross_check:'NFL.com official injury/practice/game-status and suspension reporting',players:stableRows(result.rows),errors:result.errors};
const isChanged=self?true:changed(prev,next);
const transitionTests=self?runTransitionTests():null;
fs.mkdirSync(path.dirname(path.join(root,outPath)),{recursive:true});
fs.writeFileSync(path.join(root,outPath),JSON.stringify(next,null,2)+'\n');
const report={result:result.errors.length?'PARTIAL':'PASS',changed:isChanged,players:next.players.length,sspd:next.players.filter(x=>x.designation==='SSPD').length,errors:result.errors,...(transitionTests?{transition_tests:transitionTests}: {})};
fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});
fs.writeFileSync(path.join(root,'guardrails/live-injury-poll-report.json'),JSON.stringify(report,null,2)+'\n');
if(outFile){fs.appendFileSync(outFile,`changed=${isChanged?'true':'false'}\n`);fs.appendFileSync(outFile,`players=${next.players.length}\n`);}
console.log(JSON.stringify(report,null,2));
if(self&&(!next.players.some(x=>x.player==="Ja'Marr Chase"&&x.designation==='Q')||!next.players.some(x=>x.designation==='SSPD')||!isChanged||!transitionTests?.pass))process.exit(1);
