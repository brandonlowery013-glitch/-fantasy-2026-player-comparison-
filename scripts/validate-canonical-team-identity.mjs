import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(x,null,2)+'\n');};
const source=read('MODEL_SOURCE_OF_TRUTH.json');
const expected=Number(source.active_player_model),shards=Number(source.runtime_player_shards);
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const alias={LAR:'LA',WSH:'WAS',JAC:'JAX'};
const canon=x=>alias[String(x||'').toUpperCase()]||String(x||'').toUpperCase();
const teamMap={'Arizona Cardinals':'ARI','Atlanta Falcons':'ATL','Baltimore Ravens':'BAL','Buffalo Bills':'BUF','Carolina Panthers':'CAR','Chicago Bears':'CHI','Cincinnati Bengals':'CIN','Cleveland Browns':'CLE','Dallas Cowboys':'DAL','Denver Broncos':'DEN','Detroit Lions':'DET','Green Bay Packers':'GB','Houston Texans':'HOU','Indianapolis Colts':'IND','Jacksonville Jaguars':'JAX','Kansas City Chiefs':'KC','Las Vegas Raiders':'LV','Los Angeles Chargers':'LAC','Los Angeles Rams':'LA','Miami Dolphins':'MIA','Minnesota Vikings':'MIN','New England Patriots':'NE','New Orleans Saints':'NO','New York Giants':'NYG','New York Jets':'NYJ','Philadelphia Eagles':'PHI','Pittsburgh Steelers':'PIT','San Francisco 49ers':'SF','Seattle Seahawks':'SEA','Tampa Bay Buccaneers':'TB','Tennessee Titans':'TEN','Washington Commanders':'WAS'};
let players=[];for(let i=0;i<shards;i++)players.push(...read(`players${i}.json`));
if(players.length!==expected)throw new Error(`Universe mismatch ${players.length}/${expected}`);
async function getJson(url){const r=await fetch(url,{headers:{'user-agent':'fantasy-2026-team-identity-validator/1.0','accept':'application/json'}});if(!r.ok)throw new Error(`${url} -> ${r.status}`);return r.json();}
function rosterNames(payload){const out=[];const seen=new WeakSet();const walk=x=>{if(Array.isArray(x)){x.forEach(walk);return;}if(!x||typeof x!=='object'||seen.has(x))return;seen.add(x);const a=x.athlete||x;const name=a.displayName||a.fullName||null;if(name)out.push(name);for(const v of Object.values(x))if(v&&typeof v==='object'&&v!==a)walk(v);};walk(payload);return [...new Set(out.map(norm).filter(Boolean))];}
function depthNames(payload){const out=[];const seen=new WeakSet();const walk=x=>{if(Array.isArray(x)){x.forEach(walk);return;}if(!x||typeof x!=='object'||seen.has(x))return;seen.add(x);const a=x.athlete||x;const name=a.displayName||a.fullName||null;if(name)out.push(name);for(const v of Object.values(x))if(v&&typeof v==='object'&&v!==a)walk(v);};walk(payload);return [...new Set(out.map(norm).filter(Boolean))];}
const directory=await getJson('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams?limit=40');
const teams=[];for(const row of directory.sports?.[0]?.leagues?.[0]?.teams||[]){const t=row.team||row,abbr=canon(t.abbreviation);if(abbr&&t.id)teams.push([abbr,String(t.id)]);}if(teams.length!==32)throw new Error(`Team directory ${teams.length}/32`);
const liveTeamsByName=new Map();const sourceFailures=[];
for(const [team,id] of teams){try{const [roster,depth]=await Promise.all([getJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${id}/roster`),getJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${id}/depthcharts`)]);for(const name of new Set([...rosterNames(roster),...depthNames(depth)])){if(!liveTeamsByName.has(name))liveTeamsByName.set(name,new Set());liveTeamsByName.get(name).add(team);}}catch(e){sourceFailures.push(`${team}: ${e.message}`);}}
if(sourceFailures.length)throw new Error(`Team identity source failure: ${sourceFailures.join(' | ')}`);
const rows=[];for(const p of players){const canonical=teamMap[p.t]||null;const live=[...(liveTeamsByName.get(norm(p.n))||new Set())];let status='UNRESOLVED_LIVE_TEAM';if(!canonical)status='UNKNOWN_CANONICAL_TEAM';else if(live.length===1&&live[0]===canonical)status='MATCH';else if(live.length===1)status='MISMATCH';else if(live.length>1)status='AMBIGUOUS_LIVE_TEAM';rows.push({player:p.n,position:p.p,canonical_team_name:p.t,canonical_team:canonical,live_teams:live,status});}
const counts=Object.fromEntries(['MATCH','MISMATCH','UNRESOLVED_LIVE_TEAM','UNKNOWN_CANONICAL_TEAM','AMBIGUOUS_LIVE_TEAM'].map(k=>[k,rows.filter(x=>x.status===k).length]));
const report={generated_at:new Date().toISOString(),result:counts.MISMATCH||counts.UNKNOWN_CANONICAL_TEAM||counts.AMBIGUOUS_LIVE_TEAM?'FAIL':'PASS',universe:expected,verified:rows.filter(x=>x.live_teams.length===1).length,counts,mismatches:rows.filter(x=>x.status==='MISMATCH'),unknown_canonical:rows.filter(x=>x.status==='UNKNOWN_CANONICAL_TEAM'),ambiguous:rows.filter(x=>x.status==='AMBIGUOUS_LIVE_TEAM'),unresolved:rows.filter(x=>x.status==='UNRESOLVED_LIVE_TEAM'),policy:'RUNTIME_PLAYER_SHARD_TEAM_IDENTITY_MUST_MATCH_UNIQUE_CURRENT_ESPN_ROSTER_OR_DEPTH_TEAM_BEFORE_TEAM_BOUND_EVIDENCE_IS_ELIGIBLE'};
write('guardrails/canonical-team-identity-report.json',report);
console.log(JSON.stringify(report,null,2));
if(report.result!=='PASS')throw new Error(`Canonical team identity mismatch: ${counts.MISMATCH} mismatches, ${counts.UNKNOWN_CANONICAL_TEAM} unknown, ${counts.AMBIGUOUS_LIVE_TEAM} ambiguous`);
