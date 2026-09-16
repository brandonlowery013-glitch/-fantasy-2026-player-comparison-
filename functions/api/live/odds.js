const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
export async function onRequestGet({env,request,waitUntil}){
  if(!env.ODDS_API_KEY)return json({status:'unavailable',games:[],message:'Live odds are not configured.'},503);
  const cache=caches.default;
  const key=new Request(new URL('/__cache/nfl-odds-v1',request.url));
  let prior;
  try{const hit=await cache.match(key);if(hit)prior=await hit.json()}catch{}
  if(prior&&Date.now()-Date.parse(prior.fetched_at)<300000)return json(prior);
  try{
    const url=new URL('https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds');
    url.search=new URLSearchParams({apiKey:env.ODDS_API_KEY,regions:'us',markets:'h2h,spreads,totals',oddsFormat:'american'});
    const response=await fetch(url,{signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error('Provider unavailable');
    const rows=await response.json();
    if(!Array.isArray(rows)||rows.length>100)throw Error('Invalid provider data');
    const games=rows.filter(g=>g.id&&g.home_team&&g.away_team&&Number.isFinite(Date.parse(g.commence_time))).map(g=>({id:g.id,home_team:g.home_team,away_team:g.away_team,start_at:g.commence_time,bookmakers:(g.bookmakers||[]).map(b=>({key:b.key,title:b.title,last_update:b.last_update,markets:(b.markets||[]).filter(m=>['h2h','spreads','totals'].includes(m.key)).map(m=>({key:m.key,last_update:m.last_update,outcomes:(m.outcomes||[]).map(o=>({name:o.name,price:o.price,...(Number.isFinite(o.point)?{point:o.point}:{})}))}))}))}));
    const body={status:'ok',source:'The Odds API',fetched_at:new Date().toISOString(),refresh_seconds:300,games};
    waitUntil(cache.put(key,new Response(JSON.stringify(body),{headers:{...headers,'cache-control':'public, max-age=900'}})).catch(()=>{}));
    return json(body);
  }catch{
    if(prior&&Date.now()-Date.parse(prior.fetched_at)<900000)return json({...prior,status:'stale',message:'Provider temporarily unavailable; showing the last retrieved lines.'});
    return json({status:'unavailable',games:[],message:'Live odds provider is unavailable. Stored model analysis is unchanged.'},502);
  }
}
