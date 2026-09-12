(()=>{
  const escape=s=>String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let finalFeed=null;
  const playerCard=p=>{const m=window.CTD_MARKET_VALUE_BOARD_2026?.board?.find(x=>x.player===p.name);return `<article class="categoryCard"><h3>${escape(p.pos)} · ${escape(p.team)}</h3><h2>${escape(p.name)}</h2>${[['Overall rank',p.overall],['True value rank',p.trueRank],['Market ADP',m?.market_adp],['Market read',m?.action],['Production',p.production],['Ceiling',p.ceiling],['Role',p.role],['Environment',p.environment],['Availability',p.availability]].map(([k,v])=>`<div class="catPlayer"><span>${escape(k)}</span><b>${escape(v)}</b></div>`).join('')}<p class="copy">${escape(p.evaluationStatic?.headline||p.overallWriteup||'No evaluation published.')}</p></article>`};
  function compare(){const a=document.getElementById('compareA'),b=document.getElementById('compareB');document.getElementById('comparison').innerHTML=[a.value,b.value].map(n=>PLAYERS.find(p=>p.name===n)).filter(Boolean).map(playerCard).join('')}
  function canonical(){const players=window.CTD_CANONICAL_PLAYERS_2026;if(!players?.length)return;PLAYERS.splice(0,PLAYERS.length,...players);['compareA','compareB'].forEach((id,i)=>{const el=document.getElementById(id),prior=el.value;el.innerHTML=PLAYERS.map(p=>`<option value="${escape(p.name)}">${escape(p.name)} · ${escape(p.pos)}</option>`).join('');el.value=PLAYERS.some(p=>p.name===prior)?prior:PLAYERS[i].name});compare()}
  document.addEventListener('ctd:canonical-players-ready',canonical);
  document.addEventListener('ctd:published-data-ready',()=>{compare();betting()});
  document.getElementById('compareA').addEventListener('change',compare);
  document.getElementById('compareB').addEventListener('change',compare);
  if(window.CTD_CANONICAL_PLAYERS_2026)canonical();
  function betting(){
    const mode=window.CTD_MODEL_STATE_2026?.actionable?'Current published model output':'Analysis only — current model output is not actionable';
    const props=finalFeed?.props||[],parlays=finalFeed?.parlays||[];
    for(const [panel,rows] of [['props',props],['parlays',parlays]]){
      document.querySelector(`[data-bet-panel="${panel}"]`).innerHTML=`<div class="panel"><h3>${panel.toUpperCase()}</h3><p class="copy">${escape(mode)}</p>${Array.isArray(rows)&&rows.length?rows.map(x=>`<div class="categoryCard"><b>${escape(x.player||x.name||x.selection||'Published analysis')}</b><p class="copy">${escape(x.selection||x.summary||x.status||'No selection published')}</p></div>`).join(''):`<p class="copy">${finalFeed?'No '+panel+' have been published in the current GitHub feed.':'Published '+panel+' feed is unavailable.'}</p>`}</div>`;
    }
  }
  async function finalData(){try{const r=await fetch(RAW+'data/market/final-betting-ui-feed-2026.json?ts='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error(r.status);finalFeed=await r.json();betting()}catch{finalFeed=null;betting()}}
  finalData();setInterval(finalData,60000);
  const report=document.querySelector('.actions .primary');
  report.addEventListener('click',()=>{
    let dialog=document.getElementById('matchupReport');if(!dialog){dialog=document.createElement('dialog');dialog.id='matchupReport';dialog.style.cssText='background:#0a1422;color:#f3f7fd;border:1px solid #2e5684;border-radius:10px;max-width:680px;width:90%';document.body.appendChild(dialog)}
    const g=BET_FEED.games[selectedGameIndex];
    dialog.innerHTML=`<button class="btn" id="closeReport">Close report</button><h2>${g?escape(g.away_team)+' @ '+escape(g.home_team):'No game selected'}</h2><p>${escape(window.CTD_MODEL_STATE_2026?.actionable?'Actionable':'Analysis only')}</p>${g?`<p>${escape(g.model_summary)}</p>${[['Spread',g.spread],['Model spread',g.model_spread_pick],['Total',g.total],['Model total',g.total_pick],['Moneyline',g.moneyline_pick]].map(([k,v])=>`<div class="catPlayer"><span>${k}</span><b>${escape(v)}</b></div>`).join('')}`:''}`;
    dialog.querySelector('#closeReport').onclick=()=>dialog.close();dialog.showModal();
  });
  const tools=[...document.querySelectorAll('.tools .tool')];
  tools.forEach((button,i)=>{button.title=['Find a player','Weekly opportunities','About Chuck The Duke'][i];button.addEventListener('click',()=>{if(i===0){showPage('comparePage',document.querySelector('[data-page="comparePage"]'));document.getElementById('compareA').focus()}else if(i===1){showPage('weeklyPage',document.querySelector('[data-page="weeklyPage"]'))}else{alert('Chuck The Duke · LOCK1 preview\nOriginal approved interface with canonical GitHub player and market data.')}})});
  document.querySelector('#weeklyPage .categoryIntro').textContent='Weekly categories use published GitHub outputs. Unpublished categories remain unavailable.';
  document.addEventListener('ctd:games-ready',()=>{const active=[...document.querySelectorAll('.tabs button')].find(b=>b.textContent.trim()===activeGameTab);if(active&&activeGameTab!=='OVERVIEW')active.click()});
})();
