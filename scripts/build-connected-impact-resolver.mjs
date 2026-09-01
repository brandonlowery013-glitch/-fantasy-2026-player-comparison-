import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),JSON.stringify(x,null,2)+'\n');};
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
const fullTeamToAbbr={'Arizona Cardinals':'ARI','Atlanta Falcons':'ATL','Baltimore Ravens':'BAL','Buffalo Bills':'BUF','Carolina Panthers':'CAR','Chicago Bears':'CHI','Cincinnati Bengals':'CIN','Cleveland Browns':'CLE','Dallas Cowboys':'DAL','Denver Broncos':'DEN','Detroit Lions':'DET','Green Bay Packers':'GB','Houston Texans':'HOU','Indianapolis Colts':'IND','Jacksonville Jaguars':'JAX','Kansas City Chiefs':'KC','Las Vegas Raiders':'LV','Los Angeles Chargers':'LAC','Los Angeles Rams':'LA','Miami Dolphins':'MIA','Minnesota Vikings':'MIN','New England Patriots':'NE','New Orleans Saints':'NO','New York Giants':'NYG','New York Jets':'NYJ','Philadelphia Eagles':'PHI','Pittsburgh Steelers':'PIT','San Francisco 49ers':'SF','Seattle Seahawks':'SEA','Tampa Bay Buccaneers':'TB','Tennessee Titans':'TEN','Washington Commanders':'WAS'};

const config=read('guardrails/guardrails-config.json');
const contract=read('data/sources/connected-impact-resolver-2026.json');
const schedule=read('data/calibration/weekly-event-schedule-2026.json');
const outputPath='data/ingestion/connected-impact-queue-2026.json';

function loadPlayers(){
  const out=[];
  for(let i=0;i<Number(config.authoritative_player_shards);i++){
    const shard=read(`players${i}.json`);
    for(const p of shard){
      const team=fullTeamToAbbr[p.t]||String(p.t||'').toUpperCase();
      out.push({name:p.n,position:String(p.p||'').toUpperCase(),team,overall:p.o??null,true_value:p.tr??null});
    }
  }
  if(out.length!==Number(config.authoritative_player_count))throw new Error(`Authoritative universe mismatch: loaded ${out.length}, expected ${config.authoritative_player_count}`);
  return out;
}

function gameForTeam(team){
  for(const [gameId,g] of Object.entries(schedule.games||{})){
    if(g.home_team===team||g.away_team===team){
      return {game_id:gameId,event_id:g.event_id||null,week:g.week,opponent:g.home_team===team?g.away_team:g.home_team,event_start:g.event_start||null,verified:g.verified===true};
    }
  }
  return null;
}

function relatedPlayers(event,players){
  const team=event.team;
  const subject=norm(event.entity_id_or_name);
  const direct=players.find(p=>norm(p.name)===subject)||null;
  const teamPlayers=players.filter(p=>p.team===team&&norm(p.name)!==subject);
  if(!direct)return {direct:null,connected:teamPlayers};
  const samePos=teamPlayers.filter(p=>p.position===direct.position);
  const skill=teamPlayers.filter(p=>['QB','RB','WR','TE'].includes(p.position));
  const broad=['CRITICAL','HIGH'].includes(event.materiality)||['QB_CHANGE','TEAM_CHANGE','ROSTER_REMOVE'].includes(event.event_type);
  const selected=broad?skill:[...samePos,...teamPlayers.filter(p=>p.position==='QB')];
  const seen=new Set();
  return {direct,connected:selected.filter(p=>{const k=norm(p.name);if(seen.has(k))return false;seen.add(k);return true;})};
}

function domainState(domain,event){
  if(domain==='direct_player')return {decision:'CHANGE',reason:`Source event ${event.event_type} changed canonical football state; numeric outputs must be recalculated downstream.`};
  return {decision:'WAIT',reason:'Connected reassessment required; resolver does not invent numeric impact before the responsible module recalculates.'};
}

