import fs from 'node:fs';

const path='guardrails/current-football-review.json';
const ledger=JSON.parse(fs.readFileSync(path,'utf8'));
const START=Date.parse(process.env.PLAYER_NEWS_RSS_START||new Date(Date.now()-14*86400000).toISOString());
const MAX=Number(process.env.PLAYER_NEWS_RSS_MAX||20);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const decode=s=>String(s||'').replace(/<!\[CDATA\[|\]\]>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const strip=s=>decode(String(s||'').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
const norm=s=>strip(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const majorDomains=['latimes.com','nytimes.com','washingtonpost.com','apnews.com','reuters.com','espn.com','cbssports.com','nbcsports.com','foxsports.com','si.com','yahoo.com','usatoday.com','nfl.com','theathletic.com'];
function items(xml){const out=[];for(const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)){const x=m[1];const title=strip((x.match(/<title>([\s\S]*?)<\/title>/)||[])[1]);const link=strip((x.match(/<link>([\s\S]*?)<\/link>/)||[])[1]);const pub=strip((x.match(/<pubDate>([\s\S]*?)<\/pubDate>/)||[])[1]);const desc=strip((x.match(/<description>([\s\S]*?)<\/description>/)||[])[1]);const sm=x.match(/<source(?:\s+url="([^"]+)")?>([\s\S]*?)<\/source>/);const sourceUrl=sm?.[1]||'';const sourceName=strip(sm?.[2]||'');out.push({title,link,pub,desc,sourceUrl,sourceName});}return out;}
async function get(url){const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; Fantasy2026PlayerNews/1.0)','accept':'application/rss+xml,text/xml'}});if(!r.ok)throw new Error(`${r.status}`);return r.text();}
let fetched=0,added=0,failures=[];
for(const p of ledger.players||[]){const q=`\"${p.player}\" NFL`;const url=`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;try{const xml=await get(url);fetched++;const phrase=norm(p.player);const rows=items(xml).filter(x=>{const t=Date.parse(x.pub||'');return Number.isFinite(t)&&t>=START&&norm(`${x.title} ${x.desc}`).includes(phrase);}).slice(0,MAX);p.external_news_mentions=p.external_news_mentions||[];for(const x of rows){const host=(()=>{try{return new URL(x.sourceUrl).hostname.replace(/^www\./,'');}catch{return'';}})();const tier=majorDomains.some(d=>host===d||host.endsWith('.'+d))?'MAJOR_MEDIA':'DISCOVERY_ONLY';const m={source:'GOOGLE_NEWS_RSS',publisher:x.sourceName,publisher_url:x.sourceUrl||null,source_tier:tier,headline:x.title,description:x.desc,published:new Date(x.pub).toISOString(),url:x.link,context_scope:'DIRECT_PLAYER_EXTERNAL_DISCOVERY',player_bound:true,proposal_only:true};if(!p.external_news_mentions.some(y=>y.headline===m.headline&&y.publisher===m.publisher)){p.external_news_mentions.push(m);added++;}}}catch(e){failures.push(`${p.player}: ${e.message}`);}await sleep(20);}
ledger.source_quality={...(ledger.source_quality||{}),player_external_news_rss:true,player_external_news_rss_players_fetched:fetched,player_external_news_rss_mentions_added:added,player_external_news_rss_failures:failures.slice(0,30),player_external_news_rss_governance:'DISCOVERY_ONLY_PROPOSAL_ONLY_REQUIRES_REASONING_OR_CORROBORATION'};
fs.writeFileSync(path,JSON.stringify(ledger,null,2)+'\n');
console.log(JSON.stringify({result:'PASS',players_fetched:fetched,mentions_added:added,failures:failures.length},null,2));
