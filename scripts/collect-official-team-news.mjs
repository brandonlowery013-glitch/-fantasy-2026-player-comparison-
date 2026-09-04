import fs from 'node:fs';

const ledgerPath='guardrails/current-football-review.json';
const ledger=JSON.parse(fs.readFileSync(ledgerPath,'utf8'));
const textNorm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const norm=s=>textNorm(s).replace(/ /g,'');
const canon=x=>({LAR:'LA',WSH:'WAS',JAC:'JAX'}[String(x||'').toUpperCase()]||String(x||'').toUpperCase());
const teamSites={ARI:'https://www.azcardinals.com/news/',ATL:'https://www.atlantafalcons.com/news/',BAL:'https://www.baltimoreravens.com/news/',BUF:'https://www.buffalobills.com/news/',CAR:'https://www.panthers.com/news/',CHI:'https://www.chicagobears.com/news/',CIN:'https://www.bengals.com/news/',CLE:'https://www.clevelandbrowns.com/news/',DAL:'https://www.dallascowboys.com/news/',DEN:'https://www.denverbroncos.com/news/',DET:'https://www.detroitlions.com/news/',GB:'https://www.packers.com/news/',HOU:'https://www.houstontexans.com/news/',IND:'https://www.colts.com/news/',JAX:'https://www.jaguars.com/news/',KC:'https://www.chiefs.com/news/',LV:'https://www.raiders.com/news/',LAC:'https://www.chargers.com/news/',LA:'https://www.therams.com/news/',MIA:'https://www.miamidolphins.com/news/',MIN:'https://www.vikings.com/news/',NE:'https://www.patriots.com/news/',NO:'https://www.neworleanssaints.com/news/',NYG:'https://www.giants.com/news/',NYJ:'https://www.newyorkjets.com/news/',PHI:'https://www.philadelphiaeagles.com/news/',PIT:'https://www.steelers.com/news/',SF:'https://www.49ers.com/news/',SEA:'https://www.seahawks.com/news/',TB:'https://www.buccaneers.com/news/',TEN:'https://www.tennesseetitans.com/news/',WAS:'https://www.commanders.com/news/'};
const offenseRe=/\b(offense|offensive|quarterback|qb|receiver|wide receiver|wr|running back|rb|tight end|te|target|targets|route|routes|snap|snaps|carry|carries|touch|touches|reps|first team|starter|starting|red zone|goal line|two minute|third down|chemistry|timing|connection|trust|scheme|install|playbook|role|workload|depth chart|injury|ankle|knee|hamstring|groin|shoulder|back|practice|practiced|limited|return|returned)\b/i;

