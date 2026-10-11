import {teamCode} from './structured-matchup-context.mjs';
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const fmt=v=>finite(v)?v.toFixed(1):'unavailable';
export function gameContextReview(context,game,selection,kind){
 const home=teamCode(game.home_team),away=teamCode(game.away_team),kickoff=game.kickoff||game.event_start;
 const match=context?.matchups?.find(g=>teamCode(g.home_team)===home&&teamCode(g.away_team)===away&&Date.parse(g.event_start)===Date.parse(kickoff));
 if(!match)return {status:'UNAVAILABLE',sections:[],numeric_adjustment:0};
 const h=context.teams[home],a=context.teams[away];if(!h||!a)return {status:'UNAVAILABLE',sections:[],numeric_adjustment:0};
 const sections=[];
 for(const [team,own,opponent,other]of [[home,h,away,a],[away,a,home,h]]){
  const o=own.offense,d=other.defense,play=own.play_context;
  sections.push({title:`${team}: passing and protection`,text:`Through ${o.games} games, ${team} averaged ${fmt(o.pass_attempts_per_game)} pass attempts. ${opponent} allowed ${fmt(d.passing_yards_per_attempt)} yards per attempt and sacked opposing quarterbacks on ${fmt(finite(d.sack_rate)?d.sack_rate*100:null)}% of dropbacks. ${team}'s own sack rate was ${fmt(finite(o.sack_rate)?o.sack_rate*100:null)}%.`,direction:null});
  sections.push({title:`${team}: workload and run game`,text:`${team} averaged ${fmt(o.plays_per_game)} offensive plays and ${fmt(o.carries_per_game)} carries, gaining ${fmt(o.rushing_yards_per_carry)} yards per carry. ${opponent} allowed ${fmt(d.rushing_yards_per_carry)} yards per carry.${finite(play?.proe_percentage_points)?` ${team} passed ${fmt(Math.abs(play.proe_percentage_points))} percentage points ${play.proe_percentage_points>=0?'more':'less'} often than expected for the situations it faced.`:''}`,direction:null});
 }
 const choice=teamCode(String(selection||'').split(' ')[0]),sign=choice===home?1:choice===away?-1:null;
 const values=[['Passing efficiency',h.offense.passing_epa_per_dropback,a.defense.passing_epa_per_dropback,a.offense.passing_epa_per_dropback,h.defense.passing_epa_per_dropback],['Rushing efficiency',h.offense.rushing_epa_per_carry,a.defense.rushing_epa_per_carry,a.offense.rushing_epa_per_carry,h.defense.rushing_epa_per_carry]];
 const signals=kind==='total'||sign===null?[]:values.filter(v=>v.slice(1).every(finite)).map(([label,ho,ad,ao,hd])=>({label,direction:Math.sign((ho+ad-ao-hd)*sign)>0?'SUPPORTS':Math.sign((ho+ad-ao-hd)*sign)<0?'CONTRADICTS':'NEUTRAL'}));
 const pro=signals.some(s=>s.direction==='SUPPORTS'),con=signals.some(s=>s.direction==='CONTRADICTS');
 return {status:pro&&con?'MIXED':pro?'SUPPORTS':con?'CONTRADICTS':'CONTEXT_ONLY',sections,signals,numeric_adjustment:0,explanation:'These are small-sample football comparisons, not additional points or probability adjustments. Correlated efficiency facts are not counted again in the score.',source:context.sources,cutoff:context.cutoff};
}
export function playerContextReview(context,{player,team,opponent,position,week,scoring='ppr'}){
 if(!context||context.week!==Number(week))return null;
 const norm=x=>String(x||'').toLowerCase().replace(/[^a-z0-9]/g,'');const matches=Object.values(context.players).filter(p=>norm(p.name)===norm(player)&&(!team||p.team===teamCode(team)));
 if(matches.length!==1)return null;const p=matches[0],opp=context.teams[teamCode(opponent)],allowed=opp?.position_allowed?.[position||p.position];if(!allowed)return null;
 const points=allowed[scoring==='standard'?'standard_fantasy_points_per_game':'ppr_fantasy_points_per_game'];
 return {player:p.name,observed_games:p.games,numeric_adjustment:0,text:`Across ${p.games} games with ${p.team}, ${p.name} averaged ${fmt(p.observed_targets_per_game)} targets and ${fmt(p.observed_carries_per_game)} carries.${finite(p.target_share)?` His target share was ${fmt(p.target_share*100)}%.`:''} ${teamCode(opponent)} allowed ${fmt(points)} ${scoring==='standard'?'standard':'PPR'} fantasy points per game to ${position||p.position}s. Those are points allowed to the entire position, not a forecast for this player.`,workload:p,position_allowed:allowed};
}
