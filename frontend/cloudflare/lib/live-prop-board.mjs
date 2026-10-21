const TEAMS={"Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL", "Buffalo Bills": "BUF", "Carolina Panthers": "CAR", "Chicago Bears": "CHI", "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Dallas Cowboys": "DAL", "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB", "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX", "Kansas City Chiefs": "KC", "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC", "Los Angeles Rams": "LA", "Miami Dolphins": "MIA", "Minnesota Vikings": "MIN", "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG", "New York Jets": "NYJ", "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT", "San Francisco 49ers": "SF", "Seattle Seahawks": "SEA", "Tampa Bay Buccaneers": "TB", "Tennessee Titans": "TEN", "Washington Commanders": "WAS"};
const STATS={player_pass_yds:'passing_yards',player_pass_tds:'passing_tds',player_rush_yds:'rushing_yards',player_rush_tds:'rushing_tds',player_reception_yds:'receiving_yards',player_reception_tds:'receiving_tds',player_receptions:'receptions'};
const key=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
const canon=t=>({LAR:'LA',WSH:'WAS'}[t]||t);
export function livePropSnapshots(feed,{schedule,week,personnel,recs,now=Date.now()}){
 const players=new Map();for(const [name,p]of Object.entries(recs?.players||{})){const k=key(name);const a=players.get(k)||[];a.push({name,...p});players.set(k,a);}
 const roster=new Map();for(const t of Object.values(personnel?.teams||{}))for(const p of t.players||[]){const k=key(p.name);const a=roster.get(k)||[];a.push({...p,team:canon(p.team||t.team)});roster.set(k,a);}
 const games=new Map();for(const [id,g]of Object.entries(schedule?.games||{}))if(Number(g.week)===Number(week))games.set([canon(g.away_team),canon(g.home_team),Date.parse(g.event_start||g.kickoff)].join('|'),id);
 const snapshots=[];
 for(const q of feed?.quotes||[]){
  const home=TEAMS[q.home_team],away=TEAMS[q.away_team],stat=STATS[q.market],game_id=games.get([away,home,Date.parse(q.kickoff)].join('|')),at=Date.parse(q.observed_at);
  if(!home||!away||!stat||!game_id||!Number.isFinite(at)||at>now+300000||now-at>150*60000||Date.parse(q.kickoff)<=now)continue;
  const matched=(roster.get(key(q.player))||[]).filter(p=>[home,away].includes(p.team));const known=matched.length===1?matched[0]:null,aliases=players.get(key(q.player))||[];
  const player=known&&aliases.length===1?aliases[0].name:q.player;
  snapshots.push({snapshot_id:'live:'+JSON.stringify([q.event_id,q.player,q.market,q.book,q.line,q.over,q.under,q.observed_at]),horizon:'WEEKLY',week:Number(week),game_id,provider_event_id:q.event_id,player,provider_player_name:q.player,position:known?.position||'UNKNOWN',athlete_id:known?.athlete_id||null,team:known?.team||null,stat,line:q.line,over_price:q.over,under_price:q.under,book:q.book,captured_at:q.observed_at,provider_updated_at:q.provider_updated_at,kickoff:q.kickoff,snapshot_kind:'CURRENT',source:'Cloudflare scheduled The Odds API capture'});
 }
 return {schema_version:1,snapshots};
}
export function propEvaluationKey(s){return JSON.stringify([key(s.player),s.stat,s.book,Number(s.line),Number(s.over_price),Number(s.under_price)]);}
export function evaluatedQuoteKey(e){return propEvaluationKey({...e,over_price:e.sides?.find(s=>s.side==='OVER')?.offered_odds,under_price:e.sides?.find(s=>s.side==='UNDER')?.offered_odds});}
