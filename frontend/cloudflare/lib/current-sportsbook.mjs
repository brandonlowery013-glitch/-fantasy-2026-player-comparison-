export const TEAMS={"Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL", "Buffalo Bills": "BUF", "Carolina Panthers": "CAR", "Chicago Bears": "CHI", "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Dallas Cowboys": "DAL", "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB", "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX", "Kansas City Chiefs": "KC", "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC", "Los Angeles Rams": "LA", "Miami Dolphins": "MIA", "Minnesota Vikings": "MIN", "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG", "New York Jets": "NYJ", "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT", "San Francisco 49ers": "SF", "Seattle Seahawks": "SEA", "Tampa Bay Buccaneers": "TB", "Tennessee Titans": "TEN", "Washington Commanders": "WAS"};
export function sportsbookBoard(feed,inputs,now=Date.now()){
 if(feed.health?.status!=='CURRENT'||now-Date.parse(feed.fetched_at)>15*60000)throw Error('Sportsbook feed is stale');
 const events=[];
 for(const g of Object.values(inputs.games)){
  const source=feed.games?.find(x=>TEAMS[x.home_team]===g.home_team&&TEAMS[x.away_team]===g.away_team&&Date.parse(x.start_at)===Date.parse(g.kickoff));if(!source)continue;
  const books=[...source.bookmakers].sort((a,b)=>(b.key==='draftkings')-(a.key==='draftkings'));
  const book=books.find(b=>['h2h','spreads','totals'].every(k=>b.markets.some(m=>m.key===k)));if(!book)continue;
  const market=k=>book.markets.find(m=>m.key===k),fresh=m=>{const time=Date.parse(m.last_update||book.last_update);return Number.isFinite(time)&&time<=now+60000&&now-time<=15*60000;};
  const ml=market('h2h'),spread=market('spreads'),total=market('totals');if(![ml,spread,total].every(fresh))continue;
  const side=(m,name)=>m.outcomes.find(x=>x.name===name),h=side(spread,source.home_team),a=side(spread,source.away_team),over=side(total,'Over'),under=side(total,'Under');
  const captured_at=new Date(Math.min(...[ml,spread,total].map(m=>Date.parse(m.last_update||book.last_update)))).toISOString();
  events.push({id:g.event_id,competitions:[{odds:[{provider:{name:book.title||book.key,key:book.key},captured_at,source:'The Odds API v4',pointSpread:{home:{close:{line:h.point,odds:h.price}},away:{close:{line:a.point,odds:a.price}}},moneyline:{home:{close:{odds:side(ml,source.home_team).price}},away:{close:{odds:side(ml,source.away_team).price}}},overUnder:over.point,total:{over:{close:{odds:over.price}},under:{close:{odds:under.price}}}}]}]});
 }
 return {events};
}
