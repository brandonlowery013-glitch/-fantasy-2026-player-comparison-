(()=>{
  const escape=s=>String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let finalFeed=null;
  const percent=n=>n==null?'—':(Number(n)*100).toFixed(1)+'%';
  const bettingCard=x=>{
    const legs=(x.legs||[]).map(id=>finalFeed?.eligible_legs?.find(l=>l.leg_id===id)).filter(Boolean);
    return `<div class="categoryCard"><h3>${escape(x.ticket_id||x.player||x.name||x.selection||'Published analysis')} · ${escape(x.sportsbook||'')}</h3><p>${escape(x.category||x.market_type||'')} · ${escape(x.verdict||x.status||'')}</p>${legs.map(l=>`<div class="catPlayer"><b>${escape(l.side)}</b><span>${escape(l.american_odds)}</span></div>`).join('')}<div class="catPlayer"><span>Model probability</span><b>${percent(x.model_hit_probability??x.model_win_probability)}</b></div><div class="catPlayer"><span>Expected value</span><b>${percent(x.parlay_expected_value??x.expected_value)}</b></div><p class="copy">${escape(x.explanation||x.summary||'')} ${escape(x.price_status||'')}</p></div>`;
  };
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
      document.querySelector(`[data-bet-panel="${panel}"]`).innerHTML=`<div class="panel"><h3>${panel.toUpperCase()}</h3><p class="copy">${escape(mode)}</p>${Array.isArray(rows)&&rows.length?rows.map(bettingCard).join(''):`<p class="copy">${finalFeed?'No '+panel+' have been published in the current GitHub feed.':'Published '+panel+' feed is unavailable.'}</p>`}</div>`;
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

(()=>{
 const preview='https://raw.githubusercontent.com/brandonlowery013-glitch/-fantasy-2026-player-comparison-/frontend/ctd-cloudflare-work/';
 let outlook=null,history=null;
 const e=x=>String(x??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const get=async url=>{const r=await fetch(url+'?ts='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error(r.status);return r.json()};
 function renderOutlook(){
  const mount=document.getElementById('weeklyCategoryMount');
  const ordered=(window.CTD_CANONICAL_PLAYERS_2026||[]).map(p=>outlook?.players?.[p.name]).filter(Boolean);
  mount.innerHTML=outlook?`<p class="ctdPublishedNote">Published ${e(outlook.generated_at)} · ${ordered.length} players · Current outlook, not start/sit recommendations</p><div class="categoryGrid">${ordered.map(p=>`<article class="categoryCard"><h3>${e(p.position)} · ${e(p.team)}</h3><b>${e(p.player)}</b><p class="copy">${e(p.current_outlook?.health_status)}</p><p class="copy">Next game: ${e(p.next_game?.date)} · ${e(p.next_game?.opponent)}</p>${p.latest_news?.headline?.toLowerCase().includes(p.player.toLowerCase())?`<p class="copy">${e(p.latest_news.date)} · ${e(p.latest_news.headline)}</p>`:''}</article>`).join('')}</div>`:'<p class="ctdPublishedNote">Weekly outlook could not be loaded.</p>';
 }
 function install(){const tabs=document.getElementById('weeklyTabs');if(!tabs||!tabs.dataset.ctdPublished||document.getElementById('outlookTab'))return;const b=document.createElement('button');b.id='outlookTab';b.textContent='PLAYER OUTLOOK';tabs.appendChild(b);b.onclick=()=>{tabs.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));renderOutlook()};}
 document.addEventListener('ctd:published-data-ready',install);
 document.addEventListener('ctd:canonical-players-ready',()=>{if(document.getElementById('outlookTab')?.classList.contains('active'))renderOutlook()});
 install();
 get(preview+'data/weekly/weekly-player-outlook-2026.json').then(d=>{if(d.universe!==166||Object.keys(d.players||{}).length!==166)throw Error('Outlook coverage mismatch');outlook=d;install()}).catch(err=>console.error('Weekly outlook unavailable',err));
 const norm=t=>({LA:'LAR',WAS:'WSH'}[t]||t);
 function historyView(){
  if(!history||!['TRENDS','BETTING HISTORY','MATCHUP'].includes(activeGameTab))return;
  const game=BET_FEED.games[selectedGameIndex];if(!game||Number(history.week)!==Number(BET_FEED.week))return;
  const h=Object.values(history.games||{}).find(x=>norm(x.away_team)===norm(game.away_team)&&norm(x.home_team)===norm(game.home_team));
  if(!h)return;
  const rows=(h.tidbits||[]).filter(x=>activeGameTab==='TRENDS'||activeGameTab==='BETTING HISTORY'||x.scope==='MATCHUP');
  document.getElementById('gameSummary').innerHTML=`<p>Historical context · published ${e(history.generated_at)} · descriptive only</p>${rows.map(x=>`<p>${e(x.text)} <small>Source: ${e(x.source)}</small></p>`).join('')}`;
 }
 document.querySelector('.tabs').addEventListener('click',historyView);
 document.getElementById('ctdGameTicker').addEventListener('click',historyView);
 document.addEventListener('ctd:games-ready',historyView);
 get(RAW+'data/probability/generated/matchup-tidbits-2026.json').then(d=>{history=d;historyView()}).catch(err=>console.error('Historical context unavailable',err));
})();
