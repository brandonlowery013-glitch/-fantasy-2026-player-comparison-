import {behaviorState} from './football-learning.mjs';
const canon = team => ({LA:'LAR', WAS:'WSH', JAC:'JAX'}[team] || team);

export function attachBehaviorContext(projections, recommendations, learning, asOf) {
  const cutoff = Date.parse(asOf);
  if (!Number.isFinite(cutoff)) throw Error('Invalid behavior attachment cutoff');
  if (projections.season !== recommendations.season || projections.week !== recommendations.week) throw Error('Projection/recommendation week mismatch');
  const p = structuredClone(projections), r = structuredClone(recommendations);
  const state = behaviorState(learning?.observations || [], {season:p.season, week:p.week, asOf, halfLife:learning?.half_life_games || 4, regimeEvents:learning?.regime_events || []});
  const updated = [], frozen = [];
  for (const [id, game] of Object.entries(p.games)) {
    if (!Number.isFinite(Date.parse(game.event_start))) throw Error(`${id}: missing kickoff`);
    if (Date.parse(game.event_start) <= cutoff) { frozen.push(id); continue; }
    const target = r.games[id];
    if (!target || target.home_team !== game.home_team || target.away_team !== game.away_team || Date.parse(target.kickoff) !== Date.parse(game.event_start)) throw Error(`${id}: recommendation identity mismatch`);
    const teams = [game.home_team, game.away_team].map(canon);
    const context = {numeric_authority:0, status:'OBSERVATION', state:Object.fromEntries(Object.entries(state).filter(([, row]) => teams.includes(canon(row.team)))), as_of:asOf};
    game.behavior_learning_context = context;
    target.behavior_learning_context = structuredClone(context);
    updated.push(id);
  }
  return {projections:p, recommendations:r, updated, frozen};
}
