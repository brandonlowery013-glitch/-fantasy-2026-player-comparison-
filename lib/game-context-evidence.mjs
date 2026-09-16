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
