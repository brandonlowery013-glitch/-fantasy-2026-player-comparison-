import {canon,pred} from './game-scoring-calibration.mjs';

export function scoreCurrentGame(artifact,game,completed,rest) {
  if(artifact.season!==2026||artifact.prior_season!==2025||artifact.trained_through_season!==2025||artifact.sportsbook_inputs_used!==false)
    throw Error('Invalid scoring artifact provenance');
  if(!Number.isFinite(rest?.home)||!Number.isFinite(rest?.away)||rest.home<=0||rest.away<=0)throw Error('Missing verified pregame rest');
  const cutoff=Date.parse(game.event_start);
  if(!Number.isFinite(cutoff)||!Number.isInteger(game.week))throw Error('Invalid game cutoff');
  const states={};
  for(const t of [canon(game.home_team),canon(game.away_team)]) {
    const p=artifact.prior[t];if(!p?.games)throw Error(`Missing 2025 prior ${t}`);
    const gs=completed.filter(g=>g.season===2026&&g.week<game.week&&g.final===true&&Date.parse(g.event_start)<cutoff&&(g.home===t||g.away===t));
    if(new Set(gs.map(g=>g.id)).size!==gs.length)throw Error(`Duplicate completed games ${t}`);
    const w=2**(-gs.length/artifact.half_life_games);
    const pf=gs.length?gs.reduce((s,g)=>s+(g.home===t?g.hs:g.as),0)/gs.length:null;
    const pa=gs.length?gs.reduce((s,g)=>s+(g.home===t?g.as:g.hs),0)/gs.length:null;
    states[t]={prior_games:p.games,current_games:gs.length,prior_weight:w,current_weight:1-w,
      prior_points_for:p.pf/p.games,prior_points_allowed:p.pa/p.games,current_points_for:pf,current_points_allowed:pa,
      blended_offense:w*p.pf/p.games+(1-w)*(pf??0),blended_defense_allowed:w*p.pa/p.games+(1-w)*(pa??0),
      completed_game_ids:gs.map(g=>g.id)};
  }
  const h=states[canon(game.home_team)],a=states[canon(game.away_team)];
  const hfa=game.neutral_site===true||game.neutralSite===true?0:artifact.hfa;
  const home=(h.blended_offense+a.blended_defense_allowed)/2+hfa/2,away=(a.blended_offense+h.blended_defense_allowed)/2-hfa/2;
  const xm=[home-away,rest.home-rest.away],xt=[home+away,Math.abs(rest.home-rest.away)];
  const margin=pred(artifact.margin,[xm])[0],total=pred(artifact.total,[xt])[0],hm=(total+margin)/2,am=(total-margin)/2;
  if(![hm,am].every(x=>Number.isFinite(x)&&x>=0))throw Error('Invalid learned score means');
  return {home_score_mean:hm,away_score_mean:am,distribution:artifact.distribution,
    model_version:artifact.model_version,evidence:{method:'Historically calibrated scoring matchup and rest',half_life_games:artifact.half_life_games,
      home_field_advantage_feature:hfa,home_field_advantage_contribution:hfa*artifact.margin.beta[0]/artifact.margin.sd[0],rest_days:rest,margin_features:xm,total_features:xt,teams:states,
      personnel_numeric_adjustment_applied:false,granular_matchup_numeric_adjustment_applied:false,
      excluded_numeric_features:artifact.excluded_numeric_features}};
}

export function parseCompletedWeek(payload,week) {
  if(Number(payload.season?.year)!==2026)throw Error('Wrong current-season scoreboard');
  if(!Array.isArray(payload.events)||!payload.events.length)throw Error(`Empty scoreboard week ${week}`);
  const out=[];
  for(const event of payload.events) {
    if(Number(event.week?.number??payload.week?.number)!==week)throw Error('Scoreboard week mismatch');
    const c=event.competitions?.[0];
    if(!(event.status?.type?.completed===true||c?.status?.type?.completed===true))continue;
    const h=c?.competitors?.find(t=>t.homeAway==='home'),a=c?.competitors?.find(t=>t.homeAway==='away');
    if(!h?.team?.abbreviation||!a?.team?.abbreviation||h.score==null||a.score==null||h.score===''||a.score==='')throw Error('Incomplete final score');
    const g={id:String(event.id),season:2026,week,home:canon(h.team.abbreviation),away:canon(a.team.abbreviation),hs:Number(h.score),as:Number(a.score),event_start:event.date,final:true};
    if(!Number.isFinite(g.hs)||!Number.isFinite(g.as)||!Number.isFinite(Date.parse(g.event_start)))throw Error('Invalid final score');
    out.push(g);
  }
  if(new Set(out.map(g=>g.id)).size!==out.length)throw Error('Duplicate final scoreboard event');
  return out;
}
