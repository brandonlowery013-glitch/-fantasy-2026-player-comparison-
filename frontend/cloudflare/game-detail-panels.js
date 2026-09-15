(()=>{
  'use strict';
  const RAW='https://raw.githubusercontent.com/brandonlowery013-glitch/-fantasy-2026-player-comparison-/frontend/ctd-cloudflare-work/';
  const norm=t=>({LA:'LAR',WAS:'WSH'}[String(t||'').toUpperCase()]||String(t||'').toUpperCase());
  const key=g=>`${BET_FEED.season||2026}:W${BET_FEED.week}:${norm(g?.away_team)}@${norm(g?.home_team)}`;
  const esc=x=>String(x??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct=x=>typeof x==='number'&&Number.isFinite(x)?`${(x*100).toFixed(1)}%`:'—';
  const num=x=>typeof x==='number'&&Number.isFinite(x)?x.toFixed(1):'—';
  const date=x=>Number.isFinite(Date.parse(x))?new Date(x).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}):'Date unavailable';
  const selected=()=>BET_FEED.games?.[selectedGameIndex];
  const row=(label,value)=>`<div class="ctdDetailRow"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
  const empty=text=>`<p class="ctdDetailNote">${esc(text)}</p>`;
  const same=(a,g)=>norm(a?.away_team)===norm(g?.away_team)&&norm(a?.home_team)===norm(g?.home_team);
  let markets=null,history=null,scoreboard=null,feedError='',lastKey='',busy=false;
  const games=new Map();
  const style=document.createElement('style');
  style.textContent=`.ctdDetailNote{font-size:12px!important;line-height:1.6!important;color:#a8bdd3;margin:10px 0}.ctdDetailRow{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid #1d314b;font-size:12px;line-height:1.4}.ctdDetailRow b{text-align:right}.ctdDetailPlayer{padding:9px 0;border-bottom:1px solid #1d314b}.ctdDetailPlayer strong{display:block;font-size:14px}.ctdDetailPlayer span{font-size:12px;color:#a8bdd3;line-height:1.5}.ctdDetailColumns{display:grid;grid-template-columns:1fr 1fr;gap:16px}.ctdDetailTableWrap{overflow:auto;max-height:360px}.ctdDetailTable{width:100%;border-collapse:collapse;font-size:12px}.ctdDetailTable th,.ctdDetailTable td{text-align:left;padding:9px;border-bottom:1px solid #263e58;white-space:nowrap}.ctdDetailTable th{color:#a8bdd3}.ctdDetailList{padding-left:18px;font-size:12px;line-height:1.7}.ctdDetailList li{margin:6px 0}.ctdFlowChart{width:100%;height:auto;display:block}.ctdFlowRange{width:100%;accent-color:#72b8ff}.ctdDetailPanel h4{font-size:12px;margin:12px 0 6px;color:#b2cce7}.ctdDetailPanel details summary{font-size:12px;cursor:pointer;padding:10px 0;color:#a9d1ff}.ctdDetailPanel details{margin:6px 0}.ctdPickContext{font-size:11px;line-height:1.5;color:#a8bdd3;max-width:600px;margin-top:6px}#ctdGameTabContent{margin:12px 0;padding:16px;border:1px solid #263e58;border-radius:8px;background:#091524}#ctdGameTabContent[hidden]{display:none}#ctdGameTabContent h3{font-size:14px}.ctdDetailPanel .chart{height:auto}.ctdDetailPanel .kicker{font-size:10px}@media(max-width:600px){.ctdDetailColumns{grid-template-columns:1fr}.ctdDetailTable{font-size:11px}.ctdDetailTable th,.ctdDetailTable td{padding:8px 6px}}`;
  document.head.appendChild(style);

  async function get(url){const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`Request failed (${r.status})`);return r.json()}
  function marketGame(g){return Number(markets?.week)===Number(BET_FEED.week)?Object.values(markets.games||{}).find(x=>same(x,g)):null}
  function pregame(raw){return (raw?.snapshot_evaluations||[]).filter(s=>s.eligible_for_current_recommendation===true&&Date.parse(s.captured_at)<=Date.parse(raw.kickoff)).sort((a,b)=>Date.parse(b.captured_at)-Date.parse(a.captured_at))}
  function snapshot(raw){const rows=pregame(raw);return rows.find(x=>x.book==='draftkings')||rows[0]}
  function modelPicks(g){
    const raw=marketGame(g),s=snapshot(raw);if(!s){const note=document.getElementById('ctdPickContext');if(note)note.textContent='No matching pregame snapshot has been published for this week and matchup.';for(const id of ['spreadPick','totalPick','mlPick']){const el=document.getElementById(id);if(el){el.textContent='Not published';el.title='Waiting for a matching pregame model snapshot';}}return;}
    for(const [kind,id,field] of [['spread','spreadPick','model_spread_pick'],['total','totalPick','total_pick'],['moneyline','mlPick','moneyline_pick']]){
      const r=s.markets?.[kind]?.recommendation,el=document.getElementById(id);if(!el)continue;
      const value=r?.decision==='PICK'?r.selection:r?.decision==='PASS'?'PASS':'Not published';
      el.textContent=value;g[field]=value;
      el.title=r?.decision==='PASS'?(r.reason||'No side clears the model thresholds'):r?.decision==='PICK'?`Stored pregame model pick · ${date(s.captured_at)}`:'No stored decision';
      const badge=el.parentElement.lastElementChild;if(badge!==el)badge.textContent=r?.decision==='PICK'&&typeof r.probability_edge==='number'?`${(r.probability_edge*100).toFixed(1)} percentage points`:'';
    }
    const edge=document.getElementById('mlEdge');if(edge)edge.textContent=s.markets?.moneyline?.recommendation?.decision==='PICK'?pct(s.markets.moneyline.recommendation.probability_edge):'—';
    let note=document.getElementById('ctdPickContext');if(!note){note=document.createElement('p');note.id='ctdPickContext';note.className='ctdPickContext';document.getElementById('spreadPick')?.closest('.panel')?.appendChild(note)}
    note.textContent=`Pregame model picks · ${s.book} · ${date(s.captured_at)}. ${Date.parse(raw.kickoff)<=Date.now()?'Archived for reference; these are not live recommendations. ':''}PASS means neither side met the model’s pick thresholds.`;
  }
  function playerRows(d,team,categories){return (d?.player_stats||[]).filter(p=>norm(p.team)===norm(team)&&categories.includes(p.category))}
  function leaders(d,team,defense=false){
    if(defense)return playerRows(d,team,['defensive']).sort((a,b)=>(Number(b.stats?.TOT)||0)-(Number(a.stats?.TOT)||0)).slice(0,3);
    return ['passing','rushing','receiving'].flatMap(category=>playerRows(d,team,[category]).sort((a,b)=>(Number(b.stats?.YDS)||0)-(Number(a.stats?.YDS)||0)).slice(0,1));
  }
  function playerList(rows){return rows.length?rows.map(p=>`<div class="ctdDetailPlayer"><strong>${esc(p.player)}</strong><span>${esc(p.team)} · ${esc(p.category)} · ${esc(Object.entries(p.stats||{}).slice(0,6).map(([k,v])=>`${k}: ${v}`).join(' · '))}</span></div>`).join(''):empty('No individual statistics have been reported for this game yet.')}
  function pivotal(g,d){
    const a=document.getElementById('awayPlayers'),h=document.getElementById('homePlayers');
    if(a){a.innerHTML=playerList(leaders(d,g.away_team));if(a.previousElementSibling)a.previousElementSibling.textContent=`${g.away_team} OFFENSE · GAME LEADERS`}
    if(h){h.innerHTML=playerList(leaders(d,g.home_team,true));if(h.previousElementSibling)h.previousElementSibling.textContent=`${g.home_team} DEFENSE · TACKLE LEADERS`}
    const panel=a?.closest('.panel');if(panel){panel.classList.add('ctdDetailPanel');let note=panel.querySelector('[data-player-source]');if(!note){note=document.createElement('p');note.dataset.playerSource='';note.className='ctdDetailNote';panel.appendChild(note)}note.textContent='ESPN game statistics. Offense and Defense tabs include both teams. These leaders are based on recorded production, not pregame player rankings.'}
  }
  function matchup(g,d){
    const away=d?.team_stats?.find(t=>norm(t.team)===norm(g.away_team))?.stats||{};
    const home=d?.team_stats?.find(t=>norm(t.team)===norm(g.home_team))?.stats||{};
    const lead=leaders(d,g.away_team).find(p=>p.category==='receiving');
    const defense=leaders(d,g.home_team,true)[0];
    return `<h3>KEY MATCHUP</h3><p class="ctdDetailNote"><b>${esc(g.away_team)} passing attack vs ${esc(g.home_team)} defense</b></p>${lead?row('Leading receiver',lead.player)+row('Receiving yards',lead.stats?.YDS)+row('Receptions / targets',`${lead.stats?.REC??'—'} / ${lead.stats?.TGTS??'—'}`):empty('Receiver statistics will appear when reported.')}${defense?row('Leading tackler',defense.player)+row('Total tackles',defense.stats?.TOT):''}${row(`${g.away_team} net passing yards`,away.netPassingYards)}${row(`${g.away_team} third downs`,away.thirdDownEff)}${row(`${g.home_team} offense · yards/play`,home.yardsPerPlay)}<p class="ctdDetailNote">Observed game matchup. Individual coverage assignments, yards per route, and PFF grades are not supplied by this feed.</p>`;
  }
  function flow(g,d){
    const points=(d?.win_probability||[]).filter(p=>typeof p.home_win_probability==='number');
    const plays=d?.scoring_plays||[];
    let chart='';
    if(points.length>1){
      const coords=points.map((p,i)=>`${(24+i/(points.length-1)*432).toFixed(1)},${(132-p.home_win_probability*108).toFixed(1)}`).join(' ');
      chart=`<p class="ctdDetailNote">ESPN win probability · ${esc(g.home_team)} · ${points.length} recorded plays</p><svg class="ctdFlowChart" viewBox="0 0 480 164" role="img" aria-label="${esc(g.home_team)} win probability over recorded plays"><path d="M24 24H456M24 78H456M24 132H456" stroke="#263e58" fill="none"/><text x="24" y="16" fill="#a8bdd3" font-size="10">100%</text><text x="24" y="74" fill="#a8bdd3" font-size="10">50%</text><text x="24" y="146" fill="#a8bdd3" font-size="10">0% · Start</text><text x="408" y="146" fill="#a8bdd3" font-size="10">Latest play</text><polyline points="${coords}" fill="none" stroke="#72b8ff" stroke-width="2.5"/></svg><label class="ctdDetailNote" for="ctdFlowRange">Inspect a recorded play</label><input class="ctdFlowRange" id="ctdFlowRange" type="range" min="0" max="${points.length-1}" value="${points.length-1}"><p id="ctdFlowReadout" class="ctdDetailNote">${esc(flowLabel(g,points.at(-1)))}</p>`;
    }else chart=empty(d?'The provider has not supplied a win-probability series for this game.':'Loading recorded game flow…');
    return `<h3>GAME FLOW</h3>${chart}<details><summary>Scoring timeline · ${plays.length} plays</summary>${plays.length?`<ol class="ctdDetailList">${plays.map(p=>`<li><b>Q${esc(p.period)} ${esc(p.clock)} · ${esc(p.away_score)}–${esc(p.home_score)}</b><br>${esc(p.text)}</li>`).join('')}</ol>`:empty('No scoring plays reported.')}</details><p class="ctdDetailNote">In-game probabilities are ESPN estimates, separate from CTD’s stored pregame model.</p>`;
  }
  function flowLabel(g,p){return p?`${g.home_team} win probability ${pct(p.home_win_probability)} · ${p.period?`Q${p.period} ${p.clock||''}`:'Before first recorded play'}${p.away_score!=null&&p.home_score!=null?` · ${g.away_team} ${p.away_score}–${p.home_score} ${g.home_team}`:''}${p.text?` · ${p.text}`:''}`:'No play selected'}
  function historyHtml(g){
    const h=Number(history?.week)===Number(BET_FEED.week)?Object.values(history.games||{}).find(x=>same(x,g)):null;
    const bits=h?.tidbits||[];const raw=marketGame(g),s=snapshot(raw);
    const rows=pregame(raw).filter(x=>x.book===s?.book);
    return `<h3>BETTING HISTORY &amp; MODEL RECORD</h3><p class="ctdDetailNote">Published historical context · ${esc(date(history?.generated_at))}</p>${bits.length?`<ul class="ctdDetailList">${bits.map(t=>`<li>${esc(t.text)} <small>(${esc(t.sample_size)} games)</small></li>`).join('')}</ul>`:empty('No published matchup history is available for this pairing.')}<p class="ctdDetailNote">Source: ${esc([...new Set(bits.map(t=>t.source))].join('; ')||'No historical source published')}. Trends are historical samples, not the current game result.</p><details open><summary>Stored pregame picks and lines · ${esc(s?.book||'No sportsbook snapshot')}</summary>${rows.length?`<div class="ctdDetailTableWrap"><table class="ctdDetailTable"><thead><tr><th>Recorded</th><th>Spread pick</th><th>Total pick</th><th>Moneyline pick</th><th>Home line</th><th>Total line</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(date(x.captured_at))}</td>${['spread','total','moneyline'].map(k=>`<td>${esc(x.markets?.[k]?.recommendation?.selection||x.markets?.[k]?.recommendation?.decision||'Not published')}</td>`).join('')}<td>${esc(g.home_team)} ${esc(x.market?.home_spread)}</td><td>${esc(x.market?.total)}</td></tr>`).join('')}</tbody></table></div>`:empty('No eligible pregame model snapshots have been published.')}</details><p class="ctdDetailNote">Closing-line value requires a verified closing line and a recorded entry price; it is not inferred from these snapshots.</p>`;
  }
  function offenseDefense(g,d,defense){return `<h3>${defense?'DEFENSE':'OFFENSE'} · BOTH TEAMS</h3><div class="ctdDetailColumns">${[g.away_team,g.home_team].map(t=>`<section><h4>${esc(t)}</h4>${playerList(defense?playerRows(d,t,['defensive']).sort((a,b)=>(Number(b.stats?.TOT)||0)-(Number(a.stats?.TOT)||0)):playerRows(d,t,['passing','rushing','receiving']))}</section>`).join('')}</div>`}
  function tabs(g,d){
    let mount=document.getElementById('ctdGameTabContent');if(!mount){mount=document.createElement('section');mount.id='ctdGameTabContent';mount.className='ctdDetailPanel';document.querySelector('#gamesPage .tabs')?.after(mount)}
    mount.hidden=activeGameTab==='OVERVIEW';if(mount.hidden)return;
    if(activeGameTab==='OFFENSE'||activeGameTab==='DEFENSE')mount.innerHTML=offenseDefense(g,d,activeGameTab==='DEFENSE');
    else if(activeGameTab==='MATCHUP')mount.innerHTML=matchup(g,d);
    else if(activeGameTab==='BETTING HISTORY'||activeGameTab==='TRENDS')mount.innerHTML=historyHtml(g);
    else if(activeGameTab==='INJURIES')mount.innerHTML=`<h3>REPORTED INJURIES</h3>${d?.injuries?.length?d.injuries.map(x=>row(`${x.player} · ${x.team}`,`${x.status} · ${x.detail||''}`)).join(''):empty('No injury report was included in this game feed. This does not confirm that every player is healthy or active.')}`;
  }
  function render(){
    const g=selected();if(!g)return;const record=games.get(key(g)),d=record?.data;
    modelPicks(g);pivotal(g,d);
    const match=document.querySelector('#gamesPage .midgrid .panel:nth-child(2)'),chart=document.querySelector('#gamesPage .midgrid .panel:nth-child(3)'),hist=document.querySelector('#gamesPage .panel.history');
    for(const [el,html] of [[match,matchup(g,d)],[chart,flow(g,d)],[hist,historyHtml(g)]])if(el){el.classList.add('ctdDetailPanel');el.innerHTML=html}
    if(chart&&record){const note=document.createElement('p');note.className='ctdDetailNote';note.textContent=`${record.error?'Last available data · ':''}${record.updated?`Updated ${date(record.updated)} · `:''}${record.error||record.health||''}`;chart.appendChild(note)}
    tabs(g,d);
  }
  async function refresh(){
    const g=selected();if(!g||busy)return;const k=key(g),previous=games.get(k);if(previous&&Date.now()-previous.fetched<15000){render();return}
    busy=true;
    try{
      if(!scoreboard||scoreboard.week!==Number(BET_FEED.week)||Date.now()-scoreboard.fetched>60000){const week=Number(BET_FEED.week);const s=await get(`/api/live/scoreboard?week=${week}`);scoreboard={data:s.games||[],week,fetched:Date.now()}}
      const event=scoreboard.data.find(x=>norm(x.away?.team)===norm(g.away_team)&&norm(x.home?.team)===norm(g.home_team));
      if(!event)throw Error('This matchup is not in the current live scoreboard.');
      const result=await get(`/api/live/game?event=${encodeURIComponent(event.event_id)}`);
      if(!result.game||norm(result.game.away?.team)!==norm(g.away_team)||norm(result.game.home?.team)!==norm(g.home_team))throw Error('Game detail did not match the selected teams.');
      games.set(k,{data:result.game,updated:result.generated_at,health:result.health?.status,fetched:Date.now()});
    }catch(e){games.set(k,{...previous,error:e.message,fetched:Date.now()})}
    finally{busy=false;if(key(selected())===k)render();else void refresh()}
  }
  const original=renderSelectedGame;
  renderSelectedGame=function(){original();render();const k=key(selected());if(k!==lastKey){lastKey=k;void refresh()}};
  document.querySelector('#gamesPage .tabs')?.addEventListener('click',()=>{render();void refresh()});
  document.addEventListener('ctd:games-ready',()=>{render();void refresh()});
  document.addEventListener('ctd:live-scores-updated',()=>{render();void refresh()});
  document.addEventListener('input',e=>{if(e.target.id!=='ctdFlowRange')return;const g=selected(),p=games.get(key(g))?.data?.win_probability?.[Number(e.target.value)];const label=document.getElementById('ctdFlowReadout');if(label)label.textContent=flowLabel(g,p)});
  async function loadFeeds(){
    const results=await Promise.allSettled([get(RAW+'data/market/weekly-game-market-recommendations-2026.json'),get(RAW+'data/probability/generated/matchup-tidbits-2026.json')]);
    if(results[0].status==='fulfilled')markets=results[0].value;
    if(results[1].status==='fulfilled')history=results[1].value;
    feedError=results.filter(x=>x.status==='rejected').map(x=>x.reason?.message||'Published data unavailable').join('; ');
    if(feedError)console.warn('Game reference feeds:',feedError);
    render();
  }
  void loadFeeds();void refresh();
  setInterval(()=>{if(!document.hidden)void refresh()},20000);
  setInterval(()=>{if(!document.hidden)void loadFeeds()},60000);
})();
