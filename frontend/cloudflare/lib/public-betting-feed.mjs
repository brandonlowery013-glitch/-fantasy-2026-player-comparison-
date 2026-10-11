// Published decision observations, bound to the exact producer matchup.
export function publicBettingFeed(recommendations){
 const canon=t=>({WAS:'WSH',LA:'LAR',JAC:'JAX'}[t]||t),games=[];
 for(const game of Object.values(recommendations?.games||{})){
  const row={home:canon(game.home_team),away:canon(game.away_team),start_at:game.kickoff,market_observed_at:{}};
  for(const kind of ['moneyline','spread','total']){
   const c=(game.snapshot_evaluations||[]).flatMap(s=>[s.markets?.[kind]?.public_betting_context]).filter(c=>c?.rows?.length===2&&['OBSERVATION','STALE'].includes(c.status)&&Number.isFinite(Date.parse(c.observed_at))&&Date.parse(c.observed_at)<Date.parse(row.start_at)).sort((a,b)=>Date.parse(b.observed_at)-Date.parse(a.observed_at))[0];
   if(!c)continue;row[kind]=c.rows.map(r=>({...r,side:kind==='total'?r.side==='OVER'?'Over':'Under':canon(r.side)}));row.market_observed_at[kind]=c.observed_at;row.source=c.source;row.source_url=c.source_url;
  }
  const times=Object.values(row.market_observed_at).sort();if(times.length){row.observed_at=times.at(-1);games.push(row);}
 }
 return {schema_version:1,games};
}