async function getText(url){const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; Fantasy2026OfficialTeamNews/1.1)','accept':'text/html,application/xhtml+xml','accept-language':'en-US,en;q=0.9'}});if(!r.ok)throw new Error(`${r.status} ${url}`);return r.text();}
async function getJson(url){const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; Fantasy2026OfficialTeamNews/1.1)','accept':'application/json'}});if(!r.ok)throw new Error(`${r.status} ${url}`);return r.json();}
function decode(s){return String(s||'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));}
function strip(s){return textNorm(decode(String(s||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')));}
function articleLinks(html,base){const origin=new URL(base).origin;const out=[];for(const m of html.matchAll(/href=["']([^"']+)["']/gi)){let href=decode(m[1]);if(!href||href.startsWith('#')||href.startsWith('javascript:'))continue;try{const u=new URL(href,origin);if(u.origin!==origin)continue;if(!/\/news\//i.test(u.pathname))continue;if(u.pathname.replace(/\/$/,'')===new URL(base).pathname.replace(/\/$/,''))continue;out.push(u.href.split('#')[0]);}catch{}}return[...new Set(out)].slice(0,20);}
function parseArticle(html,url){const headline=decode((html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)||html.match(/<title[^>]*>([^<]+)/i)||[])[1]||url);const description=decode((html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)/i)||[])[1]||'');const published=(html.match(/"datePublished"\s*:\s*"([^"]+)"/i)||html.match(/<meta[^>]+(?:property|name)=["'](?:article:published_time|date)["'][^>]+content=["']([^"']+)/i)||[])[1]||null;return{headline,description,published,url,body_text:strip(html)};}

const teams=await getJson('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams?limit=40');
const teamIds=new Map();for(const x of teams.sports?.[0]?.leagues?.[0]?.teams||[]){const t=x.team||x;teamIds.set(canon(t.abbreviation),String(t.id));}
const rosterByPlayer=new Map();
for(const [abbr,id] of teamIds){try{const j=await getJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${id}/roster`);const walk=x=>{if(Array.isArray(x)){x.forEach(walk);return;}if(!x||typeof x!=='object')return;const a=x.athlete||x;const name=a.displayName||a.fullName;if(name)rosterByPlayer.set(norm(name),abbr);for(const v of Object.values(x))if(v&&typeof v==='object'&&v!==a)walk(v);};walk(j);}catch{}}

const modeled=new Map((ledger.players||[]).map(p=>[norm(p.player),p]));
const teamPlayers=new Map();
const unresolved=[];
let liveResolved=0,fallbackResolved=0;
for(const [k,p] of modeled){
  let team=rosterByPlayer.get(k),resolution='LIVE_ESPN_ROSTER';
  if(!team){const fallback=canon(p.current_team||p.team||'');if(teamSites[fallback]){team=fallback;resolution='MODEL_TEAM_FALLBACK';fallbackResolved++;}}
  else liveResolved++;
  if(!team){unresolved.push(p.player);continue;}
  const arr=teamPlayers.get(team)||[];arr.push(p);teamPlayers.set(team,arr);
  p.current_team=team;p.current_team_resolution=resolution;
}
const teamsWithModeledPlayers=[...teamPlayers.keys()].sort();
const teamsWithoutModeledPlayers=Object.keys(teamSites).filter(t=>!teamPlayers.has(t)).sort();
let teamPagesFetched=0,articlePagesFetched=0,matchedMentions=0,teamContextAssignments=0,offenseContextArticles=0,failures=[];
ledger.team_offense_context={};
for(const [team,base] of Object.entries(teamSites)){
  const players=teamPlayers.get(team)||[];
  ledger.team_offense_context[team]=[];
  try{
    const index=await getText(base);teamPagesFetched++;
    const links=articleLinks(index,base);
    for(let i=0;i<links.length;i+=6){
      const pages=await Promise.all(links.slice(i,i+6).map(async url=>{try{const html=await getText(url);articlePagesFetched++;return parseArticle(html,url);}catch(e){failures.push(`${team} ${url}: ${e.message}`);return null;}}));
      for(const a of pages.filter(Boolean)){
        const hay=textNorm(`${a.headline} ${a.description} ${a.body_text}`);
        const directlyMentioned=players.filter(p=>{const phrase=textNorm(p.player);return phrase&&hay.includes(phrase);});
        for(const p of directlyMentioned){
          const mention={source:'OFFICIAL_TEAM_SITE',team,headline:a.headline,description:a.description,published:a.published,url:a.url,body_text:a.body_text,context_scope:'DIRECT_PLAYER'};
          p.news_mentions=p.news_mentions||[];
          if(!p.news_mentions.some(x=>x.url===mention.url&&x.source===mention.source)){p.news_mentions.push(mention);matchedMentions++;}
        }
        if(!offenseRe.test(hay))continue;
        offenseContextArticles++;
        const ctx={source:'OFFICIAL_TEAM_CONTEXT',team,headline:a.headline,description:a.description,published:a.published,url:a.url,body_text:a.body_text,context_scope:'TEAM_OFFENSE',direct_modeled_players:directlyMentioned.map(p=>p.player)};
        ledger.team_offense_context[team].push(ctx);
        for(const p of players){
          p.team_context_mentions=p.team_context_mentions||[];
          if(!p.team_context_mentions.some(x=>x.url===ctx.url&&x.source===ctx.source)){p.team_context_mentions.push(ctx);teamContextAssignments++;}
        }
      }
    }
  }catch(e){failures.push(`${team} index: ${e.message}`);}
}
ledger.source_quality={...(ledger.source_quality||{}),official_team_site_ingestion:true,official_team_sites_configured:Object.keys(teamSites).length,official_team_indexes_fetched:teamPagesFetched,official_team_articles_fetched:articlePagesFetched,official_team_full_name_mentions:matchedMentions,official_team_offense_context_articles:offenseContextArticles,official_team_context_assignments:teamContextAssignments,official_team_failures:failures.slice(0,50),current_team_resolution:'LIVE_ESPN_ROSTER_WITH_MODEL_TEAM_FALLBACK',current_team_live_resolved:liveResolved,current_team_fallback_resolved:fallbackResolved,current_team_unresolved:unresolved,official_team_sites_with_modeled_players:teamsWithModeledPlayers,official_team_sites_without_modeled_players:teamsWithoutModeledPlayers};
fs.writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)+'\n');
console.log(JSON.stringify({result:'PASS',configured:Object.keys(teamSites).length,team_indexes_fetched:teamPagesFetched,articles_fetched:articlePagesFetched,matched_mentions:matchedMentions,offense_context_articles:offenseContextArticles,team_context_assignments:teamContextAssignments,current_team_live_resolved:liveResolved,current_team_fallback_resolved:fallbackResolved,current_team_unresolved:unresolved,teams_with_modeled_players:teamsWithModeledPlayers,teams_without_modeled_players:teamsWithoutModeledPlayers,failures:failures.length},null,2));
