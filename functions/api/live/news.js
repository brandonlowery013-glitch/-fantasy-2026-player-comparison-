const SOURCE='https://raw.githubusercontent.com/brandonlowery013-glitch/-fantasy-2026-player-comparison-/main/guardrails/current-football-review.json';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
function normalize(review){
  if(!Array.isArray(review.players)||!review.players.length)throw Error('Published news review is unavailable');
  const items=new Map();
  for(const player of review.players){
    for(const story of player.news_mentions||[]){
      let url;try{url=new URL(story.url);if(url.protocol!=='https:')continue}catch{continue}
      const title=String(story.headline||'').trim();if(!title)continue;
      const published=Date.parse(story.published);
      const key=url.href;
      if(!items.has(key))items.set(key,{title:title.slice(0,300),url:key,source:String(story.source||url.hostname).slice(0,100),published_at:Number.isFinite(published)?new Date(published).toISOString():null,players:[]});
      const names=items.get(key).players;if(player.player&&!names.includes(player.player))names.push(player.player);
    }
  }
  const time=Date.parse(review.sweep_completed_at);
  return {reviewed_at:Number.isFinite(time)?new Date(time).toISOString():null,items:[...items.values()].sort((a,b)=>(Date.parse(b.published_at)||0)-(Date.parse(a.published_at)||0)).slice(0,30)};
}
export async function onRequestGet(){
  const key=new Request('https://ctd.internal/published-news-v1');
  try{
    const response=await fetch(SOURCE,{headers:{accept:'application/json'},cf:{cacheTtl:300,cacheEverything:true}});
    if(!response.ok)throw Error('News source unavailable');
    const feed=normalize(await response.json());
    const age=Date.now()-Date.parse(feed.reviewed_at);
    const result={...feed,status:!Number.isFinite(age)||age>12*3600000||age< -300000?'STALE':'CURRENT',source_branch:'main'};
    try{await caches.default.put(key,new Response(JSON.stringify(result),{headers:{'cache-control':'public,max-age=86400'}}))}catch{}
    return new Response(JSON.stringify(result),{headers});
  }catch{
    try{const saved=await caches.default.match(key);if(saved){const feed=await saved.json();return new Response(JSON.stringify({...feed,status:'STALE',message:'Refresh unavailable; showing the last saved news.'}),{headers})}}catch{}
    return new Response(JSON.stringify({status:'UNAVAILABLE',reviewed_at:null,items:[],message:'News updates are temporarily unavailable.'}),{status:502,headers});
  }
}
