(()=>{
 const base=new URL('.',document.currentScript.src),canon=t=>({WAS:'WSH',LA:'LAR',JAC:'JAX'}[t]||t);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let data=null,busy=false,lastFetch=0;
 function render(){
  document.getElementById('ctdPublicSplits')?.remove();
  document.querySelectorAll('#ctdGameTicker [data-game-index]').forEach(card=>{
   card.querySelector('.ctdCardSplits')?.remove();
   const g=BET_FEED.games?.[Number(card.dataset.gameIndex)];if(!g)return;
   const start=Date.parse(g.event_start||g.kickoff||g.start_at),m=data?.games?.find(x=>canon(x.home)===canon(g.home_team)&&canon(x.away)===canon(g.away_team)&&Math.abs(Date.parse(x.start_at)-start)<3600000);
   const block=document.createElement('div');block.className='ctdCardSplits';
   block.title='Consensus is the share of bets. Money is the share of dollars wagered at DraftKings; it does not identify professional bettors.';
   block.innerHTML='<div class="ctdCardSplitsTitle">CONSENSUS · SMART MONEY</div>';
   if(!m){block.innerHTML+='<div class="ctdCardSplitsDate">'+(data?'No published percentages for this game':'Loading percentages…')+'</div>';card.append(block);return;}
   block.innerHTML+='<div class="ctdCardSplitsRow ctdCardSplitsHead"><span></span><span>Bets</span><span>Money</span></div>';
   for(const [key,name] of [['moneyline','Moneyline'],['spread','Spread'],['total','Total']]){
    const rows=m[key]||[];
    for(const row of rows){const team=canon(row.side)===canon(g.home_team)?g.home_team:g.away_team;const side=key==='moneyline'?team:key==='spread'?`${team} ${row.label.split(' ').at(-1)}`:row.label;
     block.innerHTML+=`<div class="ctdCardSplitsRow"><span><small>${name}</small> ${esc(side)}</span><b>${esc(row.bets)}%</b><b>${esc(row.money)}%</b></div>`;
    }
   }
   block.innerHTML+=`<div class="ctdCardSplitsDate">DraftKings · ${esc(new Date(m.observed_at).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))}</div>`;
   card.append(block);
  });
 }
 async function load(){if(busy||document.hidden||Date.now()-lastFetch<300000)return;busy=true;lastFetch=Date.now();try{const local=['localhost','127.0.0.1'].includes(location.hostname),api=location.hostname.endsWith('.pages.dev')?'/api/live/splits':'https://frontend-ctd-cloudflare-work.chuck-the-duke-preview.pages.dev/api/live/splits';let r;try{r=await fetch(local?new URL('market-percentages.json',base):api,{cache:'no-store',signal:AbortSignal.timeout(15000)});}catch{}if(!r?.ok)r=await fetch(new URL('market-percentages.json',base),{cache:'no-store'});if(!r.ok)throw Error();const next=await r.json();if(next.schema_version===1&&Array.isArray(next.games))data=next;}catch{}finally{busy=false;render();}}
 const originalTicker=renderTicker;renderTicker=function(){originalTicker();render();};
 const originalSelection=renderSelectedGame;renderSelectedGame=function(){originalSelection();render();};
 const style=document.createElement('style');style.textContent=`#ctdGameTicker .gamecard{display:flex;flex-direction:column;justify-content:flex-start;gap:0;min-width:280px;flex:0 0 280px!important;align-self:stretch} .ctdCardSplits{margin-top:10px;padding-top:8px;border-top:1px solid #294052;text-align:left;white-space:normal}.ctdCardSplitsTitle{font-size:10px;font-weight:800;letter-spacing:.04em;color:#a9c9e8;margin-bottom:5px}.ctdCardSplitsRow{display:grid;grid-template-columns:minmax(0,1fr) 42px 46px;gap:6px;align-items:center;font-size:11px;line-height:1.65;color:#e2ecf7}.ctdCardSplitsRow>:not(:first-child){text-align:right}.ctdCardSplitsRow small{font-size:10px;color:#8fa9c4}.ctdCardSplitsHead{font-size:10px;color:#8fa9c4}.ctdCardSplitsDate{font-size:9px;color:#8fa9c4;margin-top:6px;line-height:1.5}`;document.head.append(style);
 document.addEventListener('ctd:games-ready',render);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});load();setInterval(load,300000);
})();
