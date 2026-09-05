import fs from 'node:fs';
const path='guardrails/current-football-review.json';
const ledger=JSON.parse(fs.readFileSync(path,'utf8'));
const START=Date.parse(process.env.PLAYER_NEWS_RSS_START||new Date(Date.now()-14*86400000).toISOString());
const END=Date.parse(process.env.PLAYER_NEWS_RSS_END||new Date().toISOString());
const MAX=Number(process.env.PLAYER_NEWS_RSS_MAX||20);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const decode=s=>String(s||'').replace(/<!\[CDATA\[|\]\]>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const strip=s=>decode(String(s||'').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
const norm=s=>strip(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const majorDomains=['latimes.com','nytimes.com','washingtonpost.com','apnews.com','reuters.com','espn.com','cbssports.com','nbcsports.com','foxsports.com','si.com','yahoo.com','usatoday.com','nfl.com','theathletic.com','profootballtalk.nbcsports.com'];
function items(xml){const out=[];for(const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)){const x=m[1],sm=x.match(/<source(?:\s+url="([^"]+)")?>([\s\S]*?)<\/source>/);out.push({title:strip((x.match(/<title>([\s\S]*?)<\/title>/)||[])[1]),link:strip((x.match(/<link>([\s\S]*?)<\/link>/)||[])[1]),pub:strip((x.match(/<pubDate>([\s\S]*?)<\/pubDate>/)||[])[1]),desc:strip((x.match(/<description>([\s\S]*?)<\/description>/)||[])[1]),sourceUrl:sm?.[1]||'',sourceName:strip(sm?.[2]||'')});}return out;}
async function get(url){const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; Fantasy2026PlayerNews/1.2)','accept':'application/rss+xml,text/xml'}});if(!r.ok)throw new Error(`${r.status}`);return r.text();}
function lanes(player,pos){
 const q=`\"${player}\" NFL`;
 const byPos={
  RB:[['BASE',q],['ROLE',`${q} practice carries touches workload committee backfield first-team`],['DEVELOPMENT',`${q} rookie playbook pass protection coordinator coach new offense injury recovery`]],
  QB:[['BASE',q],['ADAPTATION',`${q} practice playbook offense coordinator progressions first-team`],['CHEMISTRY',`${q} chemistry timing receiver tight end targets practice injury recovery traded`]],
  WR:[['BASE',q],['HIERARCHY',`${q} practice first-team targets routes depth chart role competition`],['DEVELOPMENT',`${q} rookie playbook chemistry quarterback timing injury recovery`]],
  TE:[['BASE',q],['HIERARCHY',`${q} practice first-team routes targets personnel depth chart role`],['DEVELOPMENT',`${q} rookie playbook chemistry quarterback blocking injury recovery`]]
 };
 return byPos[pos]||[['BASE',q]];
}
let fetched=0,queries=0,added=0,failures=[];
for(const p of ledger.players||[]){
 const pos=String(p.position||'').toUpperCase();
 p.retroactive_player_news_search={attempted:true,start:new Date(START).toISOString(),end:new Date(END).toISOString(),status:'PENDING',position:pos,lanes:[]};
 const phrase=norm(p.player);p.external_news_mentions=p.external_news_mentions||[];
 try{
  for(const [lane,query] of lanes(p.player,pos)){
   const url=`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
   try{
    const xml=await get(url);fetched++;queries++;
    const rows=items(xml).filter(x=>{const t=Date.parse(x.pub||'');return Number.isFinite(t)&&t>=START&&t<=END+86400000&&norm(`${x.title} ${x.desc}`).includes(phrase);}).slice(0,MAX);
    let laneAdded=0;
    for(const x of rows){
     const host=(()=>{try{return new URL(x.sourceUrl).hostname.replace(/^www\./,'');}catch{return'';}})();
     const tier=majorDomains.some(d=>host===d||host.endsWith('.'+d))?'MAJOR_MEDIA':'DISCOVERY_ONLY';
     const existing=p.external_news_mentions.find(y=>y.headline===x.title&&y.publisher===x.sourceName);
     if(existing){existing.discovery_lanes=[...new Set([...(existing.discovery_lanes||[existing.discovery_lane].filter(Boolean)),lane])];continue;}
     p.external_news_mentions.push({source:'GOOGLE_NEWS_RSS',publisher:x.sourceName,publisher_url:x.sourceUrl||null,source_tier:tier,headline:x.title,description:x.desc,published:new Date(x.pub).toISOString(),url:x.link,context_scope:'DIRECT_PLAYER_EXTERNAL_DISCOVERY',player_bound:true,proposal_only:true,retroactive_source:true,discovery_lane:lane,discovery_lanes:[lane],position_query:pos});added++;laneAdded++;
    }
    p.retroactive_player_news_search.lanes.push({lane,status:'CHECKED',matches:rows.length,added:laneAdded});
   }catch(e){p.retroactive_player_news_search.lanes.push({lane,status:'SOURCE_FAILURE',error:e.message});failures.push(`${p.player}/${lane}: ${e.message}`);}
   await sleep(20);
  }
  p.retroactive_player_news_search.status=p.retroactive_player_news_search.lanes.some(x=>x.status==='CHECKED')?'CHECKED':'SOURCE_FAILURE';
  p.retroactive_player_news_search.matches=p.retroactive_player_news_search.lanes.reduce((n,x)=>n+Number(x.matches||0),0);
 }catch(e){p.retroactive_player_news_search.status='SOURCE_FAILURE';failures.push(`${p.player}: ${e.message}`);}
}
ledger.source_quality={...(ledger.source_quality||{}),player_external_news_rss:true,player_external_news_rss_start:new Date(START).toISOString(),player_external_news_rss_end:new Date(END).toISOString(),player_external_news_rss_players_fetched:(ledger.players||[]).filter(x=>x.retroactive_player_news_search?.status==='CHECKED').length,player_external_news_rss_queries_fetched:fetched,player_external_news_rss_targeted_lanes:true,player_external_news_rss_mentions_added:added,player_external_news_rss_failures:failures.slice(0,30),player_external_news_rss_governance:'POSITION-TARGETED DISCOVERY; PLAYER BINDING REQUIRED; MAJOR MEDIA MAY SUPPORT RETROACTIVE REVIEW; NO AUTOMATIC SCORE CHANGE'};
fs.writeFileSync(path,JSON.stringify(ledger,null,2)+'\n');
console.log(JSON.stringify({result:'PASS',players_fetched:ledger.source_quality.player_external_news_rss_players_fetched,queries_fetched:fetched,mentions_added:added,failures:failures.length},null,2));
