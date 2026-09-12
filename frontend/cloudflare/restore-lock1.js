(()=>{
  const escape=s=>String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let finalFeed=null;
  const percent=n=>n==null?'—':(Number(n)*100).toFixed(1)+'%';
  const bettingCard=x=>{
    const legs=(x.legs||[]).map(id=>finalFeed?.eligible_legs?.find(l=>l.leg_id===id)).filter(Boolean);
    return `<div class="categoryCard"><h3>${escape(x.ticket_id||x.player||x.name||x.selection||'Published analysis')} · ${escape(x.sportsbook||'')}</h3><p>${escape(x.category||x.market_type||'')} · ${escape(x.verdict||x.status||'')}</p>${legs.map(l=>`<div class="catPlayer"><b>${escape(l.side)}</b><span>${escape(l.american_odds)}</span></div>`).join('')}<div class="catPlayer"><span>Model probability</span><b>${percent(x.model_hit_probability??x.model_win_probability)}</b></div><div class="catPlayer"><span>Expected value</span><b>${percent(x.parlay_expected_value??x.expected_value)}</b></div><p class="copy">${escape(x.explanation||x.summary||'')} ${escape(x.price_status||'')}</p></div>`;
  };
  const playerCard=p=>{const m=window.CTD_MARKET_VALUE_BOARD_2026?.board?.find(x=>x.player===p.name);return `<article class="categoryCard"><h3>${escape(p.pos)} · ${escape(p.team)}</h3><h2>${escape(p.name)}</h2>${[['Overall rank',p.overall],['True value rank',p.trueRank],['Market ADP',m?.market_adp],['Market read',m?.action],['Production',p.production],['Ceiling',p.ceiling],['Role',p.role],['Environment',p.environment],['Availability',p.availability]].map(([k,v])=>`<div class="catPlayer"><span>${escape(k)}</span><b>${escape(v)}</b></div>`).join('')}<p class="copy">${escape(p.evaluationStatic?.headline||p.overallWriteup||'No evaluation published.')}</p></article>`};
  function compare(){
    const names=['compareA','compareB'].map(id=>document.getElementById(id).value);
    const players=names.map(n=>PLAYERS.find(p=>p.name===n));
    if(players.some(p=>!p))return;
    const rows=[['Overall rank',p=>p.overall],['True value rank',p=>p.trueRank],['Draft ADP',p=>window.CTD_MARKET_VALUE_BOARD_2026?.board?.find(x=>x.player===p.name)?.market_adp],['Draft value',p=>window.CTD_MARKET_VALUE_BOARD_2026?.board?.find(x=>x.player===p.name)?.action],['Production / 10',p=>p.production],['Ceiling / 10',p=>p.ceiling],['Role / 10',p=>p.role],['Environment / 10',p=>p.environment],['Availability score / 10',p=>p.availability]];
    document.getElementById('comparison').innerHTML='<div class="ctdCompareScroll"><table class="ctdCompareTable"><thead><tr><th scope="col">Season outlook</th>'+players.map(p=>'<th scope="col">'+escape(p.name)+'<small>'+escape(p.pos)+' · '+escape(p.team)+'</small></th>').join('')+'</tr></thead><tbody>'+rows.map(([label,value])=>'<tr><th scope="row">'+escape(label)+'</th>'+players.map(p=>'<td>'+escape(value(p))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div><p class="copy">Scores use a 0–10 scale. Availability is a season model score; it does not confirm game-day active status. Draft value compares cost with model rank.</p>';
  }
  const style=document.createElement('style');
  style.textContent='#comparison{display:block}.ctdCompareScroll{overflow-x:auto}.ctdCompareTable{width:100%;border-collapse:collapse;table-layout:fixed;background:#0a1624;border:1px solid #263e58;border-radius:12px}.ctdCompareTable th,.ctdCompareTable td{padding:14px 16px;border-bottom:1px solid #263e58;text-align:left;font-size:15px}.ctdCompareTable th:first-child{width:30%;color:#9fb3c8}.ctdCompareTable td{font-weight:700}.ctdCompareTable small{display:block;color:#9fb3c8;font-size:12px;margin-top:6px}#comparePage select{background:#101f30;color:#f4f8ff;border:1px solid #34516f;border-radius:8px;padding:10px;font-size:16px;max-width:100%;margin:8px 12px 18px 0}#comparePage label{font-size:14px}.ctdOutlookGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:12px}.ctdOutlookGrid .categoryCard{padding:18px}.ctdOutlookGrid h2{font-size:22px;margin:8px 0}.ctdOutlookGrid .copy{font-size:14px;line-height:1.6}@media(max-width:600px){.ctdCompareTable th,.ctdCompareTable td{padding:10px 8px;font-size:12px}#comparePage label{display:block}}';
  document.head.appendChild(style);

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
 const dateLabel=value=>{if(!value)return 'To be confirmed';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}):'To be confirmed'};
 const healthLabel=value=>!value||['PASS','NO ACTIVE MODEL STATUS'].includes(String(value).trim().toUpperCase())?'No specific health update published; game-day status unconfirmed.':String(value).replace(/_/g,' ');
 function renderOutlook(){
  const mount=document.getElementById('weeklyCategoryMount');
  const ordered=(window.CTD_CANONICAL_PLAYERS_2026||[]).map(p=>outlook?.players?.[p.name]).filter(Boolean);
  mount.innerHTML=outlook?`<p class="ctdPublishedNote">Published ${e(dateLabel(outlook.generated_at))} · ${ordered.length} players · Current outlook, not start/sit recommendations</p><div class="ctdOutlookGrid">${ordered.map(p=>`<article class="categoryCard"><h3>${e(p.position)} · ${e(p.team)}</h3><h2>${e(p.player)}</h2><p class="copy">${e(healthLabel(p.current_outlook?.health_status))}</p>${p.last_game?`<p class="copy">Last game: ${e(p.last_game.team_score)}–${e(p.last_game.opponent_score)} vs ${e(p.last_game.opponent)} · Final</p>`:''}<p class="copy">Next game: ${e(dateLabel(p.next_game?.date))} · ${e(p.next_game?.opponent)}</p>${p.latest_news?.headline?.toLowerCase().includes(p.player.toLowerCase())?`<p class="copy">${e(dateLabel(p.latest_news.date))} · ${e(p.latest_news.headline)}</p>`:''}</article>`).join('')}</div>`:'<p class="ctdPublishedNote">Weekly outlook could not be loaded.</p>';
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

(()=>{
 let scores=null;
 const norm=t=>({LA:'LAR',WAS:'WSH'}[t]||t);
 function applyScores(){if(!scores||Number(scores.week)!==Number(BET_FEED.week))return;
  for(const g of BET_FEED.games){const s=scores.games.find(x=>norm(x.away_team)===norm(g.away_team)&&norm(x.home_team)===norm(g.home_team));if(!s)continue;Object.assign(g,{away_score:s.away_score,home_score:s.home_score,status:s.completed?'FINAL':s.state==='in'?'LIVE':new Date(s.date).toLocaleString([], {weekday:'short',hour:'numeric',minute:'2-digit'}),completed:s.completed,latest_scores:{away:[...s.away_periods.slice(0,4),s.away_score],home:[...s.home_periods.slice(0,4),s.home_score]}});
   if(s.completed){g.model_summary=`Final: ${g.away_team} ${s.away_score}, ${g.home_team} ${s.home_score}. Pregame market analysis is archived.`;g.model_spread_pick='GAME FINAL';g.total_pick='GAME FINAL';g.moneyline_pick='GAME FINAL';g.model_edge=null;}
  }
  renderTicker();renderSelectedGame();
 }
 document.addEventListener('ctd:games-ready',applyScores);
 fetch('https://raw.githubusercontent.com/brandonlowery013-glitch/-fantasy-2026-player-comparison-/frontend/ctd-cloudflare-work/data/weekly/scoreboard-2026.json?ts='+Date.now(),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error(r.status);return r.json()}).then(d=>{scores=d;applyScores()}).catch(e=>console.error('Scoreboard unavailable',e));
})();

(()=>{
  let feed=null;
  const e=x=>String(x??'Unavailable').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct=x=>x==null?'Unavailable':(Number(x)*100).toFixed(1)+'%';
  const pp=x=>x==null?'Unavailable':(Number(x)*100).toFixed(1)+' pp';
  const num=x=>x==null?'Unavailable':Number(x).toFixed(1);
  function latest(game){return (game.snapshot_evaluations||[]).filter(s=>s.eligible_for_current_recommendation===true).sort((a,b)=>Date.parse(b.captured_at)-Date.parse(a.captured_at));}
  function selected(game){const rows=latest(game);return rows.find(s=>s.book==='draftkings')||rows[0];}
  function explain(game,s){const p=game.football_projection,lines=Object.entries(s.markets||{}).filter(([,m])=>m.recommendation?.decision==='PICK').map(([kind,m])=>`${kind}: ${m.recommendation.selection}, ${pp(m.recommendation.probability_edge)} probability advantage, ${pct(m.recommendation.expected_value)} expected return per unit risked.`);return `Projected score: ${game.away_team} ${num(p.away_score_mean)}, ${game.home_team} ${num(p.home_score_mean)}. `+(lines.length?lines.join(' '):'No market clears the model thresholds.');}
  function detail(){
    const g=BET_FEED.games[selectedGameIndex];if(!g||!feed||Number(feed.week)!==Number(BET_FEED.week))return;
    const raw=Object.values(feed.games||{}).find(x=>x.away_team===g.away_team&&x.home_team===g.home_team);if(!raw)return;
    const s=selected(raw);if(!s)return;
    const ended=g.completed===true||Date.parse(raw.kickoff)<=Date.now();
    const summary=explain(raw,s);g.model_summary=summary;
    if(activeGameTab==='OVERVIEW')document.getElementById('gameSummary').textContent=(ended?'Pregame analysis (archived). ':'')+summary;
    const p=raw.football_projection;
    document.querySelector('#awayProb + span').textContent=raw.away_team;
    document.querySelector('#homeProb + span').textContent=raw.home_team;
    document.getElementById('awayProb').textContent=pct(p.away_win_probability);
    document.getElementById('homeProb').textContent=pct(p.home_win_probability);
    const ml=s.markets.moneyline?.fair_market;
    document.querySelector('.implied').textContent=`Equal-score simulation outcomes: ${pct(p.tie_probability)} (overtime not verified). Market win chance (bookmaker margin removed): ${raw.away_team} ${pct(ml?.side_b_probability)}, ${raw.home_team} ${pct(ml?.side_a_probability)}. Market figures exclude ties.`;
    document.querySelector('.donut').style.display='none';
    document.getElementById('gameTitle').firstChild.textContent=`${raw.away_team} vs ${raw.home_team} `;
    document.getElementById('gameVenue').textContent=`${ended?'Archived':'Latest stored'} ${s.book} odds · ${new Date(s.captured_at).toLocaleString()} · venue not supplied by this feed`;
    for(const [kind,id] of [['spread','spreadPick'],['total','totalPick'],['moneyline','mlPick']]){
      const r=s.markets[kind]?.recommendation,el=document.getElementById(id),badge=el.parentElement.lastElementChild;
      el.textContent=ended?'Archived':r?.decision==='PICK'?r.selection:'No qualifying bet';
      badge.textContent=!ended&&r?.decision==='PICK'?pp(r.probability_edge):'';
      badge.title='Model probability minus the market probability after removing bookmaker margin. pp = percentage points.';
      if(kind==='spread')g.model_spread_pick=el.textContent;if(kind==='total')g.total_pick=el.textContent;if(kind==='moneyline')g.moneyline_pick=el.textContent;
    }
    for(const [kind,index,labels] of [['spread',1,[raw.home_team,raw.away_team]],['total',2,['Over','Under']]]){
      const m=s.markets[kind],host=document.querySelector(`.lowgrid .panel:nth-child(${index})`);if(!host)continue;
      host.innerHTML=`<h3>${kind.toUpperCase()} PROBABILITIES</h3>`+(m?`<div class="breakrow"><span>Side</span><b>${e(labels[0])}</b><b>${e(labels[1])}</b></div>`+[['Offered odds',x=>x.offered_odds,e],['Model chance (excluding pushes)',x=>x.conditional_win_probability,pct],['Push chance',x=>x.push_probability,pct],['Probability advantage',x=>x.probability_edge,pp],['Expected return / unit risked',x=>x.expected_value,pct]].map(([label,get,format])=>`<div class="breakrow"><span>${label}</span><b>${e(format(get(m.side_a)))}</b><b>${e(format(get(m.side_b)))}</b></div>`).join('')+`<div class="breakrow"><span>Market chance (margin removed)</span><b>${pct(m.fair_market.side_a_probability)}</b><b>${pct(m.fair_market.side_b_probability)}</b></div><p class="copy">${kind==='spread'?`${e(raw.home_team)} spread ${e(s.market.home_spread)}`:`Total ${e(s.market.total)}`} · ${e(s.book)}. pp means percentage points.</p>`:'<p class="copy">This market is unavailable.</p>');
    }
    let context=document.getElementById('ctdMarketContext');if(!context){context=document.createElement('div');context.id='ctdMarketContext';context.className='panel';document.querySelector('.lowgrid').appendChild(context);}
    const books=new Map();for(const x of latest(raw))if(!books.has(x.book))books.set(x.book,x);
    context.innerHTML='<h3>SPORTSBOOK COMPARISON</h3><p class="copy">Latest stored line per sportsbook; this is not public betting or smart-money data.</p>'+[...books.values()].map(x=>`<div class="breakrow"><span>${e(x.book)}</span><b>${e(raw.home_team)} ${e(x.market.home_spread)}</b><b>Total ${e(x.market.total)}</b></div>`).join('')+'<p class="copy">Bet counts, money percentages and identified sharp action are not supplied by the connected feed.</p>';
  }
  function syncTicker(){
    if(!feed||Number(feed.week)!==Number(BET_FEED.week))return;
    for(const g of BET_FEED.games){
      const raw=Object.values(feed.games||{}).find(x=>x.away_team===g.away_team&&x.home_team===g.home_team),s=raw&&selected(raw);if(!s)continue;
      const picks=Object.values(s.markets).map(x=>x.recommendation).filter(x=>x?.decision==='PICK').sort((a,b)=>b.probability_edge-a.probability_edge);
      g.spread=raw.home_team+' '+(s.market.home_spread>0?'+':'')+s.market.home_spread;g.total=s.market.total;
      g.model_edge=Date.parse(raw.kickoff)<=Date.now()?'Archived':picks.length?pp(picks[0].probability_edge):'No qualifying bet';
    }
    renderTicker();
  }
  document.addEventListener('ctd:games-ready',syncTicker);
  const original=renderSelectedGame;renderSelectedGame=function(){original();detail();};
  document.querySelector('.tabs').addEventListener('click',detail);
  document.addEventListener('ctd:games-ready',detail);
  const lane=document.getElementById('ctdGameTicker');
  const controls=document.createElement('div');controls.style.cssText='display:flex;gap:8px;margin:8px 0';
  for(const [label,direction] of [['Previous games',-1],['Next games',1]]){const b=document.createElement('button');b.className='btn';b.textContent=label;b.onclick=()=>lane.scrollBy({left:direction*lane.clientWidth*.75,behavior:'smooth'});controls.appendChild(b);}
  lane.before(controls);lane.style.cssText+=';overflow-x:auto;max-width:100%;min-width:0;scrollbar-width:auto';
  const css=document.createElement('style');css.textContent='#gamesPage{min-width:0;max-width:100%}#gamesPage .ticker{display:flex}#gamesPage .gamecard{flex:0 0 190px}#gamesPage .grid3,#gamesPage .lowgrid,#gamesPage .midgrid{min-width:0}#gamesPage .panel{min-width:0;overflow-wrap:anywhere}@media(max-width:1100px){#gamesPage .grid3,#gamesPage .lowgrid,#gamesPage .midgrid{grid-template-columns:1fr}}';document.head.appendChild(css);
  async function load(){try{const r=await fetch(RAW+'data/market/weekly-game-market-recommendations-2026.json?ts='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error(r.status);feed=await r.json();syncTicker();detail();}catch(err){console.error('Detailed game feed unavailable',err);}}
  load();setInterval(load,60000);
})();
