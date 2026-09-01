import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const write = (p, x) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), JSON.stringify(x, null, 2) + '\n'); };
const contract = read('data/sources/nfl-event-ingestion-2026.json');
const guardrails = read('guardrails/guardrails-config.json');
const ledgerPath = contract.outputs.event_ledger;
const statePath = contract.outputs.current_state;
const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/[^a-z0-9]/g, '');
const canonTeam = x => ({LAR:'LA',WSH:'WAS',JAC:'JAX'}[String(x||'').toUpperCase()] || String(x||'').toUpperCase());
const iso = x => { const t = Date.parse(String(x || '')); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
const stable = x => Array.isArray(x) ? x.map(stable) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, stable(x[k])])) : x;
const fp = x => crypto.createHash('sha256').update(JSON.stringify(stable(x))).digest('hex').slice(0, 24);
const fullTeamToAbbr = {'Arizona Cardinals':'ARI','Atlanta Falcons':'ATL','Baltimore Ravens':'BAL','Buffalo Bills':'BUF','Carolina Panthers':'CAR','Chicago Bears':'CHI','Cincinnati Bengals':'CIN','Cleveland Browns':'CLE','Dallas Cowboys':'DAL','Denver Broncos':'DEN','Detroit Lions':'DET','Green Bay Packers':'GB','Houston Texans':'HOU','Indianapolis Colts':'IND','Jacksonville Jaguars':'JAX','Kansas City Chiefs':'KC','Las Vegas Raiders':'LV','Los Angeles Chargers':'LAC','Los Angeles Rams':'LA','Miami Dolphins':'MIA','Minnesota Vikings':'MIN','New England Patriots':'NE','New Orleans Saints':'NO','New York Giants':'NYG','New York Jets':'NYJ','Philadelphia Eagles':'PHI','Pittsburgh Steelers':'PIT','San Francisco 49ers':'SF','Seattle Seahawks':'SEA','Tampa Bay Buccaneers':'TB','Tennessee Titans':'TEN','Washington Commanders':'WAS'};

function loadTrackedPlayers(){
  const out=[];
  for(let i=0;i<Number(guardrails.authoritative_player_shards);i++){
    const shard = read(`players${i}.json`);
    for(const p of shard){
      const team = fullTeamToAbbr[p.t];
      if(!team) throw new Error(`Unknown team for ${p.n}: ${p.t}`);
      out.push({name:p.n, position:String(p.p||'').toUpperCase(), team});
    }
  }
  if(out.length !== Number(guardrails.authoritative_player_count)) throw new Error(`Tracked player count ${out.length} != authoritative ${guardrails.authoritative_player_count}`);
  return out;
}

