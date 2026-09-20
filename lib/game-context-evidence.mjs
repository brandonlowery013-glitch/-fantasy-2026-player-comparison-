// Evidence attachment only. Numerical influence must be validated separately.
export function gameContextEvidence(context,game,week,now=Date.now()) {
  const base={numeric_influence:false,status:'UNAVAILABLE',players:[],missing:['coaching_tendencies','neutral_situation_pace','offensive_line_matchup','defensive_efficiency','weather'],reason:null};
  if(!context){base.reason='Football context file unavailable';return base;}
  if(Number(context.week)!==Number(week)||context.season!==2026||context.sportsbook_inputs_used!==false){base.reason='Context week, season or football-only provenance mismatch';return base;}
  const teams=new Set([game.home_team,game.away_team]);
  for(const [name,p]of Object.entries(context.players||{})){
    const signals=[];
    for(const [kind,s]of Object.entries(p.signals||{})){
      const team=s.evidence?.team;if(!teams.has(team))continue;
      const captured=Date.parse(s.captured_at),limit=Number(s.freshness_limit_hours);
      const current=s.status==='CURRENT'&&typeof s.source==='string'&&s.source.length>0&&Number.isFinite(captured)&&captured<=now&&Number.isFinite(limit)&&limit>0&&now-captured<=limit*3600000;
      signals.push({kind,team,source:s.source||null,captured_at:s.captured_at||null,status:current?'CURRENT':'REVIEW_REQUIRED',evidence:s.evidence||{},numeric_influence:false});
    }
    if(signals.length)base.players.push({player:name,position:p.position,reported_expected_active:p.expected_active??null,signals});
  }
  base.status=base.players.length?'CONTEXT_ONLY_NOT_IN_SCORE_MODEL':'NO_MATCHING_TEAM_EVIDENCE';
  base.reason='Game scores still use historical team priors. Attached evidence is not an applied adjustment.';
  return base;
}

// A major unresolved starter cannot be hidden behind team averages. This gate
// is deliberately conservative: it blocks a recommendation until the player
// status and replacement are known. It does not invent a point adjustment.
export function personnelDecisionGate(personnel, home, away) {
  const teams = [home, away];
  const unresolved = [];
  for (const team of teams) {
    for (const p of personnel?.teams?.[team]?.players || []) {
      const isQB = p.position === 'QB' || p.depth_roles?.some(r => r.position === 'QB' && Number(r.rank) === 1);
      if (!isQB) continue;
      const report = p.injury_reports?.[0];
      if (report && /out|doubtful|questionable|ir|injured reserve/i.test(String(report.designation || report.status || report.injury_status || ''))) {
        unresolved.push(`${team}:${p.name}`);
      }
    }
  }
  return unresolved.length ? {status:'PASS', reason:`Starting-quarterback status unresolved: ${unresolved.join(', ')}`, players:unresolved} : {status:'CLEAR', reason:null, players:[]};
}

export function teamStateSummary(personnel, home, away) {
  const teams = {};
  for (const team of [home, away]) {
    const players = personnel?.teams?.[team]?.players || [];
    const injuries = players.filter(p => (p.injury_reports || []).length);
    const starters = players.filter(p => p.depth_roles?.some(r => Number(r.rank) === 1));
    teams[team] = {
      roster_status: personnel?.teams?.[team]?.status || 'MISSING',
      starter_count: starters.length,
      injury_report_count: injuries.length,
      injured_players: injuries.map(p => p.name),
      unresolved_status: players.some(p => p.game_availability === 'UNKNOWN')
    };
  }
  return {status: personnel?.status || 'UNAVAILABLE', teams, applied_to_score: false,
    note: 'Roster and injury information is attached to the game state. It must pass the validation gate before changing the projection.'};
}
