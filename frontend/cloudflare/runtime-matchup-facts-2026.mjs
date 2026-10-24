const reports=globalThis.CTD_MATCHUP_REPORTS=new Map();
globalThis.CTD_MATCHUP_FACTS=new Map();
globalThis.CTD_MATCHUP_ASSESSMENT=(_reader,data)=>data?.sections?data:null;
const canon=t=>({LA:'LAR',WAS:'WSH',JAC:'JAX'}[t]||t);
let pending=false;
async function refresh(){if(pending)return;pending=true;try{const r=await fetch('/api/live/matchup-previews',{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Preview unavailable');const d=await r.json();if(Number(d.week)!==Number(BET_FEED.week)||Number(d.season)!==Number(BET_FEED.season))return;reports.clear();for(const g of Object.values(d.games||{})){const key=`${canon(g.away_team)}@${canon(g.home_team)}:${Date.parse(g.kickoff)}`;reports.set(key,{...g,stale:d.stale});}globalThis.CTD_MATCHUP_PREVIEW_STATUS=d;globalThis.renderSelectedGame?.();}catch(e){console.warn('Matchup preview refresh:',e.message);}finally{pending=false;}}
document.addEventListener('ctd:games-ready',refresh);
setInterval(refresh,60000);void refresh();
