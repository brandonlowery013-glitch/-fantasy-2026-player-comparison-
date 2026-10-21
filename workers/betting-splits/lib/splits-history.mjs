const canon=t=>({WAS:'WSH',LA:'LAR',JAC:'JAX'}[t]||t);
const validPair=rows=>Array.isArray(rows)&&rows.length===2&&['bets','money'].every(k=>rows.every(r=>typeof r[k]==='number'&&Number.isFinite(r[k])&&r[k]>=0&&r[k]<=100)&&Math.abs(rows[0][k]+rows[1][k]-100)<=1);
export function preservePublished(next,...previous){
 const key=g=>`${canon(g.away)}@${canon(g.home)}:${Date.parse(g.start_at)}`;
 const games=new Map();
 for(const feed of [...previous].reverse().concat(next))for(const g of (Array.isArray(feed?.games)?feed.games:[])){
  if(!g.away||!g.home||!Number.isFinite(Date.parse(g.start_at))||!Number.isFinite(Date.parse(g.observed_at)))continue;
  const prior=games.get(key(g));if(!prior){games.set(key(g),g);continue;}
  const fresh=Date.parse(g.observed_at)>=Date.parse(prior.observed_at)?g:prior,older=fresh===g?prior:g;
  const merged={...fresh,market_observed_at:{...fresh.market_observed_at}};
  for(const market of ['moneyline','spread','total']){
   const at=row=>row.market_observed_at?.[market]||row.observed_at;
   const candidates=[fresh,older].filter(r=>validPair(r[market])).sort((a,b)=>Date.parse(at(b))-Date.parse(at(a)));
   if(candidates.length){merged[market]=candidates[0][market];merged.market_observed_at[market]=at(candidates[0]);}
  }
  games.set(key(g),merged);
 }
 return {...next,schema_version:1,games:[...games.values()]};
}
