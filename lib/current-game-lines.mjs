export function currentGameLines(ledger) {
  const games=[];let newest=0;
  for(const [gameId,g] of Object.entries(ledger.games || {})){
    const books=new Map();
    for(const s of g.snapshots || []){
      const time=Date.parse(s.captured_at);
      if(s.snapshot_kind==='CLOSE'||!Number.isFinite(time)||time>Date.parse(g.kickoff))continue;
      if(!books.has(s.book)||time>Date.parse(books.get(s.book).captured_at))books.set(s.book,s);
    }
    const bookmakers=[...books.values()].map(s=>{
      newest=Math.max(newest,Date.parse(s.captured_at));
      const markets=[{key:'spreads',outcomes:[{name:g.home_team,point:s.home_spread,price:s.home_spread_price},{name:g.away_team,point:-s.home_spread,price:s.away_spread_price}]},{key:'totals',outcomes:[{name:'Over',point:s.total,price:s.over_price},{name:'Under',point:s.total,price:s.under_price}]}];
      if(Number.isFinite(s.home_moneyline)&&Number.isFinite(s.away_moneyline))markets.push({key:'h2h',outcomes:[{name:g.home_team,price:s.home_moneyline},{name:g.away_team,price:s.away_moneyline}]});
      return {key:s.book,title:s.provider_book_title||s.book,last_update:s.captured_at,markets};
    });
    if(bookmakers.length)games.push({id:gameId,home_team:g.home_team,away_team:g.away_team,start_at:g.kickoff,week:g.week,bookmakers});
  }
  return {schema_version:'1.0.0',status:'ok',source:'Scheduled sportsbook collection',quote_type:'pregame',fetched_at:newest?new Date(newest).toISOString():null,games};
}