function buildCase(event,players){
  const domains=contract.event_domain_rules[event.event_type]||contract.downstream_domains;
  const {direct,connected}=relatedPlayers(event,players);
  const game=gameForTeam(event.team);
  const domain_decisions=Object.fromEntries(domains.map(d=>[d,domainState(d,event)]));
  return {
    case_id:`impact-${event.event_id}`,
    source_event_id:event.event_id,
    event_type:event.event_type,
    materiality:event.materiality,
    team:event.team,
    subject:event.entity_id_or_name,
    captured_at:event.captured_at,
    direct_player:direct,
    connected_players:connected,
    game_context:game,
    required_domains:domains,
    domain_decisions,
    recalculation_targets:{
      football_context:domains.includes('weekly_projection'),
      weekly_projection:domains.includes('weekly_projection'),
      team_scoring:domains.includes('team_scoring'),
      opponent_context:domains.includes('opponent'),
      market_comparison:domains.includes('market_comparison'),
      unified_decisions:domains.includes('decision_outputs')
    },
    market_rule:'CHECK_CURRENT_SPREAD_TOTAL_AND_IMPLIED_TEAM_TOTAL_AFTER_FOOTBALL_REASSESSMENT; NEVER_USE_MARKET_AS_FOOTBALL_CAUSE',
    reverse_reassessment:event.event_type==='RETURN_TO_ACTIVE',
    completion_status:'PENDING_DOWNSTREAM_REASSESSMENT'
  };
}

function syntheticEvents(players){
  const gb=players.find(p=>p.team==='GB'&&p.position==='RB')||players[0];
  return [
    {event_id:'self-out',event_type:'AVAILABILITY_CHANGE',entity_type:'player',entity_id_or_name:gb.name,team:gb.team,previous_state:{availability:'ACTIVE'},new_state:{availability:'OUT'},materiality:'HIGH',source:'SELF_TEST',captured_at:'2026-08-31T12:00:00Z',requires_connected_impact_review:true},
    {event_id:'self-return',event_type:'RETURN_TO_ACTIVE',entity_type:'player',entity_id_or_name:gb.name,team:gb.team,previous_state:{availability:'OUT'},new_state:{availability:'ACTIVE'},materiality:'HIGH',source:'SELF_TEST',captured_at:'2026-08-31T13:00:00Z',requires_connected_impact_review:true}
  ];
}

function main(){
  const players=loadPlayers();
  const self=process.argv.includes('--self-test');
  const ledger=self?{events:syntheticEvents(players)}:read('data/ingestion/nfl-event-ledger-2026.json');
  const prior=fs.existsSync(path.join(root,outputPath))?read(outputPath):{cases:[]};
  const existing=new Map((prior.cases||[]).map(c=>[c.source_event_id,c]));
  const sourceEvents=(ledger.events||[]).filter(e=>e.requires_connected_impact_review===true&&e.materiality!=='LOW');
  for(const e of sourceEvents)if(!existing.has(e.event_id))existing.set(e.event_id,buildCase(e,players));
  const cases=[...existing.values()];
  const generated_at=self?'2026-08-31T14:00:00Z':new Date().toISOString();
  const output={schema_version:'1.0.0',season:2026,status:cases.length?'CONNECTED_IMPACT_REASSESSMENT_PENDING':'AWAITING_MATERIAL_EVENTS',generated_at,source_event_count:sourceEvents.length,cases};
  if(!self)write(outputPath,output);

  const blocked=[];
  for(const c of cases){
    for(const d of c.required_domains||[])if(!c.domain_decisions?.[d])blocked.push(`${c.case_id} missing ${d}`);
    if(c.connected_players?.some(p=>p.name===c.subject))blocked.push(`${c.case_id} subject duplicated as connected player`);
    if(c.market_rule&&!c.market_rule.includes('NEVER_USE_MARKET_AS_FOOTBALL_CAUSE'))blocked.push(`${c.case_id} market causation rule missing`);
    if(c.event_type==='RETURN_TO_ACTIVE'&&c.reverse_reassessment!==true)blocked.push(`${c.case_id} return did not trigger reverse reassessment`);
    if(Object.values(c.domain_decisions||{}).some(x=>x?.projection_delta!=null||x?.rank_delta!=null||x?.team_points_delta!=null))blocked.push(`${c.case_id} invented numeric delta`);
  }
  if(self){
    if(cases.length!==2)blocked.push('self-test did not build both OUT and return cases');
    if(!cases.every(c=>c.connected_players.length>0))blocked.push('self-test missing connected teammates');
    if(!cases.every(c=>c.required_domains.includes('market_comparison')))blocked.push('high-impact self-test missing market comparison');
  }
  const report={generated_at,result:blocked.length?'BLOCKED':'PASS',source_events:sourceEvents.length,cases:cases.length,authoritative_players:players.length,blocked};
  console.log(JSON.stringify(report,null,2));
  if(blocked.length)process.exit(1);
}
main();
