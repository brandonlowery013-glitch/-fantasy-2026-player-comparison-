// Credentials stay in the Pages environment. Cache one upstream response across readers.
export function providerGames(rows,now=Date.now()){
 if(!Array.isArray(rows)||rows.length>100)throw Error('Invalid sportsbook response');
 const fresh=t=>Number.isFinite(Date.parse(t))&&Date.parse(t)<=now+60000&&now-Date.parse(t)<=15*60000;
 return rows.filter(g=>g.sport_key==='americanfootball_nfl'&&g.id&&g.home_team&&g.away_team&&Date.parse(g.commence_time)>now).map(g=>{
  const bookmakers=(g.bookmakers||[]).flatMap(b=>{
   const markets=(b.markets||[]).filter(m=>{
    if(!['h2h','spreads','totals'].includes(m.key)||!fresh(m.last_update||b.last_update)||m.outcomes?.length!==2)return false;
    if(!m.outcomes.every(o=>Number.isInteger(o.price)&&Math.abs(o.price)>=100))return false;
    const names=m.key==='totals'?['Over','Under']:[g.home_team,g.away_team];if(!names.every(n=>m.outcomes.filter(o=>o.name===n).length===1))return false;
    if(m.key==='h2h')return true;
    if(!m.outcomes.every(o=>typeof o.point==='number'&&Number.isFinite(o.point)))return false;
    return m.key==='spreads'?Math.abs(m.outcomes[0].point+m.outcomes[1].point)<1e-8:m.outcomes[0].point===m.outcomes[1].point;
   });return markets.length?[{key:b.key,title:b.title,last_update:b.last_update,markets}]:[];
  });return {id:g.id,home_team:g.home_team,away_team:g.away_team,start_at:g.commence_time,bookmakers};
 }).filter(g=>g.bookmakers.length);
}
export async function sportsbookOdds(context){
 if(!context.env?.ODDS_API_KEY)return null;
 const cache=globalThis.caches?.default,key=new Request(new URL('/__ctd-cache/nfl-main-sportsbook-odds-v1',context.request.url));
 const saved=cache?await cache.match(key):null;if(saved)return saved;
 const url=new URL('https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds');
 for(const [k,v] of Object.entries({apiKey:context.env.ODDS_API_KEY,regions:'us',markets:'h2h,spreads,totals',oddsFormat:'american',dateFormat:'iso'}))url.searchParams.set(k,v);
 const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Sportsbook provider HTTP '+response.status);
 const text=await response.text();if(text.length>2000000)throw Error('Sportsbook response exceeds bound');
 const games=providerGames(JSON.parse(text));if(!games.length)throw Error('No current pregame sportsbook quotes');
 const out=Response.json({schema_version:'1.0.0',status:'ok',quote_type:'pregame',source:'The Odds API v4',fetched_at:new Date().toISOString(),games,health:{status:'CURRENT',source:'the-odds-api',refresh_seconds:300},quota:{remaining:Number(response.headers.get('x-requests-remaining')),last_cost:Number(response.headers.get('x-requests-last'))}},{headers:{'cache-control':'public, max-age=300','access-control-allow-origin':'*'}});
 if(cache){const put=cache.put(key,out.clone());if(context.waitUntil)context.waitUntil(put);else await put;}
 return out;
}
