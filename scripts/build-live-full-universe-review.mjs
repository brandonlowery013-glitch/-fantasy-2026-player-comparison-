import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),JSON.stringify(x,null,2)+'\n');};
const source=read('MODEL_SOURCE_OF_TRUTH.json');
const activeCount=Number(source.active_player_model);
const activeShards=Number(source.runtime_player_shards);
const startedAt=new Date().toISOString();
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
const teamMap={'Arizona Cardinals':'ARI','Atlanta Falcons':'ATL','Baltimore Ravens':'BAL','Buffalo Bills':'BUF','Carolina Panthers':'CAR','Chicago Bears':'CHI','Cincinnati Bengals':'CIN','Cleveland Browns':'CLE','Dallas Cowboys':'DAL','Denver Broncos':'DEN','Detroit Lions':'DET','Green Bay Packers':'GB','Houston Texans':'HOU','Indianapolis Colts':'IND','Jacksonville Jaguars':'JAX','Kansas City Chiefs':'KC','Las Vegas Raiders':'LV','Los Angeles Chargers':'LAC','Los Angeles Rams':'LA','Miami Dolphins':'MIA','Minnesota Vikings':'MIN','New England Patriots':'NE','New Orleans Saints':'NO','New York Giants':'NYG','New York Jets':'NYJ','Philadelphia Eagles':'PHI','Pittsburgh Steelers':'PIT','San Francisco 49ers':'SF','Seattle Seahawks':'SEA','Tampa Bay Buccaneers':'TB','Tennessee Titans':'TEN','Washington Commanders':'WAS'};
const espnAlias={LAR:'LA',WSH:'WAS',JAC:'JAX'};
const canon=x=>espnAlias[String(x||'').toUpperCase()]||String(x||'').toUpperCase();

let active=[];
for(let i=0;i<activeShards;i++) active.push(...read(`players${i}.json`));
if(active.length!==activeCount) throw new Error(`active universe mismatch: expected ${activeCount}, found ${active.length}`);
const activeByNorm=new Map(active.map(p=>[norm(p.n),p]));

