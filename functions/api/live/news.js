const SOURCE='https://raw.githubusercontent.com/brandonlowery013-glitch/-fantasy-2026-player-comparison-/main/guardrails/current-football-review.json';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
function clean(value){return String(value||'').replace(/&#(?:x([0-9a-f]+)|(\d+));/gi,(_,h,d)=>{const n=parseInt(h||d,h?16:10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):''}).replace(/&(?:amp|quot|apos|lt|gt);/g,x=>({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'}[x])).replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim()}
function classify(title){
  if(/awards? tracker|mvp odds|rookie of the year|power rankings|mock draft|betting odds|picks for|best bets|how to watch/i.test(title))return null;
  if(/ruled out|out for (?:the )?season|season.ending|injured reserve|torn|surgery|suspended/i.test(title))return {category:'AVAILABILITY',priority:100,angle:'Availability can change this week’s lineup and open work for teammates. Check the reported timeline.'};
  if(/injur|questionable|doubtful|concussion|ankle|hamstring|knee|practice|cleared to|returns? to/i.test(title))return {category:'INJURY WATCH',priority:90,angle:'Watch the next practice report and game-day status before changing your lineup.'};
  if(/named.*starter|benched|takes over|lead back|workload|snap share|target share|committee|starting role|depth chart|released|traded/i.test(title))return {category:'ROLE CHANGE',priority:85,angle:'Follow carries, targets and snaps to see who gains or loses opportunity.'};
  if(/breakout|career.high|career.best|record.break|dominant|dominates|stellar|erupts|explodes|monster|(?:[2-9]\d\d)[ -]yard|[3-9][ -](?:touchdown|td)/i.test(title))return {category:'BREAKOUT',priority:75,angle:'Separate repeatable workload from efficiency spikes before carrying this performance into next week.'};
  if(/upset|stuns?\b|shocks?\b|underdog.*win/i.test(title))return {category:'UPSET',priority:72,angle:'Check how the game script changed volume and which roles held up in the surprise result.'};
  if(/disappoint|struggl|underwhelm|quiet game|held to|shut down|shut out|dud\b|turnover|interceptions/i.test(title))return {category:'DISAPPOINTMENT',priority:70,angle:'Check opportunity and matchup context before treating one poor result as a lasting decline.'};
  if(/rush(?:es|ed|ing)?.{0,30}\d+|throws?.{0,30}\d+|touchdowns?|receiving yards|catches|game recap|week \d+.*takeaways/i.test(title))return {category:'GAME TAKEAWAY',priority:60,angle:'Review usage alongside the box score, then check the next opponent.'};
  return null;
}
function normalize(review){
  if(!Array.isArray(review.players)||!review.players.length)throw Error('Published news review is unavailable');
  const items=new Map(),titles=new Set(),now=Date.now();
  for(const player of review.players){
    for(const story of player.news_mentions||[]){
      let url;try{url=new URL(story.url);if(url.protocol!=='https:')continue}catch{continue}
      const title=clean(story.headline),label=classify(title);if(!title||!label)continue;
      const published=Date.parse(story.published);
      // Old or undated articles must not be presented as current actionable updates.
      if(!Number.isFinite(published)||published>now+300000||now-published>7*86400000)continue;
      const titleKey=title.toLowerCase().replace(/[^a-z0-9]/g,'');
      if(items.has(url.href)||titles.has(titleKey))continue;
      titles.add(titleKey);
      const ageHours=Math.max(0,(now-published)/3600000);
      items.set(url.href,{title:title.slice(0,300),url:url.href,source:clean(story.source||url.hostname).replaceAll('_',' ').slice(0,100),published_at:new Date(published).toISOString(),category:label.category,priority:label.priority-Math.floor(ageHours/12)*8,angle:label.angle,summary:clean(story.description).slice(0,240),team:typeof story.team==='string'?story.team:null});
    }
  }
  const time=Date.parse(review.sweep_completed_at);
  return {reviewed_at:Number.isFinite(time)?new Date(time).toISOString():null,items:[...items.values()].sort((a,b)=>b.priority-a.priority||Date.parse(b.published_at)-Date.parse(a.published_at)).slice(0,20)};
}
export async function onRequestGet(){
  const key=new Request('https://ctd.internal/published-news-v2');
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
