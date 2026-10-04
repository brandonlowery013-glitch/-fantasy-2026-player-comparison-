import {canon} from './game-scoring-calibration.mjs';

const numeric=v=>v==null||v===''||!Number.isFinite(+v)?null:+v;
const before=(r,season,week)=>+r.season<season||(+r.season===season&&+r.week<week);
function totals(rows) {
  const valid=rows.filter(r=>['attempts','sacks_suffered','passing_epa'].every(k=>numeric(r[k])!==null));
  const attempts=valid.reduce((s,r)=>s+(+r.attempts),0);
  const sacks=valid.reduce((s,r)=>s+(+r.sacks_suffered),0);
  const dropbacks=attempts+sacks;
  return {appearances:valid.length,attempts,dropbacks,passing_epa_per_dropback:dropbacks?valid.reduce((s,r)=>s+(+r.passing_epa),0)/dropbacks:null,sack_rate:dropbacks?sacks/dropbacks:null};
}

// The caller supplies a verified starter. Schedule starters are retrospective
// labels and must not silently stand in for a dated pregame announcement.
export function quarterbackReplacementContext({playerId,team,opponent,season,week,players,stats,games,teamStats,historyStart=2020}) {
  team=canon(team);opponent=canon(opponent);
  const metadata=players.find(p=>p.gsis_id===playerId);
  const prior=stats.filter(r=>r.player_id===playerId&&r.season_type==='REG'&&before(r,season,week));
  const seen=new Set();for(const r of prior){const key=r.game_id;if(seen.has(key))throw new Error(`Duplicate QB game ${key}`);seen.add(key);}
  const starts=games.filter(g=>g.game_type==='REG'&&before(g,season,week)&&[g.home_qb_id,g.away_qb_id].includes(playerId));
  const rookie=numeric(metadata?.rookie_season);
  const thisYear=prior.filter(r=>+r.season===season);
  const own=teamStats.filter(r=>r.season_type==='REG'&&+r.season===season&&+r.week<week&&canon(r.team)===team);
  const opposition=teamStats.filter(r=>r.season_type==='REG'&&+r.season===season&&+r.week<week&&canon(r.opponent_team)===opponent);
  function support(rows){const passing=totals(rows),rush=rows.filter(r=>numeric(r.carries)!==null&&numeric(r.rushing_epa)!==null),carries=rush.reduce((s,r)=>s+(+r.carries),0);return {...passing,rushing_epa_per_carry:carries?rush.reduce((s,r)=>s+(+r.rushing_epa),0)/carries:null};}
  return {player_id:playerId,name:metadata?.display_name??null,team,opponent,season,week,
    observed_starts:starts.length,starts_history_complete:rookie!==null&&rookie>=historyStart,
    rookie:rookie===null?null:rookie===season,draft_round:numeric(metadata?.draft_round),draft_pick:numeric(metadata?.draft_pick),
    draft_note:'Blank draft metadata is unknown; verify undrafted status separately.',
    prior_nfl:totals(prior),current_season:totals(thisYear),same_team:totals(prior.filter(r=>canon(r.team)===team)),
    familiarity_note:'Same-team appearances measure game experience, not practice preparation or continuity of the playbook.',
    supporting_offense:support(own),opponent_allowed:support(opposition),
    cutoff:`Before ${season} Week ${week}`,numeric_adjustment:null,
    status:'EVIDENCE_ONLY',limitations:['No validated conversion from this profile to scoring points yet.','Team passing and sack rates include quarterback performance; they are not isolated offensive-line grades.']};
}