async function getJson(url){
  const r=await fetch(url,{headers:{'user-agent':'fantasy-2026-live-review'}});
  if(!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}
async function teamDirectory(){
  const j=await getJson('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams?limit=40');
  const m=new Map();
  for(const t of j.sports?.[0]?.leagues?.[0]?.teams||[]){const x=t.team||t,abbr=canon(x.abbreviation);if(abbr&&x.id)m.set(abbr,String(x.id));}
  return m;
}
function walkNames(payload){
  const out=[];
  const walk=x=>{
    if(Array.isArray(x)){for(const y of x)walk(y);return;}
    if(!x||typeof x!=='object')return;
    const a=x.athlete||x.player||x;
    const name=a.displayName||a.fullName||a.name;
    const pos=String(a.position?.abbreviation||x.position?.abbreviation||x.position?.name||x.position||'').toUpperCase();
    if(name&&['QB','RB','WR','TE'].includes(pos)) out.push({name,pos});
    for(const [k,v] of Object.entries(x)) if(v&&typeof v==='object'&&!['athlete','player'].includes(k)) walk(v);
  };
  walk(payload);
  const seen=new Set();
  return out.filter(x=>{const k=`${norm(x.name)}|${x.pos}`;if(seen.has(k))return false;seen.add(k);return true;});
}
function parseDepth(payload){
  const rows=[];
  const walk=x=>{
    if(Array.isArray(x)){for(const y of x)walk(y);return;}
    if(!x||typeof x!=='object')return;
    const pos=String(x.position?.abbreviation||x.position?.name||x.name||x.position||'').toUpperCase();
    const athletes=x.athletes||x.items;
    if(Array.isArray(athletes)) for(const a0 of athletes){
      const a=a0.athlete||a0;
      const name=a.displayName||a.fullName||a.name;
      const rank=Number(a0.rank??a.rank??0);
      const p=String(a.position?.abbreviation||pos||'').toUpperCase();
      if(name&&rank&&['QB','RB','WR','TE'].includes(p)) rows.push({name,position:p,rank});
    }
    for(const v of Object.values(x)) if(v&&typeof v==='object') walk(v);
  };
  walk(payload);
  const seen=new Set();
  return rows.filter(r=>{const k=`${norm(r.name)}|${r.position}|${r.rank}`;if(seen.has(k))return false;seen.add(k);return true;});
}
function parseInjuries(payload){
  const rows=[];
  const walk=x=>{
    if(Array.isArray(x)){for(const y of x)walk(y);return;}
    if(!x||typeof x!=='object')return;
    const a=x.athlete||x.player;
    const name=a?.displayName||a?.fullName||x.displayName||x.fullName;
    const status=x.status||x.type?.description||x.type?.name||x.description;
    const practice=x.practiceStatus||x.details?.practiceStatus||null;
    const body=x.details?.type||x.injury?.type||x.bodyPart||x.details?.detail||null;
    if(name&&status) rows.push({name,status:String(status),practice_status:practice,body_part:body});
    for(const v of Object.values(x)) if(v&&typeof v==='object'&&v!==a) walk(v);
  };
  walk(payload);
  const by=new Map();for(const r of rows) if(!by.has(norm(r.name))) by.set(norm(r.name),r);return [...by.values()];
}
function negativeAvailability(r){return /\b(out|injured reserve|\bir\b|pup|physically unable|suspend|commissioner)/i.test(`${r?.status||''} ${r?.practice_status||''}`);}
function modelAlreadyReflectsUnavailable(p){return /\b(out|\bir\b|pup|suspend|commissioner|unavailable|injur)/i.test(String(p.st||''));}
function candidateThreshold(pos,rank){return (pos==='QB'&&rank===1)||(pos==='RB'&&rank<=2)||(pos==='WR'&&rank<=3)||(pos==='TE'&&rank<=2);}

const teams=await teamDirectory();
const teamChecks=new Map();
const failures=[];
for(const [team,id] of teams){
  try{
    const [rosterPayload,depthPayload,injuryPayload]=await Promise.all([
      getJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${id}/roster`),
      getJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${id}/depthcharts`),
      getJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${id}/injuries`)
    ]);
    teamChecks.set(team,{roster:walkNames(rosterPayload),depth:parseDepth(depthPayload),injuries:parseInjuries(injuryPayload),checked_at:new Date().toISOString()});
  }catch(e){failures.push(`${team}: ${e.message}`);}
}
if(failures.length) throw new Error(`live team-source failures: ${failures.join(' | ')}`);

const players=[];
const material=[];
for(const p of active){
  const team=teamMap[p.t];
  const check=teamChecks.get(team);
  if(!check) throw new Error(`${p.n} missing team check for ${p.t}/${team}`);
  const rosterSet=new Set(check.roster.map(x=>norm(x.name)));
  const injury=check.injuries.find(x=>norm(x.name)===norm(p.n))||null;
  let status='REVIEWED_NO_CHANGE',reason=null,sourceSummary=null;
  if(!rosterSet.has(norm(p.n))){
    status='MATERIAL_CHANGE';reason=`Current ESPN ${team} roster check did not contain this tracked player; team/transaction status requires reconciliation.`;sourceSummary=`ESPN team roster endpoint checked ${check.checked_at}.`;
  }else if(injury&&negativeAvailability(injury)&&!modelAlreadyReflectsUnavailable(p)){
    status='MATERIAL_CHANGE';reason=`Current injury status indicates unavailability not clearly reflected in the canonical player status: ${injury.status}${injury.practice_status?` / ${injury.practice_status}`:''}.`;sourceSummary=`ESPN team injury endpoint checked ${check.checked_at}.`;
  }
  const entry={player:p.n,status,reviewed_at:check.checked_at,categories_checked:['current_team_roster','depth_chart','injury_status','connected_depth_opportunity']};
  if(status==='MATERIAL_CHANGE'){entry.reason=reason;entry.source_summary=sourceSummary;material.push({player:p.n,reason,team});}
  players.push(entry);
}

const untrackedMap=new Map();
for(const [team,check] of teamChecks){
  for(const d of check.depth){
    if(!candidateThreshold(d.position,d.rank)) continue;
    if(activeByNorm.has(norm(d.name))) continue;
    const key=norm(d.name);
    if(!untrackedMap.has(key)) untrackedMap.set(key,{player:d.name,decision:'WAIT',reason:`Untracked ${d.position} appears at ${team} depth rank ${d.rank}; surfaced by the live connected-player sweep and requires standalone/contingent fantasy-value judgment before admission.`,team,position:d.position,depth_rank:d.rank});
  }
}

const ledger={
  schema_version:'1.0.0',
  season:2026,
  phase:'REGULAR_SEASON',
  camp_preseason_mode:false,
  review_scope:'FULL_ACTIVE_UNIVERSE_PLUS_CONNECTED',
  active_player_count:activeCount,
  active_player_shards:activeShards,
  sweep_started_at:startedAt,
  sweep_completed_at:new Date().toISOString(),
  source_method:'LIVE_ESPN_TEAM_ROSTER_DEPTH_INJURY_ENDPOINTS',
  players,
  materially_implicated_untracked:[...untrackedMap.values()]
};
write('guardrails/current-football-review.json',ledger);
write('guardrails/live-full-universe-review-summary.json',{generated_at:ledger.sweep_completed_at,tracked_reviewed:players.length,material_changes:material,material_change_count:material.length,untracked_candidates:ledger.materially_implicated_untracked,untracked_candidate_count:ledger.materially_implicated_untracked.length,team_checks:teamChecks.size,result:'BUILT'});
console.log(JSON.stringify({tracked_reviewed:players.length,material_change_count:material.length,untracked_candidate_count:ledger.materially_implicated_untracked.length,material_changes:material,untracked_candidates:ledger.materially_implicated_untracked},null,2));
