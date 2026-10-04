import {assessment} from './lib/matchup-assessment.mjs';
import {loadMatchup,canon} from './lib/matchup-facts.mjs';
const cache=new Map(),pending=new Set();
globalThis.CTD_MATCHUP_FACTS=new Map();
globalThis.CTD_MATCHUP_REPORTS=new Map();
let structured=null;
globalThis.CTD_MATCHUP_ASSESSMENT=(reader,data)=>{
 const base=assessment(reader,data);
 const g=Object.values(structured?.games||{}).find(g=>canon(g.away_team)===data?.away&&canon(g.home_team)===data?.home&&Date.parse(g.kickoff)===Date.parse(data?.kickoff));
 if(!g?.sections?.length)return base;
 const extra=(base?.sections||[]).filter(s=>/availability|Where it is played/.test(s.title));
 return {...base,sections:[...g.sections,...extra],sources:[...(base?.sources||[]),{label:'Weeks 1–3 team statistics',url:'https://github.com/nflverse/nflverse-data/releases/tag/stats_team'},{label:'Weeks 1–3 play-by-play',url:'https://github.com/nflverse/nflverse-data/releases/tag/pbp'}]};
};
fetch(new URL('./matchup-writeups.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('Matchup write-ups unavailable');return r.json();}).then(d=>{structured=d;renderSelectedGame();}).catch(()=>{});
const key=g=>`${canon(g.away_team)}@${canon(g.home_team)}:${Date.parse(g.kickoff||g.event_start||g.start_at)}`;
async function get(url,fresh=false){const hit=cache.get(url);if(hit&&(!fresh||Date.now()-hit.at<300000))return hit.promise;const promise=fetch(url,{signal:AbortSignal.timeout(12000)}).then(r=>{if(!r.ok)throw Error('Matchup source unavailable');return r.json();});cache.set(url,{at:Date.now(),promise});try{return await promise;}catch(e){cache.delete(url);throw e;}}
function refreshSlot(){return globalThis.CTD_LEAGUE_REFRESH?.plan((BET_FEED.games||[]).map(g=>({date:g.kickoff||g.event_start||g.start_at,status:g.status})))?.keys?.find(k=>k.includes(':pregame:'))||null;}

function apply(g,facts){for(const w of Object.values(g.show_work||{})){if(!w.reader)continue;if(!w.reader.originalMatchup)w.reader.originalMatchup=w.reader.matchup||[];w.reader.matchup=[...new Map([...w.reader.originalMatchup,...facts].map(f=>[f.text,f])).values()];}}
async function enrich(){const g=BET_FEED.games?.[selectedGameIndex];if(!g)return;const k=key(g),slot=refreshSlot(),existing=CTD_MATCHUP_REPORTS.get(k);if(CTD_MATCHUP_FACTS.has(k)&&(!slot||existing?.refreshSlot===slot)){apply(g,CTD_MATCHUP_FACTS.get(k));return;}if(pending.has(k))return;pending.add(k);try{const d=await loadMatchup(g,get);d.refreshSlot=slot;CTD_MATCHUP_REPORTS.set(k,d);CTD_MATCHUP_FACTS.set(k,d.facts);apply(g,d.facts);if(key(BET_FEED.games?.[selectedGameIndex]||{})===k)renderSelectedGame();}catch{}finally{pending.delete(k);}}
const original=renderSelectedGame;renderSelectedGame=function(){const g=BET_FEED.games?.[selectedGameIndex];if(g&&CTD_MATCHUP_FACTS.has(key(g)))apply(g,CTD_MATCHUP_FACTS.get(key(g)));original();void enrich();};
document.addEventListener('ctd:games-ready',enrich);void enrich();
