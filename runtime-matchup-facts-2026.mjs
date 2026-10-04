import {loadMatchup,canon} from './lib/matchup-facts.mjs';
const cache=new Map(),pending=new Set();
globalThis.CTD_MATCHUP_FACTS=new Map();
const key=g=>`${canon(g.away_team)}@${canon(g.home_team)}:${Date.parse(g.kickoff||g.event_start||g.start_at)}`;
async function get(url){if(cache.has(url))return cache.get(url);const p=fetch(url,{signal:AbortSignal.timeout(12000)}).then(r=>{if(!r.ok)throw Error('Matchup source unavailable');return r.json();});cache.set(url,p);try{return await p;}catch(e){cache.delete(url);throw e;}}
function apply(g,facts){for(const w of Object.values(g.show_work||{})){if(!w.reader)continue;if(!w.reader.originalMatchup)w.reader.originalMatchup=w.reader.matchup||[];w.reader.matchup=[...new Map([...w.reader.originalMatchup,...facts].map(f=>[f.text,f])).values()];}}
async function enrich(){const g=BET_FEED.games?.[selectedGameIndex];if(!g)return;const k=key(g);if(CTD_MATCHUP_FACTS.has(k)){apply(g,CTD_MATCHUP_FACTS.get(k));return;}if(pending.has(k))return;pending.add(k);try{const d=await loadMatchup(g,get);CTD_MATCHUP_FACTS.set(k,d.facts);apply(g,d.facts);if(key(BET_FEED.games?.[selectedGameIndex]||{})===k)renderSelectedGame();}catch{pending.delete(k);}}
const original=renderSelectedGame;renderSelectedGame=function(){const g=BET_FEED.games?.[selectedGameIndex];if(g&&CTD_MATCHUP_FACTS.has(key(g)))apply(g,CTD_MATCHUP_FACTS.get(key(g)));original();void enrich();};
document.addEventListener('ctd:games-ready',enrich);void enrich();
