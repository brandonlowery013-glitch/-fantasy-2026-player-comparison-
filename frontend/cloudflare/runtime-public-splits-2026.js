(()=>{
 const base=new URL('.',document.currentScript.src),canon=t=>({WAS:'WSH',LA:'LAR',JAC:'JAX'}[t]||t);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let data=null,busy=false,lastFetch=0,market='moneyline',oddsHTML=null;
 import(new URL('lib/market-card.mjs',base)).then(m=>{oddsHTML=m.cardOddsHTML;render();});
 const savedKey='ctd-published-splits-v1',historyModule=import(new URL('lib/splits-history.mjs',base)),producerModule=import(new URL('lib/public-betting-feed.mjs',base));
 const markets={moneyline:'Moneyline',spread:'Spread',total:'Total'};
 function controls(){
  const ticker=document.getElementById('ctdGameTicker');if(!ticker)return;
  let host=document.getElementById('ctdSplitsControls');
  if(!host){host=document.createElement('div');host.id='ctdSplitsControls';host.innerHTML='<span>Consensus &amp; Smart Money</span><div role="group" aria-label="Betting percentage market">'+Object.entries(markets).map(([key,label])=>`<button type="button" data-splits-market="${key}" aria-pressed="${key===market}">${label}</button>`).join('')+'</div>';ticker.before(host);
   host.addEventListener('click',event=>{const button=event.target.closest('[data-splits-market]');if(!button)return;market=button.dataset.splitsMarket;render();});
  }
  let state=document.getElementById('ctdSplitsCollection');if(!state){state=document.createElement('div');state.id='ctdSplitsCollection';host.after(state);}const health=data?.health;state.textContent=health?(health.status==='PARTIAL'?'Primary feed delayed · '+(data?.backup?.source||'Public')+' backup · Coverage varies by market':health.status==='CURRENT'?'Betting percentages updated':'Betting percentages unavailable or delayed')+' · Last successful check '+(health.last_success_at?new Date(health.last_success_at).toLocaleString():'unavailable')+' · Automatic retry every 5 minutes · Odds remain visible separately':'Loading betting percentages…';
  host.querySelectorAll('[data-splits-market]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.splitsMarket===market)));
 }
 function render(){
  controls();document.getElementById('ctdPublicSplits')?.remove();
  document.querySelectorAll('#ctdGameTicker [data-game-index]').forEach(card=>{
   card.querySelector('.ctdCardSplits')?.remove();card.querySelector('.ctdCardOdds')?.remove();
   const g=BET_FEED.games?.[Number(card.dataset.gameIndex)];if(!g)return;
   if(oddsHTML)card.insertAdjacentHTML('beforeend',oddsHTML(g,window.CTD_LIVE_ODDS,esc));
   const start=Date.parse(g.event_start||g.kickoff||g.start_at),matches=x=>canon(x.home)===canon(g.home_team)&&canon(x.away)===canon(g.away_team)&&Date.parse(x.start_at)===start;
   const primary=data?.games?.find(matches),backup=data?.backup?.games?.find(matches),at=x=>Date.parse(x?.market_observed_at?.[market]||x?.observed_at);
   const m=backup?.[market]?.length===2&&(!primary?.[market]?.length||at(backup)>at(primary))?backup:primary;
   const block=document.createElement('div');block.className='ctdCardSplits';
   block.title='Consensus is ticket share. Smart Money is dollar share; it does not identify professional bettors. Each pair uses one named source.';
   const source=m?.source||'Provider unavailable';
   block.innerHTML=`<div class="ctdSplitHeading"><strong>${markets[market]} percentages</strong><span>${esc(source)}</span></div>`;
   const rows=m?.[market]||[],sides=market==='total'?['Over','Under']:[canon(g.away_team),canon(g.home_team)],pair=sides.map(side=>rows.find(r=>canon(r.side)===side));
   block.innerHTML+=`<div class="ctdSplitSides"><span><i class="ctdSideA"></i>${esc(sides[0])}</span><span>${esc(sides[1])}<i class="ctdSideB"></i></span></div>`;
   let published=false;
   for(const [key,label] of [['bets','Consensus · tickets'],['money','Smart Money · dollars']]){
    const valid=pair.every(r=>typeof r?.[key]==='number'&&Number.isFinite(r[key])&&r[key]>=0&&r[key]<=100)&&Math.abs(pair[0][key]+pair[1][key]-100)<=1;
    if(!valid){block.innerHTML+=`<p class="ctdSplitEmpty">${label}: ${data?'Unavailable from public sources':'Loading…'}</p>`;continue;}published=true;
    block.innerHTML+=`<div class="ctdSplitMetric"><div class="ctdSplitValues"><b>${pair[0][key]}<small>%</small></b><span>${label}</span><b>${pair[1][key]}<small>%</small></b></div><div class="ctdSplitBar" role="img" aria-label="${esc(label+': '+sides[0]+' '+pair[0][key]+'%, '+sides[1]+' '+pair[1][key]+'%')}"><span class="ctdSideA" style="width:${pair[0][key]}%"></span><span class="ctdSideB" style="width:${pair[1][key]}%"></span></div></div>`;
   }
   if(published)block.innerHTML+=`<div class="ctdSplitChecked">${Date.now()>=start?'Archived':Date.now()-at(m)>15*60000?'Stale · Checked':'Checked'} ${esc(new Date(at(m)).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))}${m.source_url?` · <a href="${esc(m.source_url)}" target="_blank" rel="noopener">Source</a>`:''}</div>`;
   card.append(block);
  });
 }
 async function load(){if(busy||document.hidden||Date.now()-lastFetch<300000)return;busy=true;lastFetch=Date.now();try{const local=['localhost','127.0.0.1'].includes(location.hostname),api=location.hostname.endsWith('.pages.dev')?'/api/live/splits':'https://frontend-ctd-cloudflare-work.chuck-the-duke-preview.pages.dev/api/live/splits';let r;try{r=await fetch(local?new URL('market-percentages.json',base):api,{cache:'no-store',signal:AbortSignal.timeout(15000)});}catch{}if(!r?.ok)r=await fetch(new URL('market-percentages.json',base),{cache:'no-store'});if(!r.ok)throw Error();const next=await r.json();let producer=null;try{const [{publicBettingFeed},recommendations]=await Promise.all([producerModule,window.CTD_GAME_MODEL.load('recommendations')]);producer=publicBettingFeed(recommendations);}catch{}if(next.schema_version===1&&Array.isArray(next.games)){const {preservePublished}=await historyModule;let saved=null;try{saved=JSON.parse(localStorage.getItem(savedKey));}catch{}data=preservePublished(next,producer,data,saved);try{localStorage.setItem(savedKey,JSON.stringify(data));}catch{}}}catch{}finally{busy=false;render();}}
 const originalTicker=renderTicker;renderTicker=function(){originalTicker();render();};
 const originalSelection=renderSelectedGame;renderSelectedGame=function(){originalSelection();render();};
 const style=document.createElement('style');style.textContent=`
 #ctdSplitsCollection{font-size:11px;color:#9db5cd;margin:0 0 12px}#ctdSplitsCollection a{color:#9ac7fb}
 #ctdSplitsControls{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:12px 0 10px;color:#c6d8eb;font-size:12px;font-weight:650}
 #ctdSplitsControls [role=group]{display:flex;padding:3px;border:1px solid #273c55;border-radius:8px;background:#091321;gap:3px}
 #ctdSplitsControls button{appearance:none;border:0;border-radius:5px;background:transparent;color:#9fb2c9;padding:7px 14px;font-family:inherit;font-size:11px;font-weight:600;cursor:pointer}
 #ctdSplitsControls button[aria-pressed=true]{background:#1e4269;color:#f1f7ff;box-shadow:inset 0 0 0 1px #3a6591}
 #ctdSplitsControls button:focus-visible{outline:2px solid #78b9ff;outline-offset:2px}
 #ctdGameTicker .gamecard{display:flex;flex-direction:column;justify-content:flex-start;gap:0;min-width:280px;flex:0 0 280px!important;align-self:stretch}
 .ctdCardOdds{margin-top:11px;padding:11px 12px;border:1px solid #36526e;border-radius:8px;background:#102337;text-align:left;white-space:normal}.ctdCardQuote{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:7px 0;border-bottom:1px solid #263d53;font-size:11px;font-variant-numeric:tabular-nums}.ctdCardQuote small{grid-column:1/-1;color:#95acc2;font-size:10px}.ctdCardQuote b:last-child{text-align:right}.ctdCardOdds .ctdSplitHeading{margin-bottom:5px}
 .ctdCardSplits{margin-top:11px;padding:11px 12px 9px;border:1px solid #21374f;border-radius:8px;background:#0c1c2e;text-align:left;white-space:normal}
 .ctdSplitHeading{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:13px}
 .ctdSplitHeading strong{font-size:12px;font-weight:700;color:#e9f2fd}.ctdSplitHeading>span{font-size:9px;color:#8ca4bc}
 .ctdSplitSides{display:flex;justify-content:space-between;gap:8px;font-size:12px;font-weight:700;color:#d6e5f6;margin-bottom:10px}
 .ctdSplitSides>span{display:flex;align-items:center;gap:6px}.ctdSplitSides i{width:6px;height:6px;border-radius:50%;display:inline-block;flex:none}
 .ctdSplitPrices{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:-3px 0 10px;padding-bottom:9px;border-bottom:1px solid #21374f;font-variant-numeric:tabular-nums}.ctdSplitPrices b{font-size:12px;font-weight:650;color:#c9ddf2}.ctdSplitPrices>span{font-size:9px;color:#8ca4bc;font-weight:500}
 .ctdSideA{background:#519fff}.ctdSideB{background:#43cbb8}
 .ctdSplitMetric+.ctdSplitMetric{margin-top:10px}
 .ctdSplitValues{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px;font-variant-numeric:tabular-nums}
 .ctdSplitValues b{font-size:17px;color:#f0f6fe;line-height:1.2;font-weight:750}.ctdSplitValues small{font-size:11px;margin-left:1px;color:#b8cce1}
 .ctdSplitValues>span{color:#9db5cd;font-size:10px;font-weight:600;letter-spacing:.03em}
 .ctdSplitBar{height:5px;border-radius:3px;overflow:hidden;display:flex;background:#23374b}.ctdSplitBar>span{display:block;min-width:0}.ctdSplitBar>span+span{border-left:2px solid #0c1c2e;box-sizing:border-box}
 .ctdSplitChecked{font-size:9px;line-height:1.4;color:#7893ad;margin-top:12px}.ctdSplitEmpty{font-size:11px;color:#8ca4bc;margin:8px 0 0;line-height:1.6}
 `;document.head.append(style);
 document.addEventListener('ctd:odds-ready',render);document.addEventListener('ctd:games-ready',render);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});load();setInterval(load,300000);
})();
