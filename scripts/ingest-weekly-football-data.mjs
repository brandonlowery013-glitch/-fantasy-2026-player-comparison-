import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),JSON.stringify(x,null,2)+'\n');};
const contract=read('data/sources/weekly-football-ingestion-2026.json');
const snapshots=read('data/ingestion/weekly-football-source-snapshots-2026.json');
const marketWords=/\b(odds?|sportsbook|bookmaker|moneyline|vig|juice|implied_probability|market_price|betting_price)\b/i;
const teamMap={
  'Arizona Cardinals':'ARI','Atlanta Falcons':'ATL','Baltimore Ravens':'BAL','Buffalo Bills':'BUF','Carolina Panthers':'CAR','Chicago Bears':'CHI','Cincinnati Bengals':'CIN','Cleveland Browns':'CLE','Dallas Cowboys':'DAL','Denver Broncos':'DEN','Detroit Lions':'DET','Green Bay Packers':'GB','Houston Texans':'HOU','Indianapolis Colts':'IND','Jacksonville Jaguars':'JAX','Kansas City Chiefs':'KC','Las Vegas Raiders':'LV','Los Angeles Chargers':'LAC','Los Angeles Rams':'LA','Miami Dolphins':'MIA','Minnesota Vikings':'MIN','New England Patriots':'NE','New Orleans Saints':'NO','New York Giants':'NYG','New York Jets':'NYJ','Philadelphia Eagles':'PHI','Pittsburgh Steelers':'PIT','San Francisco 49ers':'SF','Seattle Seahawks':'SEA','Tampa Bay Buccaneers':'TB','Tennessee Titans':'TEN','Washington Commanders':'WAS'
};
const espnAlias={LAR:'LA',WSH:'WAS',JAC:'JAX'};
const validSignals=new Set(contract.context_source_types||[]);
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
const parseTime=x=>{const t=Date.parse(String(x||''));return Number.isFinite(t)?t:null;};
const canonicalTeam=x=>espnAlias[String(x||'').toUpperCase()]||String(x||'').toUpperCase();

function loadPlayers(){
  const out=[];
  for(let i=0;i<13;i++)for(const p of read(`players${i}.json`)){
    const abbr=teamMap[p.t];if(!abbr)throw new Error(`Unknown team mapping for ${p.n}: ${p.t}`);
    out.push({name:p.n,position:String(p.p||'').toUpperCase(),team:abbr});
  }
  return out;
}

function espnEventsToGames(payload,forcedWeek=null){
  const out=[];
  for(const e of payload.events||[]){
    const comp=e.competitions?.[0];if(!comp)continue;
    const teams={};
    for(const c of comp.competitors||[])teams[c.homeAway]=canonicalTeam(c.team?.abbreviation);
    const week=Number(e.week?.number??payload.week?.number??forcedWeek);
    const season=Number(e.season?.year??payload.season?.year??2026);
    const type=Number(e.season?.type??payload.season?.type??2);
    const start=e.date||comp.date||null;
    if(season!==2026||type!==2||!Number.isInteger(week)||!teams.away||!teams.home||parseTime(start)==null)continue;
    out.push({season,week,away_team:teams.away,home_team:teams.home,event_start:new Date(parseTime(start)).toISOString(),event_id:String(e.id||'')});
  }
  return out;
}

async function fetchSchedule(now,forcedWeek){
  if(forcedWeek!=null){
    const url=contract.schedule_source.automated_feed_url_template.replace('{week}',String(forcedWeek));
    const r=await fetch(url,{headers:{'user-agent':'fantasy-2026-ingestion'}});if(!r.ok)throw new Error(`schedule fetch failed ${r.status}`);
    return espnEventsToGames(await r.json(),Number(forcedWeek));
  }
  const base=contract.schedule_source.automated_feed_url_template.replace('&week={week}','').replace('?week={week}&','?').replace('week={week}&','');
  const r=await fetch(base,{headers:{'user-agent':'fantasy-2026-ingestion'}});if(r.ok){const all=espnEventsToGames(await r.json());if(all.length)return all;}
  const payloads=await Promise.all(Array.from({length:18},(_,i)=>i+1).map(async week=>{
    const url=contract.schedule_source.automated_feed_url_template.replace('{week}',String(week));
    const x=await fetch(url,{headers:{'user-agent':'fantasy-2026-ingestion'}});return x.ok?espnEventsToGames(await x.json(),week):[];
  }));
  return payloads.flat();
}

function chooseWeek(games,now,forced){
  if(forced!=null){const w=Number(forced);if(Number.isInteger(w)&&w>=1&&w<=18)return w;throw new Error(`Invalid NFL_WEEK ${forced}`);}
  const future=games.filter(g=>parseTime(g.event_start)>=now).sort((a,b)=>parseTime(a.event_start)-parseTime(b.event_start));
  if(future.length)return Number(future[0].week);
  const past=games.filter(g=>parseTime(g.event_start)<now).sort((a,b)=>parseTime(b.event_start)-parseTime(a.event_start));
  return past.length?Number(past[0].week):null;
}

