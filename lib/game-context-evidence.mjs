// Evidence attachment only. Numerical influence must be validated separately.
import {injuryFreshness,resolveAvailability} from './injury-evidence.mjs';
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
      const current=s.status==='CURRENT'&&typeof s.source==='string'&&s.source.length>0&&Number.isFinite(captured)&&captured<=now&&Number.isFinite(limit)&&limit>0&&now-captured<=limit*3600000&&(kind!=='injury'||injuryFreshness(s.evidence,now,limit).status==='CURRENT');
      signals.push({kind,team,source:s.source||null,captured_at:s.captured_at||null,status:current?'CURRENT':'REVIEW_REQUIRED',evidence:s.evidence||{},numeric_influence:false});
    }
    if(signals.length)base.players.push({player:name,position:p.position,reported_expected_active:resolveAvailability(p.signals||{},now).expected_active,signals});
  }
  base.status=base.players.length?'CONTEXT_ONLY_NOT_IN_SCORE_MODEL':'NO_MATCHING_TEAM_EVIDENCE';
  base.reason='Personnel evidence is separate from calibrated game scoring and is not an applied points adjustment.';
  return base;
}
