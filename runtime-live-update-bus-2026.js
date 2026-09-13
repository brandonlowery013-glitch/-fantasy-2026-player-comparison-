(()=>{
  const DEFAULT_BASE=window.CTD_LIVE_API_BASE||'/api/live';
  const state={connected:false,lastUpdate:null,lastError:null,bundle:null,eventId:null,source:'none'};
  const emit=(name,detail)=>window.dispatchEvent(new CustomEvent(name,{detail}));
  const apply=b=>{if(!b)return;state.bundle=b;state.lastUpdate=b.generated_at||new Date().toISOString();state.lastError=null;window.CTD_LIVE_STATE=b;emit('ctd:live-bundle',b);if(Array.isArray(b.scoreboard))emit('ctd:live-scoreboard-updated',{events:b.scoreboard});if(b.game)emit('ctd:live-game-detail-updated',b.game);if(b.model)emit('ctd:model-feed-updated',b.model);if(b.betting)emit('ctd:betting-feed-updated',b.betting);if(b.injuries)emit('ctd:injury-feed-updated',b.injuries);if(b.player_outlook)emit('ctd:player-outlook-updated',b.player_outlook);patchVisibleScores(b.scoreboard||[])};
  const teamText=x=>String(x||'').toUpperCase();
  function patchVisibleScores(games){for(const g of games){const away=teamText(g.away?.team),home=teamText(g.home?.team);for(const el of document.querySelectorAll('[data-game-id], [data-game-key], .ctdTickerGame, .game-card, .matchup-card')){const t=teamText(el.textContent);if(!away||!home||!t.includes(away)||!t.includes(home))continue;el.dataset.espnEventId=g.event_id;let live=el.querySelector('[data-ctd-live-score]');if(!live){live=document.createElement('div');live.dataset.ctdLiveScore='1';live.style.cssText='font-weight:800;font-size:14px;margin-top:4px';el.appendChild(live)}live.textContent=`${away} ${g.away.score}  ·  ${home} ${g.home.score}  ·  ${g.status||''}`;}}
  }
  function api(path){return `${DEFAULT_BASE}${path}`}
  async function pull(){try{const q=state.eventId?`?event=${encodeURIComponent(state.eventId)}&ts=${Date.now()}`:`?ts=${Date.now()}`;const r=await fetch(api('/bundle')+q,{cache:'no-store'});if(!r.ok)throw Error(`live backend ${r.status}`);const b=await r.json();state.connected=true;state.source='poll';apply(b)}catch(e){state.connected=false;state.lastError=e.message;emit('ctd:live-backend-error',{error:e.message});fallback()}}
  let es=null,retry=null;
  function connect(){if(!('EventSource'in window)){pull();return}try{if(es)es.close();const q=state.eventId?`?event=${encodeURIComponent(state.eventId)}`:'';es=new EventSource(api('/stream')+q);es.addEventListener('open',()=>{state.connected=true;state.source='sse';emit('ctd:live-backend-connected',{source:'sse'})});es.addEventListener('update',e=>{try{apply(JSON.parse(e.data))}catch{}});es.addEventListener('error',()=>{state.connected=false;try{es.close()}catch{};clearTimeout(retry);retry=setTimeout(()=>{pull();connect()},5000)})}catch{pull()}}
  async function fallback(){try{const r=await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=100&dates=2026&ts=${Date.now()}`,{cache:'no-store'});if(!r.ok)return;const j=await r.json();const games=(j.events||[]).map(e=>{const c=e.competitions?.[0]||{},a=(c.competitors||[]).find(x=>x.homeAway==='away'),h=(c.competitors||[]).find(x=>x.homeAway==='home');return{event_id:String(e.id),away:{team:a?.team?.abbreviation,score:Number(a?.score||0)},home:{team:h?.team?.abbreviation,score:Number(h?.score||0)},status:e.status?.type?.shortDetail||e.status?.type?.detail||'',state:e.status?.type?.state,clock:e.status?.displayClock,period:e.status?.period}});patchVisibleScores(games);emit('ctd:live-scoreboard-updated',{events:games,source:'direct-fallback'})}catch{}}
  function selectEvent(id){const v=id?String(id):null;if(v===state.eventId)return;state.eventId=v;connect();pull()}
  document.addEventListener('click',e=>{const el=e.target.closest?.('[data-espn-event-id]');if(el?.dataset?.espnEventId)selectEvent(el.dataset.espnEventId)});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)pull()});
  window.addEventListener('online',()=>{connect();pull()});
  window.CTDLive={state,refresh:pull,selectEvent,connect};
  const start=()=>{connect();pull();setInterval(()=>{if(!state.connected||state.source!=='sse')pull()},15000)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
