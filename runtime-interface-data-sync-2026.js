(()=>{
  const RAW='https://raw.githubusercontent.com/brandonlowery013-glitch/-fantasy-2026-player-comparison-/main/';
  const urls={
    tidbits:RAW+'data/probability/generated/matchup-tidbits-2026.json',
    impacts:RAW+'data/ingestion/interface-impact-payload-2026.json'
  };
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  async function json(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`${r.status} ${url}`);return r.json()}
  function findGameForHeading(payload,text){
    const t=String(text||'').toUpperCase();
    return Object.values(payload?.games||{}).find(g=>t.includes(String(g.away_team||'').toUpperCase())&&t.includes(String(g.home_team||'').toUpperCase()))||null;
  }
  function renderTidbits(){
    const payload=window.MATCHUP_TIDBITS_2026;if(!payload)return;
    document.querySelectorAll('.ctdGameDetail').forEach(card=>{
      const old=card.querySelector('.ctdCanonicalTidbits');if(old)old.remove();
      const h=card.querySelector('h2');const g=findGameForHeading(payload,h?.textContent);if(!g||!g.tidbits?.length)return;
      const box=document.createElement('div');box.className='ctdCanonicalTidbits ctdFeatureCard';
      box.innerHTML=`<div class="ctdEyebrow">BETTING HISTORY · MATCHUP TIDBITS</div><div style="margin-top:8px;display:grid;gap:6px">${g.tidbits.map(x=>`<div style="font-size:11px;line-height:1.45;color:#dce8f4">• ${esc(x.text)}</div>`).join('')}</div><div style="margin-top:8px;font-size:9px;color:#6f89a7">Historical context only · ${esc(g.tidbits[0]?.source||'nflverse')}</div>`;
      const grid=card.querySelector('.ctdGameGrid');(grid?.parentNode||card).insertBefore(box,grid?.nextSibling||null);
    });
  }
  function expose(){
    document.dispatchEvent(new CustomEvent('ctd:canonical-interface-data',{detail:{tidbits:window.MATCHUP_TIDBITS_2026||null,impacts:window.INTERFACE_IMPACT_PAYLOAD_2026||null}}));
    renderTidbits();
  }
  const observer=new MutationObserver(()=>renderTidbits());observer.observe(document.documentElement,{childList:true,subtree:true});
  Promise.allSettled([json(urls.tidbits),json(urls.impacts)]).then(([a,b])=>{
    window.MATCHUP_TIDBITS_2026=a.status==='fulfilled'?a.value:null;
    window.INTERFACE_IMPACT_PAYLOAD_2026=b.status==='fulfilled'?b.value:null;
    window.CTD_CANONICAL_INTERFACE_SYNC={loaded_at:new Date().toISOString(),tidbits_loaded:!!window.MATCHUP_TIDBITS_2026,impacts_loaded:!!window.INTERFACE_IMPACT_PAYLOAD_2026,source_branch:'main'};
    expose();
  });
})();
