const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const teamCode = s => ({LAR:'LA', WSH:'WAS', JAC:'JAX'}[s] || s);
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
    players.push({athlete_id:id, name, team, position:a.position.abbreviation, roster_group:group.position,
      roster_status:a.status?.name || null, depth_roles:roles.map(d=>({position:d.position,rank:d.rank})),
      injury_reports:reports.map(report=>{const updated=Date.parse(report.source_updated_at),fetched=Date.parse(capturedAt);return {...report,freshness_status:Number.isFinite(updated)&&updated<=fetched&&fetched-updated<=12*3600000?'CURRENT':'REVIEW_REQUIRED'};}), game_availability:'UNKNOWN'});
  }
  if (!players.length) throw new Error(`${team}: empty roster`);
  return {team, captured_at:capturedAt, source_updated_at:payload.timestamp || null, source_url:sourceUrl, players,
    status:'OBSERVED', numeric_adjustment_applied:false};
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
    result.teams[team]=record;
  }
  result.status=result.issues.length?'REVIEW_REQUIRED':'CONNECTED';
  return result;
}
