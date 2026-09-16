import {assessInjury,injuryFreshness} from './injury-evidence.mjs';
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const teamCode = s => ({LAR:'LA', WSH:'WAS', JAC:'JAX'}[s] || s);
function withAvailability(player,now) {
  const reports=(player.injury_reports||[]).map(r=>({...r,freshness_status:injuryFreshness(r,now).status}));
  const latest=[...reports].sort((a,b)=>(Date.parse(b.source_updated_at)||0)-(Date.parse(a.source_updated_at)||0))[0];
  const availability=assessInjury(latest,now);
  return {...player,injury_reports:reports,game_availability:availability.availability_status,availability,
    latest_reported_status:latest?.status||null};
}
export function parseTeamPersonnel(payload, team, depth, injuries, capturedAt, sourceUrl) {
  if (Number(payload.season?.year) !== 2026 || !Array.isArray(payload.athletes)) throw new Error(`${team}: invalid roster season or shape`);
  if (teamCode(payload.team?.abbreviation) !== team) throw new Error(`${team}: roster team mismatch`);
  const players = [], seen = new Set();
  for (const group of payload.athletes) for (const a of group.items || []) {
    const id = String(a.id || ''), name = a.displayName || a.fullName;
    if (!id || !name || !a.position?.abbreviation) throw new Error(`${team}: incomplete roster identity`);
    if (seen.has(id)) throw new Error(`${team}: duplicate athlete ${id}`);
    seen.add(id);
    const roles = depth.filter(d => d.athlete_id ? d.athlete_id === id : norm(d.name) === norm(name));
    const reports = injuries.filter(i => i.athlete_id ? i.athlete_id === id : norm(i.name) === norm(name));
    players.push(withAvailability({athlete_id:id, name, team, position:a.position.abbreviation, roster_group:group.position,
      roster_status:a.status?.name || null, depth_roles:roles.map(d=>({position:d.position,rank:d.rank})),
      injury_reports:reports},capturedAt));
  }
  if (!players.length) throw new Error(`${team}: empty roster`);
  return {team, captured_at:capturedAt, source_updated_at:payload.timestamp || null, source_url:sourceUrl, players,
    status:'OBSERVED', numeric_adjustment_applied:false};
}

export function weeklyInjurySummary(players, game, week) {
  const concerning = /^(questionable|doubtful|out|injured reserve|ir|physically unable to perform|pup|suspended|inactive)$/i;
  const items=players.filter(p=>concerning.test(p.latest_reported_status||'')).map(p=>{
    const starter=p.depth_roles?.some(d=>d.rank===1);
    const positionRoles=new Set((p.depth_roles||[]).map(d=>d.position));
    const alternatives=players.filter(q=>q.athlete_id!==p.athlete_id && q.game_availability!=='EXPECTED_INACTIVE' &&
      q.depth_roles?.some(d=>positionRoles.has(d.position)&&d.rank>1)).sort((a,b)=>Math.min(...a.depth_roles.map(d=>d.rank))-Math.min(...b.depth_roles.map(d=>d.rank)));
    return {athlete_id:p.athlete_id,name:p.name,position:p.position,designation:p.latest_reported_status,
      reported_at:p.availability.source_updated_at,update_status:p.availability.status,
      practice_status:p.injury_reports?.find(r=>r.source_updated_at===p.availability.source_updated_at)?.practice_status||null,
      game_availability:p.game_availability,confirmed_for_game:false,
      long_term:/^(injured reserve|ir|physically unable to perform|pup|suspended)$/i.test(p.latest_reported_status),
      depth_chart_starter:!!starter,
      impact:starter?`Reported ${p.latest_reported_status}: ${p.position} starter availability could change this week's rotation.`:`Reported ${p.latest_reported_status}: depth at ${p.position} may be affected.`,
      depth_options:alternatives.slice(0,2).map(q=>({athlete_id:q.athlete_id,name:q.name,designation:q.latest_reported_status,availability:q.game_availability})),
      replacement_confirmed:false};
  });
  items.sort((a,b)=>Number(b.depth_chart_starter)-Number(a.depth_chart_starter)||Number(a.long_term)-Number(b.long_term)||a.name.localeCompare(b.name));
  return {week,matchup:[game.away_team,game.home_team],items,numeric_adjustment_applied:false};
}

export function matchupPersonnel(snapshot, game, week, now=Date.now()) {
  const result={status:'UNAVAILABLE',numeric_adjustment_applied:false,teams:{},issues:[]};
  if (!snapshot || snapshot.season!==2026 || Number(snapshot.week)!==Number(week) || snapshot.sportsbook_inputs_used!==false) {
    result.issues.push('Missing or mismatched team personnel snapshot'); return result;
  }
  for (const raw of [game.home_team,game.away_team]) {
    const team=teamCode(raw), record=snapshot.teams?.[team];
    if (!record?.players?.length) {result.issues.push(`${team}: missing roster`);continue;}
    if(snapshot.status==='REVIEW_REQUIRED') result.issues.push(`${team}: collection requires review`);
    const captured=Date.parse(record.captured_at);
    if (!Number.isFinite(captured)||captured>now||now-captured>24*3600000) result.issues.push(`${team}: roster fetch older than 24 hours or invalid`);
    const players=record.players.map(p=>withAvailability(p,now));
    result.teams[team]={...record,players,weekly_injuries:weeklyInjurySummary(players,game,week),availability_summary:{
      expected_inactive:players.filter(p=>p.game_availability==='EXPECTED_INACTIVE').map(p=>({athlete_id:p.athlete_id,name:p.name,position:p.position,status:p.latest_reported_status})),
      unresolved_depth_leaders:players.filter(p=>p.depth_roles?.some(d=>d.rank===1)&&p.game_availability==='UNKNOWN'&&/^(questionable|doubtful|out|inactive)$/i.test(p.latest_reported_status||'')).map(p=>({athlete_id:p.athlete_id,name:p.name,position:p.position,status:p.latest_reported_status,reason:p.availability.basis})),
      numeric_adjustment_applied:false}};
  }
  result.status=result.issues.length?'REVIEW_REQUIRED':'CONNECTED';
  return result;
}
