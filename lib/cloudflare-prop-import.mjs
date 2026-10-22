// Reuse scheduled observations without changing their timestamps or buying quotes.
export function cloudflarePropEvents(feed,{now=Date.now(),freshnessMinutes=150}={}){
 if(feed?.event!=='cloudflare-cron'||!['CURRENT','PARTIAL'].includes(feed.health?.status)||!Array.isArray(feed.games))throw Error('Cloudflare prop feed is not current');
 const events=[];
 for(const g of feed.games){
  const observed=Date.parse(g.observed_at),kickoff=Date.parse(g.kickoff);
  if(!Number.isFinite(observed)||observed>now+300000||now-observed>freshnessMinutes*60000||!Number.isFinite(kickoff)||kickoff<=now)continue;
  const books=new Map();
  for(const q of g.quotes||[]){
   if(q.event_id!==g.event_id||q.observed_at!==g.observed_at||q.kickoff!==g.kickoff||!q.player||!q.book||!q.market||!Number.isFinite(q.line)||![q.over,q.under].every(p=>Number.isInteger(p)&&Math.abs(p)>=100))continue;
   if(!books.has(q.book))books.set(q.book,{key:q.book,markets:new Map()});
   const book=books.get(q.book);if(!book.markets.has(q.market))book.markets.set(q.market,{key:q.market,last_update:g.observed_at,provider_updated_at:q.provider_updated_at,outcomes:[]});
   book.markets.get(q.market).outcomes.push({description:q.player,point:q.line,name:'Over',price:q.over},{description:q.player,point:q.line,name:'Under',price:q.under});
  }
  if(books.size)events.push({id:g.event_id,commence_time:g.kickoff,home_team:g.home_team,away_team:g.away_team,observed_at:g.observed_at,collection_source:'Cloudflare scheduled The Odds API capture',bookmakers:[...books.values()].map(b=>({...b,markets:[...b.markets.values()]}))});
 }
 return events;
}
