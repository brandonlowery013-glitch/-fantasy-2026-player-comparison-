// Observed football facts only; forecasts and numerical coefficients are separate.
export const teamCode=s=>({LA:'LAR',WAS:'WSH',JAC:'JAX'}[s]||s);
const n=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v);
const sum=(rows,key)=>rows.length&&rows.every(r=>n(r[key])!==null)?rows.reduce((s,r)=>s+n(r[key]),0):null;
const ratio=(a,b)=>a!==null&&b>0?a/b:null;
export function priorRows(rows,season,week){return rows.filter(r=>+r.season===season&&r.season_type==='REG'&&+r.week>0&&+r.week<week);}
export function teamMetrics(rows){const games=new Set(rows.map(r=>r.game_id));if(games.size!==rows.length)throw Error('Duplicate team game');const attempts=sum(rows,'attempts'),sacks=sum(rows,'sacks_suffered'),carries=sum(rows,'carries'),dropbacks=attempts!==null&&sacks!==null?attempts+sacks:null,plays=dropbacks!==null&&carries!==null?dropbacks+carries:null;
 return {games:games.size,game_ids:[...games],pass_attempts_per_game:ratio(attempts,games.size),carries_per_game:ratio(carries,games.size),plays_per_game:ratio(plays,games.size),pass_play_share:ratio(dropbacks,plays),sack_rate:ratio(sacks,dropbacks),passing_epa_per_dropback:ratio(sum(rows,'passing_epa'),dropbacks),rushing_epa_per_carry:ratio(sum(rows,'rushing_epa'),carries),passing_yards_per_attempt:ratio(sum(rows,'passing_yards'),attempts),rushing_yards_per_carry:ratio(sum(rows,'rushing_yards'),carries)};}
export function buildStructuredContext(teamRows,playerRows,{season,week,source,captured_at}){
 const tr=priorRows(teamRows,season,week),pr=priorRows(playerRows,season,week),teams={},players={};
 for(const team of new Set(tr.map(r=>teamCode(r.team)))){
  const own=tr.filter(r=>teamCode(r.team)===team),opp=tr.filter(r=>teamCode(r.opponent_team)===team),defense=teamMetrics(opp),pos={};
  for(const position of ['QB','RB','WR','TE']){
   const rows=pr.filter(r=>teamCode(r.opponent_team)===team&&r.position===position&&defense.game_ids.includes(r.game_id));
   const complete=defense.games>0&&new Set(rows.map(r=>r.game_id)).size===defense.games;
   const avg=key=>complete?ratio(sum(rows,key),defense.games):null;
   pos[position]={games:complete?defense.games:0,passing_yards_per_game:avg('passing_yards'),rushing_yards_per_game:avg('rushing_yards'),receiving_yards_per_game:avg('receiving_yards'),receptions_per_game:avg('receptions'),standard_fantasy_points_per_game:avg('fantasy_points'),ppr_fantasy_points_per_game:avg('fantasy_points_ppr')};
  }
  teams[team]={offense:teamMetrics(own),defense,position_allowed:pos};
 }
 for(const id of new Set(pr.filter(r=>['QB','RB','WR','TE'].includes(r.position)).map(r=>r.player_id))){
  const rows=pr.filter(r=>r.player_id===id).sort((a,b)=>+a.week-+b.week),last=rows.at(-1);const currentTeam=teamCode(last.team),same=rows.filter(r=>teamCode(r.team)===currentTeam);const games=new Set(same.map(r=>r.game_id));if(games.size!==same.length)throw Error('Duplicate player game '+id);
  const corresponding=tr.filter(r=>teamCode(r.team)===currentTeam&&games.has(r.game_id));
  players[id]={name:last.player_display_name,team:currentTeam,position:last.position,games:games.size,game_ids:[...games],latest_week:+last.week,observed_attempts_per_game:ratio(sum(same,'attempts'),games.size),observed_targets_per_game:ratio(sum(same,'targets'),games.size),observed_carries_per_game:ratio(sum(same,'carries'),games.size),target_share:ratio(sum(same,'targets'),sum(corresponding,'targets')),carry_share:ratio(sum(same,'carries'),sum(corresponding,'carries')),latest_targets:n(last.targets),latest_carries:n(last.carries),expected_attempts:null,expected_targets:null,expected_carries:null,expected_routes:null,expected_snaps:null};
 }
 return {season,week,captured_at,source,cutoff:`Completed regular-season weeks before Week ${week}`,numeric_adjustment_applied:false,teams,players,unavailable:['PROE','pressure_rate','coverage_grade','neutral_situation_pace','route_share','snap_share'],notes:'Passing play share is not PROE; sacks are not pressures. Workload averages are observations, not projected opportunities. Fantasy scoring fields use nflverse standard/PPR conventions.'};
}
