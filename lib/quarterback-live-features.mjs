import {canon,rows} from './game-scoring-calibration.mjs';
const prior=(r,g)=>+r.season<+g.season||(+r.season===+g.season&&+r.week<+g.week);
const sum=(rs,k)=>rs.reduce((s,r)=>{if(r[k]===''||r[k]==null||!Number.isFinite(+r[k]))throw Error(`Missing ${k}`);return s+(+r[k]);},0);
// Same feature definitions as the trained candidate, with missing coverage
// rejected instead of silently filled for live score-only inference.
export function quarterbackLiveFeatures({game,homeQb,awayQb,players,stats,teamStats,schedule,model}){
 if(!Number.isFinite(model.half_life_games)||model.half_life_games<=0)throw Error('Model decay metadata missing');
 const history=schedule.filter(g=>g.game_type==='REG'&&prior(g,game));
 const target={id:game.id,season:+game.season,week:+game.week,home:canon(game.home_team),away:canon(game.away_team),hs:0,as:0,hr:0,ar:0};
 const completed=history.filter(g=>+g.season>=2020&&g.home_score!==''&&g.away_score!=='').map(g=>({id:g.game_id,season:+g.season,week:+g.week,home:canon(g.home_team),away:canon(g.away_team),hs:+g.home_score,as:+g.away_score,hr:+g.home_rest,ar:+g.away_rest})).sort((a,b)=>a.season-b.season||a.week-b.week);
 const base=rows([...completed,target],model.half_life_games).find(r=>r.id===game.id);if(!base)throw Error('Team scoring history is incomplete');
 const side=(id,team,opponent)=>{
  const p=players.find(p=>p.gsis_id===id&&p.position==='QB');if(!p||!p.rookie_season)throw Error('Quarterback metadata missing');
  const recent=stats.filter(r=>r.player_id===id&&r.season_type==='REG'&&prior(r,game)&&+r.season>=+game.season-2);
  const seen=new Set();for(const r of recent){const key=`${r.season}:${r.week}`;if(seen.has(key))throw Error('Duplicate quarterback statistics');seen.add(key);}
  const expectedStarts=history.filter(g=>+g.season>=+game.season-2&&[g.home_qb_id,g.away_qb_id].includes(id));
  if(expectedStarts.some(g=>!seen.has(`${g.season}:${g.week}`)))throw Error('Quarterback game statistics are incomplete');
  const attempts=sum(recent,'attempts'),db=attempts+sum(recent,'sacks_suffered');
  const starts=history.filter(g=>[g.home_qb_id,g.away_qb_id].includes(id)).length;
  const q=[Math.log1p(starts),db?sum(recent,'passing_epa')/db:0,Math.log1p(db),+(+p.rookie_season===+game.season),+!db,Math.log1p(sum(recent.filter(r=>canon(r.team)===canon(team)),'attempts'))];
  const ts=teamStats.filter(r=>r.season_type==='REG'&&prior(r,game)&&+r.season>=+game.season-1);
  const own=ts.filter(r=>canon(r.team)===canon(team)),opp=ts.filter(r=>canon(r.opponent_team)===canon(opponent));
  if(!own.length||!opp.length)throw Error('Team support coverage missing');
  // Each completed current-season team game must have a stats row.
  for(const t of [team,opponent]){
   const expected=history.filter(g=>+g.season===+game.season&&[canon(g.home_team),canon(g.away_team)].includes(canon(t))&&g.home_score!==''&&g.away_score!=='');
   const actual=ts.filter(r=>+r.season===+game.season&&canon(r.team)===canon(t));
   if(expected.some(g=>!actual.some(r=>+r.week===+g.week)))throw Error('Recent team statistics have not arrived');
  }
  const rate=(rs,k,den)=>{const d=den.reduce((s,k)=>s+sum(rs,k),0);if(!d)throw Error('Team rate denominator missing');return sum(rs,k)/d;};
  const support=[rate(own,'sacks_suffered',['attempts','sacks_suffered']),rate(own,'rushing_epa',['carries']),rate(opp,'passing_epa',['attempts','sacks_suffered'])];
  return [...q,...support,...support.map(v=>v*q[0])];
 };
 const h=side(homeQb,game.home_team,game.away_team),a=side(awayQb,game.away_team,game.home_team);
 return {margin_features:[base.xm[0],...h.map((v,i)=>v-a[i])],total_features:[base.xt[0],...h.map((v,i)=>v+a[i])]};
}
