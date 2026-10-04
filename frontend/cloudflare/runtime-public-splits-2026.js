(()=>{
 const base=new URL('.',document.currentScript.src),canon=t=>({WAS:'WSH',LA:'LAR',JAC:'JAX'}[t]||t);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let data=null,busy=false,lastFetch=0,market='moneyline';
 const savedKey='ctd-published-splits-v1',historyModule=import(new URL('lib/splits-history.mjs',base));
 const markets={moneyline:'Moneyline',spread:'Spread',total:'Total'};
 function controls(){
  const ticker=document.getElementById('ctdGameTicker');if(!ticker)return;
  let host=document.getElementById('ctdSplitsControls');
  if(!host){host=document.createElement('div');host.id='ctdSplitsControls';host.innerHTML='<span>Consensus &amp; Smart Money</span><div role="group" aria-label="Betting percentage market">'+Object.entries(markets).map(([key,label])=>`<button type="button" data-splits-market="${key}" aria-pressed="${key===market}">${label}</button>`).join('')+'</div>';ticker.before(host);
   host.addEventListener('click',event=>{const button=event.target.closest('[data-splits-market]');if(!button)return;market=button.dataset.splitsMarket;render();});
  }
  host.querySelectorAll('[data-splits-market]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.splitsMarket===market)));
 }
 function render(){
  controls();document.getElementById('ctdPublicSplits')?.remove();
  document.querySelectorAll('#ctdGameTicker [data-game-index]').forEach(card=>{
   card.querySelector('.ctdCardSplits')?.remove();
   const g=BET_FEED.games?.[Number(card.dataset.gameIndex)];if(!g)return;
   const start=Date.parse(g.event_start||g.kickoff||g.start_at),m=data?.games?.find(x=>canon(x.home)===canon(g.home_team)&&canon(x.away)===canon(g.away_team)&&Math.abs(Date.parse(x.start_at)-start)<3600000);
   const block=document.createElement('div');block.className='ctdCardSplits';
   block.title='Consensus is the share of bets. Smart Money shows the share of dollars wagered at DraftKings; it does not identify professional bettors.';
   block.innerHTML=`<div class="ctdSplitHeading"><strong>${markets[market]}</strong><span>DraftKings</span></div>`;
   const rows=m?.[market]||[],sides=market==='total'?['Over','Under']:[canon(g.away_team),canon(g.home_team)],pair=sides.map(side=>rows.find(r=>canon(r.side)===side));
   if(pair.some(r=>!r)||!['bets','money'].every(k=>pair.every(r=>Number.isFinite(r[k])&&r[k]>=0&&r[k]<=100)&&Math.abs(pair[0][k]+pair[1][k]-100)<=1)){
    block.innerHTML+='<p class="ctdSplitEmpty">'+(data?'No published percentages':'Loading percentages…')+'</p>';card.append(block);return;
   }
   const labels=pair.map((r,i)=>market==='total'?r.label:market==='spread'?`${i===0?g.away_team:g.home_team} ${r.label.split(' ').at(-1)}`:i===0?g.away_team:g.home_team);
   block.innerHTML+=`<div class="ctdSplitSides"><span><i class="ctdSideA"></i>${esc(labels[0])}</span><span>${esc(labels[1])}<i class="ctdSideB"></i></span></div>`;
   for(const [key,label] of [['bets','Consensus'],['money','Smart Money']]){
    block.innerHTML+=`<div class="ctdSplitMetric"><div class="ctdSplitValues"><b>${pair[0][key]}<small>%</small></b><span>${label}</span><b>${pair[1][key]}<small>%</small></b></div><div class="ctdSplitBar" role="img" aria-label="${esc(label+': '+labels[0]+' '+pair[0][key]+'%, '+labels[1]+' '+pair[1][key]+'%')}"><span class="ctdSideA" style="width:${pair[0][key]}%"></span><span class="ctdSideB" style="width:${pair[1][key]}%"></span></div></div>`;
   }
   block.innerHTML+=`<div class="ctdSplitChecked">Checked ${esc(new Date(m.market_observed_at?.[market]||m.observed_at).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))}</div>`;
   card.append(block);
  });
 }
 async function load(){if(busy||document.hidden||Date.now()-lastFetch<300000)return;busy=true;lastFetch=Date.now();try{const local=['localhost','127.0.0.1'].includes(location.hostname),api=location.hostname.endsWith('.pages.dev')?'/api/live/splits':'https://frontend-ctd-cloudflare-work.chuck-the-duke-preview.pages.dev/api/live/splits';let r;try{r=await fetch(local?new URL('market-percentages.json',base):api,{cache:'no-store',signal:AbortSignal.timeout(15000)});}catch{}if(!r?.ok)r=await fetch(new URL('market-percentages.json',base),{cache:'no-store'});if(!r.ok)throw Error();const next=await r.json();if(next.schema_version===1&&Array.isArray(next.games)){const {preservePublished}=await historyModule;let saved=null;try{saved=JSON.parse(localStorage.getItem(savedKey));}catch{}data=preservePublished(next,data,saved);try{localStorage.setItem(savedKey,JSON.stringify(data));}catch{}}}catch{}finally{busy=false;render();}}
 const originalTicker=renderTicker;renderTicker=function(){originalTicker();render();};
 const originalSelection=renderSelectedGame;renderSelectedGame=function(){originalSelection();render();};
 const style=document.createElement('style');style.textContent=`
 #ctdSplitsControls{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:12px 0 10px;color:#c6d8eb;font-size:12px;font-weight:650}
 #ctdSplitsControls [role=group]{display:flex;padding:3px;border:1px solid #273c55;border-radius:8px;background:#091321;gap:3px}
 #ctdSplitsControls button{appearance:none;border:0;border-radius:5px;background:transparent;color:#9fb2c9;padding:7px 14px;font-family:inherit;font-size:11px;font-weight:600;cursor:pointer}
 #ctdSplitsControls button[aria-pressed=true]{background:#1e4269;color:#f1f7ff;box-shadow:inset 0 0 0 1px #3a6591}
 #ctdSplitsControls button:focus-visible{outline:2px solid #78b9ff;outline-offset:2px}
 #ctdGameTicker .gamecard{display:flex;flex-direction:column;justify-content:flex-start;gap:0;min-width:280px;flex:0 0 280px!important;align-self:stretch}
 .ctdCardSplits{margin-top:11px;padding:11px 12px 9px;border:1px solid #21374f;border-radius:8px;background:#0c1c2e;text-align:left;white-space:normal}
 .ctdSplitHeading{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:13px}
 .ctdSplitHeading strong{font-size:12px;font-weight:700;color:#e9f2fd}.ctdSplitHeading>span{font-size:9px;color:#8ca4bc}
 .ctdSplitSides{display:flex;justify-content:space-between;gap:8px;font-size:12px;font-weight:700;color:#d6e5f6;margin-bottom:10px}
 .ctdSplitSides>span{display:flex;align-items:center;gap:6px}.ctdSplitSides i{width:6px;height:6px;border-radius:50%;display:inline-block;flex:none}
 .ctdSideA{background:#519fff}.ctdSideB{background:#43cbb8}
 .ctdSplitMetric+.ctdSplitMetric{margin-top:10px}
 .ctdSplitValues{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px;font-variant-numeric:tabular-nums}
 .ctdSplitValues b{font-size:17px;color:#f0f6fe;line-height:1.2;font-weight:750}.ctdSplitValues small{font-size:11px;margin-left:1px;color:#b8cce1}
 .ctdSplitValues>span{color:#9db5cd;font-size:10px;font-weight:600;letter-spacing:.03em}
 .ctdSplitBar{height:5px;border-radius:3px;overflow:hidden;display:flex;background:#23374b}.ctdSplitBar>span{display:block;min-width:0}.ctdSplitBar>span+span{border-left:2px solid #0c1c2e;box-sizing:border-box}
 .ctdSplitChecked{font-size:9px;line-height:1.4;color:#7893ad;margin-top:12px}.ctdSplitEmpty{font-size:11px;color:#8ca4bc;margin:8px 0 0;line-height:1.6}
 `;document.head.append(style);
 document.addEventListener('ctd:games-ready',render);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});load();setInterval(load,300000);
})();