function buildContext(players,week,nowIso){
  const byPlayer=new Map(players.map(p=>[norm(p.name),p]));
  const latest=new Map(),blocked=[];
  for(const s of snapshots.snapshots||[]){
    if(Number(s.week)!==week)continue;
    const type=String(s.signal_type||'');if(!validSignals.has(type)){blocked.push(`unsupported signal_type ${type}`);continue;}
    if(marketWords.test(String(s.source||''))||marketWords.test(JSON.stringify(s.evidence||{}))){blocked.push(`${s.player} ${type} market contamination`);continue;}
    const p=byPlayer.get(norm(s.player));if(!p){blocked.push(`unknown player ${s.player}`);continue;}
    const t=parseTime(s.captured_at);if(t==null){blocked.push(`${p.name} ${type} invalid captured_at`);continue;}
    if(t>parseTime(nowIso)+5*60000){blocked.push(`${p.name} ${type} captured_at is in future`);continue;}
    const k=`${p.name}|${type}`,old=latest.get(k);if(!old||t>old.t)latest.set(k,{t,s,p});
  }
  const grouped=new Map();
  for(const {s,p} of latest.values()){
    if(!grouped.has(p.name))grouped.set(p.name,{position:p.position,signals:{},availability:[]});
    const g=grouped.get(p.name);
    g.signals[s.signal_type]={source:s.source,captured_at:s.captured_at,cohort:s.cohort??undefined,stat_adjustments:s.stat_adjustments||{},evidence:s.evidence??undefined};
    if(typeof s.expected_active==='boolean')g.availability.push({captured_at:s.captured_at,expected_active:s.expected_active});
  }
  const out={};
  for(const [name,g] of grouped){
    g.availability.sort((a,b)=>Date.parse(b.captured_at)-Date.parse(a.captured_at));
    if(!g.availability.length)continue;
    out[name]={position:g.position,expected_active:g.availability[0].expected_active,signals:g.signals};
  }
  return {raw:{schema_version:'1.1.0',season:2026,week,status:Object.keys(out).length?'LIVE_CONTEXT_INGESTED':'AWAITING_LIVE_WEEKLY_CONTEXT',captured_at:nowIso,sportsbook_inputs_used:false,players:out},blocked};
}

async function main(){
  const selfTest=process.argv.includes('--self-test'),nowIso=process.env.INGEST_NOW||new Date().toISOString(),now=parseTime(nowIso);
  if(now==null)throw new Error('INGEST_NOW invalid');
  const players=loadPlayers();
  const games=selfTest?[{season:2026,week:1,away_team:'ATL',home_team:'CHI',event_start:'2026-09-10T00:20:00Z',event_id:'SELF'}]:await fetchSchedule(now,process.env.NFL_WEEK);
  const week=chooseWeek(games,now,process.env.NFL_WEEK);if(week==null)throw new Error('Unable to resolve 2026 NFL week');
  const weekGames=games.filter(g=>Number(g.week)===week),gameOut={};
  for(const g of weekGames){
    const start=parseTime(g.event_start);if(start==null)continue;
    const id=`2026-W${week}-${g.away_team}-${g.home_team}`;
    gameOut[id]={week,away_team:g.away_team,home_team:g.home_team,event_start:new Date(start).toISOString(),verified:true,source:contract.schedule_source.automated_feed_name,authoritative_cross_check:contract.schedule_source.authoritative_cross_check,event_id:g.event_id||null,players:players.filter(p=>p.team===g.away_team||p.team===g.home_team).map(p=>p.name)};
  }
  const schedule={schema_version:'1.2.0',season:2026,week,status:Object.keys(gameOut).length?'LIVE_SCHEDULE_INGESTED':'AWAITING_VERIFIED_EVENTS',generated_at:nowIso,sportsbook_inputs_used:false,games:gameOut};
  const context=buildContext(players,week,nowIso),blocked=[...context.blocked];
  if(selfTest){if(Object.keys(schedule.games).length!==1)blocked.push('self-test schedule game count');if(!schedule.games['2026-W1-ATL-CHI'])blocked.push('self-test game id');}
  if(!Object.keys(schedule.games).length)blocked.push(`no 2026 regular-season games found for week ${week}`);
  write('data/calibration/weekly-event-schedule-2026.json',schedule);write('data/probability/weekly-football-context-raw-2026.json',context.raw);
  const report={generated_at:nowIso,result:blocked.length?'BLOCKED':'PASS',season:2026,week,schedule_games:Object.keys(schedule.games).length,mapped_players:[...new Set(Object.values(schedule.games).flatMap(g=>g.players))].length,context_players:Object.keys(context.raw.players).length,schedule_source:contract.schedule_source.automated_feed_name,authoritative_cross_check:contract.schedule_source.authoritative_cross_check,sportsbook_inputs_used:false,blocked,notes:['2026 schedule is ingested from the configured live schedule adapter and labeled with source provenance.','NFL.com remains the authoritative schedule cross-check.','Only explicit current-source availability can set expected_active; absence of an injury row never implies active.','Missing context remains missing; no neutral/zero signal is invented.']};
  write('guardrails/weekly-football-ingestion-report.json',report);console.log(JSON.stringify(report,null,2));if(blocked.length)process.exit(1);
}

main().catch(e=>{console.error(e);process.exit(1);});
