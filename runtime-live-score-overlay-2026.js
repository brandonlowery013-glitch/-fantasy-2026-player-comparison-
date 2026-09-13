(()=>{
  const ESPN='https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
  const FALLBACK='https://raw.githubusercontent.com/brandonlowery013-glitch/-fantasy-2026-player-comparison-/frontend/ctd-cloudflare-work/data/weekly/scoreboard-2026.json';
  let lastGood=null;
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const chicagoDate=()=>{
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const m=Object.fromEntries(parts.map(x=>[x.type,x.value]));
    return `${m.year}${m.month}${m.day}`;
  };
  const mapEspn=e=>{
    const c=e?.competitions?.[0]||{};
    const cs=c?.competitors||[];
    const away=cs.find(x=>x.homeAway==='away')||{};
    const home=cs.find(x=>x.homeAway==='home')||{};
    const st=c?.status||e?.status||{};
    const type=st?.type||{};
    return {
      id:String(e?.id||''),
      away:away?.team?.abbreviation||away?.team?.shortDisplayName||'—',
      home:home?.team?.abbreviation||home?.team?.shortDisplayName||'—',
      awayScore:away?.score==null?null:String(away.score),
      homeScore:home?.score==null?null:String(home.score),
      state:String(type?.state||'pre').toLowerCase(),
      detail:type?.shortDetail||type?.detail||st?.displayClock||'Scheduled',
      clock:st?.displayClock||'',
      period:Number(st?.period||0),
      start:e?.date||null
    };
  };
  const normalizeFallback=j=>(j?.games||j?.events||[]).map(g=>({
    id:String(g.espn_event_id||g.event_id||g.id||''),
    away:g.away_team||g.away||'—',home:g.home_team||g.home||'—',
    awayScore:g.away_score==null?null:String(g.away_score),homeScore:g.home_score==null?null:String(g.home_score),
    state:String(g.state||'pre').toLowerCase(),detail:g.status||'Scheduled',clock:g.clock||'',period:Number(g.period||0),start:g.event_start||g.start_time||null
  }));
  function label(g){
    if(g.state==='post')return 'FINAL';
    if(g.state==='in')return g.detail||[g.period?`Q${g.period}`:'',g.clock].filter(Boolean).join(' ');
    if(g.start){try{return new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(g.start))}catch{}}
    return g.detail||'Scheduled';
  }
  function ensureStyle(){
    if(document.getElementById('ctd-live-score-overlay-style'))return;
    const s=document.createElement('style');s.id='ctd-live-score-overlay-style';
    s.textContent=`#ctd-live-score-strip{position:sticky;top:0;z-index:2147483000;background:#07101e;border-bottom:1px solid #26364d;box-shadow:0 8px 24px rgba(0,0,0,.24);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f7fbff}#ctd-live-score-strip .ctdLiveHead{display:flex;align-items:center;gap:8px;padding:7px 12px 4px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#9fb4cc}#ctd-live-score-strip .ctdLiveDot{width:7px;height:7px;border-radius:50%;background:#38df8d;box-shadow:0 0 0 3px rgba(56,223,141,.13)}#ctd-live-score-strip .ctdLiveGames{display:flex;gap:8px;overflow-x:auto;padding:4px 10px 9px;scrollbar-width:none}#ctd-live-score-strip .ctdLiveGames::-webkit-scrollbar{display:none}#ctd-live-score-strip .ctdLiveGame{flex:0 0 auto;min-width:130px;border:1px solid #203149;border-radius:10px;background:#0b1728;padding:7px 9px}#ctd-live-score-strip .ctdLiveRow{display:grid;grid-template-columns:1fr auto;gap:14px;font-size:13px;font-weight:800;line-height:1.45}#ctd-live-score-strip .ctdLiveStatus{margin-top:3px;font-size:10px;color:#9fb4cc;font-weight:700}#ctd-live-score-strip .isLive{border-color:#286c50}#ctd-live-score-strip .isLive .ctdLiveStatus{color:#59e7a2}@media(max-width:700px){#ctd-live-score-strip .ctdLiveGame{min-width:118px}#ctd-live-score-strip .ctdLiveHead{padding-left:10px}}`;
    document.head.appendChild(s);
  }
  function ensureStrip(){
    let el=document.getElementById('ctd-live-score-strip');if(el)return el;
    ensureStyle();el=document.createElement('section');el.id='ctd-live-score-strip';el.setAttribute('aria-label','Live NFL scores');
    const first=document.body.firstElementChild;document.body.insertBefore(el,first||null);return el;
  }
  function render(games,source='ESPN'){
    if(!games?.length)return;
    lastGood=games;
    const el=ensureStrip();
    el.innerHTML=`<div class="ctdLiveHead"><span class="ctdLiveDot"></span><span>Live NFL scores</span><span style="margin-left:auto;font-size:9px;opacity:.7">${esc(source)} · CT</span></div><div class="ctdLiveGames">${games.map(g=>`<div class="ctdLiveGame ${g.state==='in'?'isLive':''}" data-live-event="${esc(g.id)}"><div class="ctdLiveRow"><span>${esc(g.away)}</span><span>${g.awayScore==null?'—':esc(g.awayScore)}</span></div><div class="ctdLiveRow"><span>${esc(g.home)}</span><span>${g.homeScore==null?'—':esc(g.homeScore)}</span></div><div class="ctdLiveStatus">${esc(label(g))}</div></div>`).join('')}</div>`;
    document.documentElement.dataset.ctdLiveScores='READY';
    window.CTD_LIVE_SCOREBOARD={games,updated_at:new Date().toISOString(),source};
    window.dispatchEvent(new CustomEvent('ctd:live-scoreboard-updated',{detail:{events:games,source}}));
  }
  function patchExisting(games){
    const roots=[...document.querySelectorAll('[data-game-id],[data-game-key],.ctdTickerGame,.game-card,.gameCard')];
    for(const g of games){
      const root=roots.find(x=>{const t=(x.textContent||'').toUpperCase();return t.includes(String(g.away).toUpperCase())&&t.includes(String(g.home).toUpperCase())});
      if(!root)continue;
      root.dataset.liveState=g.state;
      root.dataset.liveClock=g.clock||'';
      root.dataset.livePeriod=String(g.period||'');
      root.dataset.awayScore=g.awayScore??'';
      root.dataset.homeScore=g.homeScore??'';
    }
  }
  async function fetchLive(){
    const u=`${ESPN}?limit=100&dates=${chicagoDate()}&ts=${Date.now()}`;
    const r=await fetch(u,{cache:'no-store',mode:'cors'});if(!r.ok)throw Error(`ESPN ${r.status}`);
    const j=await r.json();return (j.events||[]).map(mapEspn);
  }
  async function refresh(){
    try{const games=await fetchLive();if(games.length){render(games,'ESPN');patchExisting(games);return}}
    catch(e){console.warn('CTD ESPN live score fetch failed',e)}
    try{const r=await fetch(`${FALLBACK}?ts=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw Error(`fallback ${r.status}`);const games=normalizeFallback(await r.json());if(games.length){render(games,'scoreboard fallback');patchExisting(games);return}}
    catch(e){console.warn('CTD live score fallback failed',e)}
    if(!lastGood){const el=ensureStrip();el.innerHTML='<div class="ctdLiveHead"><span>Live NFL scores temporarily unavailable</span><span style="margin-left:auto;font-size:9px">CT</span></div>';document.documentElement.dataset.ctdLiveScores='FAIL'}
  }
  function start(){refresh();setInterval(refresh,15000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});window.addEventListener('focus',refresh)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
