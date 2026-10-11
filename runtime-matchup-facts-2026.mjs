import {assessment} from './lib/matchup-assessment.mjs';
import {loadMatchup,canon} from './lib/matchup-facts.mjs';
const cache=new Map(),pending=new Set();
globalThis.CTD_MATCHUP_FACTS=new Map();
globalThis.CTD_MATCHUP_REPORTS=new Map();
globalThis.CTD_MATCHUP_ASSESSMENT=assessment;
const key=g=>`${canon(g.away_team)}@${canon(g.home_team)}:${Date.parse(g.kickoff||g.event_start||g.start_at)}`;
async function get(url,fresh=false){const hit=cache.get(url);if(hit&&(!fresh||Date.now()-hit.at<300000))return hit.promise;const promise=fetch(url,{signal:AbortSignal.timeout(12000)}).then(r=>{if(!r.ok)throw Error('Matchup source unavailable');return r.json();});cache.set(url,{at:Date.now(),promise});try{return await promise;}catch(e){cache.delete(url);throw e;}}
function refreshSlot(){return globalThis.CTD_LEAGUE_REFRESH?.plan((BET_FEED.games||[]).map(g=>({date:g.kickoff||g.event_start||g.start_at,status:g.status})))?.keys?.find(k=>k.includes(':pregame:'))||null;}

function apply(g,facts){for(const w of Object.values(g.show_work||{})){if(!w.reader)continue;if(!w.reader.originalMatchup)w.reader.originalMatchup=w.reader.matchup||[];w.reader.matchup=[...new Map([...w.reader.originalMatchup,...facts].map(f=>[f.text,f])).values()];}}
async function enrich(){const g=BET_FEED.games?.[selectedGameIndex];if(!g)return;const k=key(g),slot=refreshSlot(),existing=CTD_MATCHUP_REPORTS.get(k);if(CTD_MATCHUP_FACTS.has(k)&&(!slot||existing?.refreshSlot===slot)){apply(g,CTD_MATCHUP_FACTS.get(k));return;}if(pending.has(k))return;pending.add(k);try{const d=await loadMatchup(g,get);d.refreshSlot=slot;CTD_MATCHUP_REPORTS.set(k,d);CTD_MATCHUP_FACTS.set(k,d.facts);apply(g,d.facts);if(key(BET_FEED.games?.[selectedGameIndex]||{})===k)renderSelectedGame();}catch{}finally{pending.delete(k);}}
const original=renderSelectedGame;renderSelectedGame=function(){const g=BET_FEED.games?.[selectedGameIndex];if(g&&CTD_MATCHUP_FACTS.has(key(g)))apply(g,CTD_MATCHUP_FACTS.get(key(g)));original();void enrich();};
document.addEventListener('ctd:games-ready',enrich);void enrich();