async function getJson(url){
  const r = await fetch(url, {headers:{'user-agent':'fantasy-2026-event-ingestion'}});
  if(!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function teamDirectory(){
  const j = await getJson('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams?limit=40');
  const out=[];
  for(const row of j.sports?.[0]?.leagues?.[0]?.teams || []){
    const t=row.team||row;
    const team=canonTeam(t.abbreviation);
    if(team && t.id) out.push({team,id:String(t.id)});
  }
  return out;
}

function parseRoster(payload){
  const rows=[];
  const walk=x=>{
    if(Array.isArray(x)){ for(const y of x) walk(y); return; }
    if(!x || typeof x!=='object') return;
    const athlete=x.athlete||x.player||x;
    const name=athlete.displayName||athlete.fullName||x.displayName||x.fullName;
    const position=String(athlete.position?.abbreviation||x.position?.abbreviation||x.position||'').toUpperCase();
    if(name && ['QB','RB','WR','TE'].includes(position)) rows.push({name,position});
    for(const [k,v] of Object.entries(x)) if(v && typeof v==='object' && !['athlete','player'].includes(k)) walk(v);
  };
  walk(payload.athletes||payload.items||payload);
  const by=new Map();
  for(const r of rows) if(!by.has(norm(r.name))) by.set(norm(r.name),r);
  return [...by.values()];
}

function parseDepth(payload){
  const rows=[];
  const walk=x=>{
    if(Array.isArray(x)){ for(const y of x) walk(y); return; }
    if(!x || typeof x!=='object') return;
    const pos=String(x.position?.abbreviation||x.position?.name||x.name||x.position||'').toUpperCase();
    const athletes=x.athletes||x.items;
    if(Array.isArray(athletes)) for(const a of athletes){
      const athlete=a.athlete||a;
      const name=athlete.displayName||athlete.fullName||athlete.name;
      const rank=Number(a.rank??athlete.rank??0);
      const position=String(athlete.position?.abbreviation||pos||'').toUpperCase();
      if(name && rank && ['QB','RB','WR','TE'].includes(position)) rows.push({name,rank,position});
    }
    for(const v of Object.values(x)) if(v && typeof v==='object') walk(v);
  };
  walk(payload.depthchart||payload.depthcharts||payload.items||payload);
  const seen=new Set();
  return rows.filter(r=>{ const k=`${norm(r.name)}|${r.position}|${r.rank}`; if(seen.has(k)) return false; seen.add(k); return true; });
}

function parseInjuries(payload){
  const out=[];
  const walk=x=>{
    if(Array.isArray(x)){ for(const y of x) walk(y); return; }
    if(!x || typeof x!=='object') return;
    const athlete=x.athlete||x.player;
    const name=athlete?.displayName||athlete?.fullName||x.displayName||x.fullName;
    const status=x.status||x.type?.description||x.type?.name||x.description;
    const practice=x.practiceStatus||x.details?.practiceStatus||null;
    const body=x.details?.type||x.injury?.type||x.bodyPart||x.details?.detail||null;
    if(name && status) out.push({name,status:String(status),practice_status:practice,body_part:body,source_updated_at:iso(x.date||x.updated||x.lastUpdated)});
    for(const v of Object.values(x)) if(v && typeof v==='object' && v!==athlete) walk(v);
  };
  walk(payload);
  const by=new Map();
  for(const r of out) if(!by.has(norm(r.name))) by.set(norm(r.name),r);
  return [...by.values()];
}

function availability(injury){
  if(!injury) return null;
  const s=`${injury.status||''} ${injury.practice_status||''}`.toLowerCase();
  if(/\b(out|injured reserve|\bir\b|physically unable|\bpup\b|suspend|commissioner.*exempt|exempt list|nfi)\b/.test(s)) return {expected_active:false,status:injury.status,practice_status:injury.practice_status,body_part:injury.body_part};
  if(/\b(active|full participant|full practice)\b/.test(s)) return {expected_active:true,status:injury.status,practice_status:injury.practice_status,body_part:injury.body_part};
  return {expected_active:null,status:injury.status,practice_status:injury.practice_status,body_part:injury.body_part};
}

function roleFor(position,rank){
  if(!rank) return null;
  if(position==='QB') return rank===1?'QB1':`QB${rank}`;
  if(position==='RB') return rank===1?'RB1':rank===2?'RB2':`RB${rank}`;
  if(position==='WR') return rank===1?'WR1':rank===2?'WR2':rank===3?'WR3':`WR${rank}`;
  if(position==='TE') return rank===1?'TE1':`TE${rank}`;
  return null;
}

function materiality(type){
  for(const [band,types] of Object.entries(contract.materiality)) if(types.includes(type)) return band;
  return 'MEDIUM';
}

function mkEvent(type, entityType, name, team, prev, next, source, captured, extra={}){
  const evidence={type,entityType,name,team,prev,next,source,...extra};
  const evidence_fingerprint=fp(evidence);
  return {
    event_id:`2026-${type}-${norm(name||team)}-${evidence_fingerprint}`,
    event_type:type,
    entity_type:entityType,
    entity_id_or_name:name||team,
    team:team||null,
    previous_state:prev??null,
    new_state:next??null,
    materiality:materiality(type),
    source,
    captured_at:captured,
    evidence_fingerprint,
    requires_connected_impact_review:['CRITICAL','HIGH','MEDIUM'].includes(materiality(type)),
    downstream_status:'PENDING_CONNECTED_IMPACT',
    ...extra
  };
}

function changed(a,b){ return JSON.stringify(stable(a??null)) !== JSON.stringify(stable(b??null)); }

function comparePlayer(prev,next,captured,events){
  const source='ESPN public NFL injury/depth-chart endpoints; NFL.com authoritative cross-check required for consequential status';
  if(prev.availability_observed && next.availability_observed && changed(prev.availability,next.availability)){
    let type='AVAILABILITY_CHANGE';
    if(prev.availability?.expected_active===false && next.availability?.expected_active===true) type='RETURN_TO_ACTIVE';
    events.push(mkEvent(type,'player',next.name,next.team,prev.availability,next.availability,source,captured));
  }
  if(prev.depth_observed && next.depth_observed && (prev.depth_rank!==next.depth_rank || prev.role!==next.role)){
    const type=(prev.depth_rank===1 || next.depth_rank===1)?'STARTER_CHANGE':'ROLE_CHANGE';
    events.push(mkEvent(type,'player',next.name,next.team,{depth_rank:prev.depth_rank,role:prev.role},{depth_rank:next.depth_rank,role:next.role},'ESPN public NFL team depth-chart endpoint',captured));
  }
  if(prev.roster_observed && next.roster_observed && prev.team && next.team && prev.team!==next.team){
    events.push(mkEvent('TEAM_CHANGE','player',next.name,next.team,{team:prev.team},{team:next.team},'ESPN public NFL team roster endpoint; NFL.com official transaction classification pending',captured,{official_transaction_classification:'PENDING'}));
  }
}

function selfTest(){
  const now='2026-09-01T03:00:00.000Z';
  const events=[];
  const p1={name:'Test RB',team:'GB',availability_observed:true,availability:{expected_active:false,status:'Out'},depth_observed:true,depth_rank:2,role:'RB2',roster_observed:true};
  const p2={name:'Test RB',team:'GB',availability_observed:true,availability:{expected_active:true,status:'Active'},depth_observed:true,depth_rank:1,role:'RB1',roster_observed:true};
  comparePlayer(p1,p2,now,events);
  const failures=[];
  if(!events.some(e=>e.event_type==='RETURN_TO_ACTIVE')) failures.push('return event missing');
  if(!events.some(e=>e.event_type==='STARTER_CHANGE')) failures.push('starter change missing');
  if(events.some(e=>['o','tr','projection','rank','market_value'].some(k=>Object.prototype.hasOwnProperty.call(e,k)))) failures.push('event wrote prohibited model output');
  const ids=new Set(events.map(e=>e.event_id));
  if(ids.size!==events.length) failures.push('duplicate event ids');
  console.log(JSON.stringify({generated_at:now,result:failures.length?'BLOCKED':'PASS',events:events.map(e=>e.event_type),failures},null,2));
  if(failures.length) process.exit(1);
}

async function main(){
  if(process.argv.includes('--self-test')) return selfTest();
  const captured=process.env.EVENT_CAPTURED_AT || new Date().toISOString();
  const prevState=read(statePath);
  const ledger=read(ledgerPath);
  const tracked=loadTrackedPlayers();
  const trackedByName=new Map(tracked.map(p=>[norm(p.name),p]));
  const teams=await teamDirectory();
  const source_health={};
  const observedPlayers=new Map();
  const teamState={};
  const fetchSafe=async(label,url)=>{try{const x=await getJson(url);source_health[label]={ok:true,captured_at:captured};return x;}catch(e){source_health[label]={ok:false,captured_at:captured,error:e.message};return null;}};

  for(const {team,id} of teams){
    const rosterPayload=await fetchSafe(`roster:${team}`,`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${id}/roster`);
    const depthPayload=await fetchSafe(`depth:${team}`,`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${id}/depthcharts`);
    const injuryPayload=await fetchSafe(`injury:${team}`,`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${id}/injuries`);
    const roster=rosterPayload?parseRoster(rosterPayload):null;
    const depth=depthPayload?parseDepth(depthPayload):null;
    const injuries=injuryPayload?parseInjuries(injuryPayload):null;
    const depthBy=depth?new Map(depth.map(x=>[norm(x.name),x])):new Map();
    const injuryBy=injuries?new Map(injuries.map(x=>[norm(x.name),x])):new Map();
    const rosterBy=roster?new Map(roster.map(x=>[norm(x.name),x])):new Map();
    const qb1=depth?.find(x=>x.position==='QB'&&x.rank===1)?.name||null;
    teamState[team]={
      roster_observed:Boolean(roster),
      roster:roster?roster.map(x=>({name:x.name,position:x.position})):prevState.teams?.[team]?.roster||[],
      depth_observed:Boolean(depth),
      qb1:depth?qb1:(prevState.teams?.[team]?.qb1||null),
      captured_at:captured
    };
    const names=new Set([...tracked.filter(p=>p.team===team).map(p=>norm(p.name)),...rosterBy.keys(),...depthBy.keys(),...injuryBy.keys()]);
    for(const key of names){
      const prior=prevState.players?.[key]||{};
      const canonical=trackedByName.get(key);
      const rosterRow=rosterBy.get(key);
      const depthRow=depthBy.get(key);
      const injuryRow=injuryBy.get(key);
      const name=canonical?.name||rosterRow?.name||depthRow?.name||injuryRow?.name||prior.name;
      const position=canonical?.position||rosterRow?.position||depthRow?.position||prior.position||null;
      observedPlayers.set(key,{
        name,
        position,
        team,
        tracked:Boolean(canonical),
        roster_observed:Boolean(roster),
        on_roster:roster?rosterBy.has(key):(prior.on_roster??null),
        depth_observed:Boolean(depth),
        depth_rank:depth?(depthRow?.rank??null):(prior.depth_rank??null),
        role:depth?roleFor(position,depthRow?.rank):(prior.role??null),
        availability_observed:Boolean(injuries && injuryRow),
        availability:injuryRow?availability(injuryRow):(prior.availability??null),
        captured_at:captured
      });
    }
  }

  const events=[];
  const prevPlayers=prevState.players||{};
  for(const [key,next] of observedPlayers){
    const prev=prevPlayers[key];
    if(prev) comparePlayer(prev,next,captured,events);
  }

  for(const [team,nextTeam] of Object.entries(teamState)){
    const prevTeam=prevState.teams?.[team];
    if(prevTeam?.depth_observed && nextTeam.depth_observed && prevTeam.qb1 && nextTeam.qb1 && norm(prevTeam.qb1)!==norm(nextTeam.qb1)){
      events.push(mkEvent('QB_CHANGE','team',team,team,{qb1:prevTeam.qb1},{qb1:nextTeam.qb1},'ESPN public NFL team depth-chart endpoint',captured,{affected_players:[prevTeam.qb1,nextTeam.qb1]}));
    }
    if(prevTeam?.roster_observed && nextTeam.roster_observed){
      const prevRoster=new Map((prevTeam.roster||[]).map(x=>[norm(x.name),x]));
      const nextRoster=new Map((nextTeam.roster||[]).map(x=>[norm(x.name),x]));
      for(const [k,row] of nextRoster) if(!prevRoster.has(k)) events.push(mkEvent('ROSTER_ADD','player',row.name,team,null,{team,position:row.position},'ESPN public NFL team roster endpoint; NFL.com official transaction classification pending',captured,{official_transaction_classification:'PENDING'}));
      for(const [k,row] of prevRoster) if(!nextRoster.has(k)) events.push(mkEvent('ROSTER_REMOVE','player',row.name,team,{team,position:row.position},null,'ESPN public NFL team roster endpoint; NFL.com official transaction classification pending',captured,{official_transaction_classification:'PENDING'}));
    }
  }

  const oldIds=new Set((ledger.events||[]).map(e=>e.event_id));
  const newEvents=[];
  for(const e of events) if(!oldIds.has(e.event_id)){oldIds.add(e.event_id);newEvents.push(e);}
  const players={...prevPlayers};
  for(const [k,v] of observedPlayers) players[k]=v;
  const newState={schema_version:'1.0.0',season:2026,status:'LIVE_AUTOMATIC_EVENT_STATE',last_run_at:captured,source_health,players,teams:teamState};
  const newLedger={...ledger,schema_version:'1.0.0',season:2026,status:newEvents.length?'NEW_EVENTS_DETECTED':'NO_NEW_MATERIAL_EVENTS',last_event_run_at:captured,events:[...(ledger.events||[]),...newEvents]};
  write(statePath,newState);
  write(ledgerPath,newLedger);
  console.log(JSON.stringify({generated_at:captured,result:'PASS',tracked_players:tracked.length,authoritative_shards:guardrails.authoritative_player_shards,teams:teams.length,new_events:newEvents.length,events_by_type:Object.fromEntries(contract.supported_event_types.map(t=>[t,newEvents.filter(e=>e.event_type===t).length])),source_failures:Object.entries(source_health).filter(([,v])=>!v.ok).map(([k,v])=>({source:k,error:v.error})),actionable:false,downstream:'CONNECTED_IMPACT_RESOLVER_REQUIRED'},null,2));
}

main().catch(e=>{console.error(e);process.exit(1);});
