const reports=globalThis.CTD_MATCHUP_REPORTS=new Map();
globalThis.CTD_MATCHUP_FACTS=new Map();
globalThis.CTD_MATCHUP_ASSESSMENT=(_reader,data)=>data?.sections?data:null;
const canon=t=>({LA:'LAR',WAS:'WSH',JAC:'JAX'}[t]||t);
let pending=false,saved=null,applied=null;
function publish(){
 const first=BET_FEED.games?.[0],season=BET_FEED.season||new Date(first?.kickoff||first?.event_start||first?.start_at).getUTCFullYear();
 if(!saved||Number(saved.week)!==Number(BET_FEED.week)||Number(saved.season)!==Number(season))return false;
 if(applied===saved)return true;
 reports.clear();for(const g of Object.values(saved.games||{}))reports.set(`${canon(g.away_team)}@${canon(g.home_team)}:${Date.parse(g.kickoff)}`,{...g,stale:saved.stale});
 applied=saved;globalThis.CTD_MATCHUP_PREVIEW_STATUS=saved;return true;
}
async function refresh(){if(pending)return;pending=true;try{const r=await fetch('/api/live/matchup-previews',{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Preview unavailable');saved=await r.json();if(publish())renderSelectedGame();}catch(e){console.warn('Matchup preview refresh:',e.message);}finally{pending=false;}}
// The preview and game feed may arrive in either order. Retain the preview and
// attach it on the first matching game render, without another network request.
const original=renderSelectedGame;
renderSelectedGame=function(...args){publish();return original.apply(this,args);};
document.addEventListener('ctd:games-ready',refresh);
setInterval(refresh,60000);void refresh();
