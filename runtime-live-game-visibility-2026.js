(()=>{
  const ID='ctd-live-visibility-panel';
  const SUMMARY=id=>`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${encodeURIComponent(id)}`;
  let latest=null,lastSummaryId=null,lastSummary=null,inFlight=null;
  const esc=v=>String(v??'—').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const live=e=>['in','live','halftime'].some(x=>String(e?.state||e?.status||'').toLowerCase().includes(x));
  const final=e=>['post','final','closed','complete'].some(x=>String(e?.state||e?.status||'').toLowerCase().includes(x));
  const eventsFromSchedule=()=>{try{return Array.isArray(SCHEDULE?.games)?SCHEDULE.games:[]}catch{return[]}};
  const current=()=>{
    const xs=latest?.length?latest:eventsFromSchedule();
    return xs.find(live)||xs.find(final)||xs[0]||null;
  };
  const statRows=summary=>{
    const groups=summary?.boxscore?.players||[];
    const rows=[];
    for(const team of groups){
      for(const group of team?.statistics||[]){
        const labels=group?.labels||[];
        for(const a of group?.athletes||[]){
          const vals=a?.stats||[];
          const data=labels.map((l,i)=>`${l} ${vals[i]??'—'}`).join(' · ');
          if(data)rows.push({team:team?.team?.abbreviation||'',name:a?.athlete?.displayName||'Player',cat:group?.displayName||group?.name||'',data});
        }
      }
    }
    return rows.slice(0,18);
  };
  function ensure(){
    let p=document.getElementById(ID);if(p)return p;
    p=document.createElement('section');p.id=ID;
    p.style.cssText='margin:12px 14px;padding:12px;border:1px solid #1d6fa5;border-radius:12px;background:#07111f;color:#eef7ff;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;position:relative;z-index:20';
    const host=document.querySelector('.ctdTicker,.ctdGameTicker,#ctdGameDetailMount,main,#app')||document.body;
    host.prepend(p);return p;
  }
  function render(){
    const p=ensure(),e=current();
    if(!e){p.innerHTML='<b>Live NFL</b><div style="margin-top:6px;color:#8fa8bf;font-size:12px">Waiting for ESPN game data…</div>';return}
    const id=String(e.espn_event_id||e.provider_event_id||e.event_id||'');
    const state=live(e)?'LIVE':final(e)?'FINAL':'SCHEDULED';
    const score=(e.away_score==null||e.home_score==null)?'—':`${esc(e.away_score)} – ${esc(e.home_score)}`;
    const meta=[state,e.period?`Q${esc(e.period)}`:'',e.clock?esc(e.clock):'',e.status?esc(e.status):''].filter(Boolean).join(' · ');
    const rows=(lastSummaryId===id&&lastSummary)?statRows(lastSummary):[];
    p.innerHTML=`<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><div style="font-size:11px;font-weight:900;letter-spacing:.08em;color:#61d8ff">NFL LIVE GAME</div><div style="font-size:20px;font-weight:950;margin-top:3px">${esc(e.away_team||e.away||'AWAY')} ${score} ${esc(e.home_team||e.home||'HOME')}</div><div style="font-size:12px;color:#a9bdd0;margin-top:3px">${meta}</div></div><div style="font-size:10px;color:#7f98ae;text-align:right">ESPN<br>${esc(id)}</div></div><div style="margin-top:10px;border-top:1px solid #173550;padding-top:8px"><div style="font-size:11px;font-weight:900;color:#bfeeff;margin-bottom:5px">PLAYER STATS</div>${rows.length?rows.map(r=>`<div style="display:grid;grid-template-columns:48px minmax(110px,1fr) 2fr;gap:8px;padding:5px 0;border-top:1px solid #102a40;font-size:11px"><b>${esc(r.team)}</b><span>${esc(r.name)}</span><span style="color:#9fb3c7">${esc(r.cat)} · ${esc(r.data)}</span></div>`).join(''):'<div style="font-size:11px;color:#8fa8bf">Loading live player stats…</div>'}</div>`;
    if(id&&lastSummaryId!==id)load(id);
  }
  async function load(id){
    if(!id||inFlight===id)return;inFlight=id;
    try{const r=await fetch(SUMMARY(id),{cache:'no-store'});if(!r.ok)throw Error(`summary ${r.status}`);lastSummary=await r.json();lastSummaryId=id;render()}catch(e){console.warn('CTD visible live summary unavailable',e)}finally{if(inFlight===id)inFlight=null}
  }
  window.addEventListener('ctd:live-scoreboard-updated',ev=>{latest=Array.isArray(ev?.detail?.events)?ev.detail.events:latest;const e=current();render();const id=String(e?.espn_event_id||e?.provider_event_id||e?.event_id||'');if(id)load(id)});
  window.addEventListener('ctd:live-game-detail-updated',()=>render());
  window.addEventListener('ctd:live-feed-health',()=>render());
  document.addEventListener('DOMContentLoaded',render,{once:true});
  if(document.readyState!=='loading')render();
  setInterval(()=>{const e=current();if(e&&live(e)){const id=String(e.espn_event_id||e.provider_event_id||e.event_id||'');if(id)load(id)}render()},15000);
})();