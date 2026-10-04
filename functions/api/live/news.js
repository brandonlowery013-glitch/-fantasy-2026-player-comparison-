const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
function clean(value){return String(value||'').replace(/&#(?:x([0-9a-f]+)|(\d+));/gi,(_,h,d)=>{const n=parseInt(h||d,h?16:10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):''}).replace(/&(?:amp|quot|apos|lt|gt);/g,x=>({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'}[x])).replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim()}
function classify(title){
  if(/awards? tracker|mvp odds|rookie of the year|power rankings|mock draft|betting odds|picks for|best bets|how to watch/i.test(title))return null;
  if(/ruled out|out for (?:the )?season|season.ending|injured reserve|torn|surgery|suspended/i.test(title))return {category:'AVAILABILITY',priority:100,angle:'Availability can change this week’s lineup and open work for teammates. Check the reported timeline.'};
  if(/remarkable return|comeback|return from.*injury/i.test(title))return {category:'GAME TAKEAWAY',priority:60,angle:'Review the workload and performance since returning, rather than treating an old injury as a new absence.'};
  if(/injur|questionable|doubtful|concussion|ankle|hamstring|knee|practice|cleared to|returns? to/i.test(title))return {category:'INJURY WATCH',priority:90,angle:'Watch the next practice report and game-day status before changing your lineup.'};
  if(/named.*starter|benched|takes over|lead back|workload|snap share|target share|committee|starting role|depth chart|released|traded/i.test(title))return {category:'ROLE CHANGE',priority:85,angle:'Follow carries, targets and snaps to see who gains or loses opportunity.'};
  if(/breakout|career.high|career.best|record.break|dominant|dominates|stellar|erupts|explodes|monster|(?:[2-9]\d\d)[ -]yard|[3-9][ -](?:touchdown|td)/i.test(title))return {category:'BREAKOUT',priority:75,angle:'Separate repeatable workload from efficiency spikes before carrying this performance into next week.'};
  if(/upset|stuns?\b|shocks?\b|underdog.*win/i.test(title))return {category:'UPSET',priority:72,angle:'Check how the game script changed volume and which roles held up in the surprise result.'};
  if(/disappoint|struggl|underwhelm|quiet game|held to|shut down|shut out|dud\b|turnover|interceptions/i.test(title))return {category:'FOOTBALL CONTEXT',priority:70,angle:'Check opportunity and matchup context before treating one poor result as a lasting decline.'};
  if(/rush(?:es|ed|ing)?.{0,30}\d+|throws?.{0,30}\d+|touchdowns?|receiving yards|catches|game recap|week \d+.*takeaways/i.test(title))return {category:'GAME TAKEAWAY',priority:60,angle:'Review usage alongside the box score, then check the next opponent.'};
  return null;
}
function liveItems(payload,now=Date.now()){
 if(!Array.isArray(payload.articles))throw Error('Live news response invalid');
 return payload.articles.flatMap(a=>{
  const title=clean(a.headline),label=classify(title),published=Date.parse(a.published);
  if(!label||!Number.isFinite(published)||published>now+300000||now-published>7*86400000)return [];
  let url;try{url=new URL(a.links?.web?.href);if(url.protocol!=='https:'||!(url.hostname=='espn.com'||url.hostname.endsWith('.espn.com')))return []}catch{return []}
  const ageHours=(now-published)/3600000;
  if(/inactives|ruled out for (?:sunday|monday|thursday)/i.test(title)&&ageHours>24)return [];
  return [{title:title.slice(0,300),url:url.href,source:'ESPN',published_at:new Date(published).toISOString(),category:/winners and losers/i.test(title)?'FOOTBALL CONTEXT':label.category,priority:label.priority-Math.floor(ageHours/12)*8,angle:'',summary:clean(a.description).slice(0,240),team:a.categories?.find(c=>c.type==='team')?.team?.abbreviation||null}];
 });
}
export async function onRequestGet(){
 const key=new Request('https://ctd.internal/live-news-v6');
 let saved=null;
 try{const cached=await caches.default.match(key);if(cached)saved=await cached.json();}catch{}
 const age=Date.now()-Date.parse(saved?.checked_at);
 if(saved?.status==='CURRENT'&&age>=0&&age<300000)return new Response(JSON.stringify(saved),{headers});
 try{
  // The existing headline collector already publishes a compact snapshot.
  // Parsing the 14 MB player review on every request exceeded Worker CPU limits.
  const r=await fetch('https://raw.githubusercontent.com/brandonlowery013-glitch/-fantasy-2026-player-comparison-/data/live-news/data/live-news.json',{headers:{accept:'application/json','user-agent':'ChuckTheDuke/2026'},signal:AbortSignal.timeout(12000),cf:{cacheTtl:300,cacheEverything:true}});
  if(!r.ok)throw Error('News snapshot unavailable');
  const data=await r.json(),fetched=Date.parse(data.fetched_at),now=Date.now();
  if(!Number.isFinite(fetched)||now-fetched>7*3600000||fetched>now+300000)throw Error('Headline snapshot is stale');
  const items=new Map(),titles=new Set();
  for(const item of liveItems(data,now).sort((a,b)=>b.priority-a.priority||Date.parse(b.published_at)-Date.parse(a.published_at))){const title=item.title.toLowerCase().replace(/[^a-z0-9]/g,'');if(items.has(item.url)||titles.has(title))continue;items.set(item.url,item);titles.add(title);}
  const result={items:[...items.values()].slice(0,20),reviewed_at:data.fetched_at,checked_at:new Date(now).toISOString(),model_reviewed_at:null,status:'CURRENT',refresh_seconds:300,collection_interval_seconds:21600,source_branch:'data/live-news',live_source:'ESPN',live_error:null};
  try{await caches.default.put(key,new Response(JSON.stringify(result),{headers:{'cache-control':'public,max-age=86400'}}))}catch{}
  return new Response(JSON.stringify(result),{headers});
 }catch{
  if(saved){const items=(saved.items||[]).filter(item=>{const age=Date.now()-Date.parse(item.published_at);return Number.isFinite(age)&&age>=0&&age<=7*86400000&&(!/inactives|ruled out for (?:sunday|monday|thursday)/i.test(item.title)||age<=86400000);});return new Response(JSON.stringify({...saved,items,status:'STALE',message:'Showing the last saved news.'}),{headers});}
  return new Response(JSON.stringify({status:'UNAVAILABLE',reviewed_at:null,items:[],message:'News updates are temporarily unavailable.'}),{status:502,headers});
 }
}
