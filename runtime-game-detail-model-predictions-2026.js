(()=>{
  const RAW='https://raw.githubusercontent.com/brandonlowery013-glitch/-fantasy-2026-player-comparison-/main/';
  let projections=null,markets=null,lastKey=null;
  const esc=v=>String(v??'—').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const n=v=>Number.isFinite(Number(v))?Number(v):null;
  const pct=v=>n(v)==null?'—':`${(Number(v)*100).toFixed(1)}%`;
  const priceProb=p=>{p=n(p);if(p==null||p===0)return null;return p>0?100/(p+100):(-p)/((-p)+100)};
  const schedule=()=>{try{return Array.isArray(SCHEDULE?.games)?SCHEDULE.games:[]}catch{return[]}};
  const key=(g,i=0)=>String(g?.event_id||g?.game_id||g?.id||`${g?.away_team||g?.away||'away'}-${g?.home_team||g?.home||'home'}-${g?.event_start||g?.start_time||i}`);
  const teams=g=>({away:g?.away_team||g?.away||g?.awayTeam,home:g?.home_team||g?.home||g?.homeTeam});
  const findSchedule=k=>schedule().find((g,i)=>key(g,i)===String(k));
  const findProjection=g=>{if(!g||!projections?.games)return null;const t=teams(g);return Object.values(projections.games).find(x=>x?.away_team===t.away&&x?.home_team===t.home)||null};
  const latestMarket=g=>{if(!g||!markets?.games)return null;const t=teams(g);const mg=Object.values(markets.games).find(x=>x?.away_team===t.away&&x?.home_team===t.home);if(!mg?.snapshots?.length)return null;return [...mg.snapshots].sort((a,b)=>String(b.captured_at||'').localeCompare(String(a.captured_at||'')))[0]};
  const strength=(edge,kind)=>{edge=Math.abs(Number(edge)||0);const cut=kind==='prob'?[.05,.025]:kind==='total'?[4,2]:[3,1.5];return edge>=cut[0]?'BET':edge>=cut[1]?'LEAN':'WEAK LEAN'};
  const first=(o,keys)=>{for(const k of keys)if(o?.[k]!=null&&o[k]!=='')return o[k];return null};
  const list=v=>Array.isArray(v)?v:(v&&typeof v==='object'?Object.values(v):[]);
  const fmtStat=(name,val)=>val==null?'':`<div class="ctdBoxRow"><span>${esc(name)}</span><b>${esc(val)}</b></div>`;
  const score=(g,side)=>first(g,side==='away'?['away_score','awayScore','visitor_score']:['home_score','homeScore']);
  const status=g=>first(g,['status','game_status','state'])||'Scheduled';
  function reads(g,p,m){
    const t=teams(g),model=p?.model||{};
    const margin=n(model.home_minus_away_margin),total=n(model.model_total),hp=n(model.home_win_probability),ap=n(model.away_win_probability);
    const hs=n(m?.home_spread),mt=n(m?.total),hml=n(m?.home_moneyline),aml=n(m?.away_moneyline);
    const spreadEdge=margin!=null&&hs!=null?margin+hs:null;
    const spreadSide=spreadEdge==null?'Waiting for current spread':spreadEdge>=0?`${t.home} ${hs>0?'+':''}${hs}`:`${t.away} ${(-hs)>0?'+':''}${-hs}`;
    const totalEdge=total!=null&&mt!=null?total-mt:null;
    const totalSide=totalEdge==null?'Waiting for current total':`${totalEdge>=0?'OVER':'UNDER'} ${mt}`;
    const hip=priceProb(hml),aip=priceProb(aml),he=hp!=null&&hip!=null?hp-hip:null,ae=ap!=null&&aip!=null?ap-aip:null;
    const mlHome=(he??-999)>=(ae??-999),mlEdge=mlHome?he:ae,mlSide=mlEdge==null?'Waiting for current moneyline':`${mlHome?t.home:t.away} ML ${mlHome?hml:aml}`;
    const candidates=[
      {name:'Spread',side:spreadSide,edge:spreadEdge,str:spreadEdge==null?'WAITING':strength(spreadEdge,'spread'),rank:spreadEdge==null?-1:Math.abs(spreadEdge)/3},
      {name:'O/U',side:totalSide,edge:totalEdge,str:totalEdge==null?'WAITING':strength(totalEdge,'total'),rank:totalEdge==null?-1:Math.abs(totalEdge)/4},
      {name:'Moneyline',side:mlSide,edge:mlEdge,str:mlEdge==null?'WAITING':strength(mlEdge,'prob'),rank:mlEdge==null?-1:Math.abs(mlEdge)/.05}
    ];
    return {t,model,margin,total,hp,ap,candidates,best:[...candidates].filter(x=>x.rank>=0).sort((a,b)=>b.rank-a.rank)[0]||null};
  }
  function style(){if(document.getElementById('ctd-game-prediction-style'))return;const s=document.createElement('style');s.id='ctd-game-prediction-style';s.textContent=`
    .ctdGameCenter{margin-top:12px}.ctdGcTop{display:grid;grid-template-columns:1.35fr 1fr 1fr;gap:9px}.ctdGcCard,.ctdPredictionBlock{border:1px solid #17385f;background:#07101d;border-radius:12px;padding:13px}.ctdGcCard h3,.ctdPredictionBlock h3{margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#9ec9ed}.ctdScoreHero{display:flex;align-items:center;justify-content:space-between;gap:12px}.ctdScoreTeams{font-size:15px;font-weight:900;line-height:1.7}.ctdScoreValue{font-size:26px;font-weight:950}.ctdScoreMeta{font-size:10px;color:#8da4bf;margin-top:6px}.ctdBoxRow{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-top:1px solid #14304f;font-size:11px}.ctdBoxRow:first-of-type{border-top:0}.ctdBoxRow span{color:#8da4bf}.ctdGcTabs{display:flex;gap:6px;overflow-x:auto;margin:10px 0 8px;padding-bottom:2px}.ctdGcTabs button{white-space:nowrap;border:0;border-bottom:2px solid transparent;background:transparent;color:#7f96ad;padding:9px 11px;font-size:10px;font-weight:900;text-transform:uppercase;cursor:pointer}.ctdGcTabs button.active{color:#5bd7ff;border-bottom-color:#18a8ff}.ctdGcPanel{display:none}.ctdGcPanel.active{display:block}.ctdGcGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.ctdGcGrid.two{grid-template-columns:repeat(2,minmax(0,1fr))}.ctdPlayerRows{display:grid;gap:6px}.ctdPlayerRow{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-top:1px solid #14304f;font-size:11px}.ctdPlayerRow:first-child{border-top:0}.ctdPlayerRow span{color:#8da4bf}.ctdPredictionBlock{margin-top:10px}.ctdPredictionSub{font-size:10px;color:#8da4bf;margin-bottom:10px}.ctdPredictionGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.ctdPredMetric,.ctdPredPick{border:1px solid #17385f;border-radius:9px;padding:10px;background:#091321}.ctdPredMetric span,.ctdPredPick span{display:block;font-size:9px;color:#8da4bf;text-transform:uppercase;letter-spacing:.08em}.ctdPredMetric b,.ctdPredPick b{display:block;margin-top:4px;font-size:13px}.ctdPredPicks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:8px}.ctdPredPick em{display:block;margin-top:4px;font-style:normal;font-size:10px;color:#8ccfff}.ctdBestBet{margin-top:8px;padding:10px;border:1px solid #1c5f91;border-radius:9px;color:#dff4ff}.ctdBestBet b{color:#5bd7ff}.ctdWaiting{font-size:11px;color:#6f89a7;line-height:1.5}
    @media(max-width:820px){.ctdGcTop,.ctdGcGrid,.ctdGcGrid.two,.ctdPredictionGrid,.ctdPredPicks{grid-template-columns:1fr}.ctdScoreValue{font-size:22px}}
  `;document.head.appendChild(s)};
  function teamStats(g){
    const raw=first(g,['team_stats','teamStats','stats','game_stats'])||{};
    const away=raw.away||raw.visitor||raw[teams(g).away]||{},home=raw.home||raw[teams(g).home]||{};
    const metrics=[['Total yards',['total_yards','yards','totalYards']],['Passing',['passing_yards','pass_yards','passingYards']],['Rushing',['rushing_yards','rush_yards','rushingYards']],['First downs',['first_downs','firstDowns']],['Turnovers',['turnovers']],['Possession',['time_of_possession','possession','timeOfPossession']]];
    return metrics.map(([label,keys])=>{const a=first(away,keys),h=first(home,keys);return a==null&&h==null?'':`<div class="ctdBoxRow"><span>${esc(label)}</span><b>${esc(a??'—')} · ${esc(h??'—')}</b></div>`}).join('');
  }
  function playerRows(g,type){
    const candidates=type==='offense'?['offensive_player_stats','offense_stats','player_stats','leaders']:['defensive_player_stats','defense_stats','defensive_leaders'];
    const raw=first(g,candidates);const rows=list(raw).slice(0,12);
    if(!rows.length)return '<div class="ctdWaiting">Live player statistics will populate here when the game-state feed supplies them.</div>';
    return `<div class="ctdPlayerRows">${rows.map(x=>{const name=x?.name||x?.player||x?.athlete||'Player';const detail=x?.summary||x?.stat_line||x?.stats||x?.value||'';return `<div class="ctdPlayerRow"><b>${esc(name)}</b><span>${esc(typeof detail==='object'?JSON.stringify(detail):detail)}</span></div>`}).join('')}</div>`;
  }
  function scoringRows(g){const rows=list(first(g,['scoring_summary','scoringSummary','scoring_plays','scores_by_quarter']));if(!rows.length)return '<div class="ctdWaiting">Scoring summary will populate from the live game feed.</div>';return `<div class="ctdPlayerRows">${rows.slice(0,16).map(x=>`<div class="ctdPlayerRow"><b>${esc(x?.quarter||x?.period||x?.team||'Score')}</b><span>${esc(x?.text||x?.description||x?.score||x)}</span></div>`).join('')}</div>`}
  function injuries(g){const rows=list(first(g,['injuries','game_injuries','injury_report']));if(!rows.length)return '<div class="ctdWaiting">No live game injury update is currently attached to this matchup.</div>';return `<div class="ctdPlayerRows">${rows.map(x=>`<div class="ctdPlayerRow"><b>${esc(x?.player||x?.name||'Player')}</b><span>${esc(x?.status||x?.detail||x?.description||'')}</span></div>`).join('')}</div>`}
  function render(k){
    lastKey=String(k||lastKey||'');if(!lastKey)return;const mount=document.getElementById('ctdGameDetailMount');if(!mount)return;const g=findSchedule(lastKey);if(!g)return;const p=findProjection(g),m=latestMarket(g);let old=document.getElementById('ctdNFLStyleGameCenter');if(old)old.remove();
    const t=teams(g),as=score(g,'away'),hs=score(g,'home'),st=status(g),clock=first(g,['clock','game_clock']),period=first(g,['quarter','period']),venue=first(g,['venue','stadium','location']);
    const r=p?reads(g,p,m):null;
    const awayScore=p?n(r.model.away_score_mean):null,homeScore=p?n(r.model.home_score_mean):null,winner=p?((r.hp??0)>=(r.ap??0)?r.t.home:r.t.away):null,winp=p?Math.max(r.hp??0,r.ap??0):null;
    const picks=p?r.candidates.map(x=>`<div class="ctdPredPick"><span>${esc(x.name)} recommendation</span><b>${esc(x.side)}</b><em>${esc(x.str)}${x.edge==null?'':` · model edge ${x.name==='Moneyline'?pct(Math.abs(x.edge)):Math.abs(x.edge).toFixed(1)}`}</em></div>`).join(''):'';
    const gameSummary=first(g,['summary','game_summary','matchup_summary','analysis'])||'Game summary will populate from the verified live-game feed as the matchup progresses.';
    const marketSummary=m?`${t.home} ${m.home_spread>0?'+':''}${m.home_spread} · O/U ${m.total} · ${t.home} ML ${m.home_moneyline} / ${t.away} ML ${m.away_moneyline}`:'Current sportsbook summary is waiting for the latest verified market snapshot.';
    const html=`<div id="ctdNFLStyleGameCenter" class="ctdGameCenter">
      <div class="ctdGcTop">
        <div class="ctdGcCard"><h3>Game Summary</h3><div class="ctdScoreHero"><div class="ctdScoreTeams"><div>${esc(t.away)}</div><div>${esc(t.home)}</div></div><div class="ctdScoreValue">${as==null||hs==null?'—':`${esc(as)}–${esc(hs)}`}</div></div><div class="ctdScoreMeta">${esc(st)}${period?` · ${esc(period)}`:''}${clock?` ${esc(clock)}`:''}${venue?` · ${esc(venue)}`:''}</div><p style="font-size:11px;line-height:1.5;color:#c9d7e5">${esc(gameSummary)}</p></div>
        <div class="ctdGcCard"><h3>Betting Summary</h3>${m?`${fmtStat('Spread',`${t.home} ${m.home_spread>0?'+':''}${m.home_spread}`)}${fmtStat('O/U',m.total)}${fmtStat(`${t.home} ML`,m.home_moneyline)}${fmtStat(`${t.away} ML`,m.away_moneyline)}`:`<div class="ctdWaiting">${esc(marketSummary)}</div>`}</div>
        <div class="ctdGcCard"><h3>Model Win Probability</h3>${p?`${fmtStat(t.away,pct(r.ap))}${fmtStat(t.home,pct(r.hp))}${fmtStat('Projected winner',winner)}`:'<div class="ctdWaiting">Model projection is waiting for this matchup.</div>'}</div>
      </div>
      <div class="ctdGcTabs" role="tablist"><button type="button" class="active" data-gc-tab="overview">Overview</button><button type="button" data-gc-tab="matchup">Matchup</button><button type="button" data-gc-tab="offense">Offense</button><button type="button" data-gc-tab="defense">Defense</button><button type="button" data-gc-tab="trends">Trends</button><button type="button" data-gc-tab="injuries">Injuries</button><button type="button" data-gc-tab="history">Betting History</button></div>
      <div class="ctdGcPanel active" data-gc-panel="overview"><div class="ctdGcGrid"><div class="ctdGcCard"><h3>Team Stats</h3>${teamStats(g)||'<div class="ctdWaiting">Live team statistics will populate here during the game.</div>'}</div><div class="ctdGcCard"><h3>Scoring Summary</h3>${scoringRows(g)}</div><div class="ctdGcCard"><h3>Game Flow</h3><div class="ctdWaiting">Win-probability/game-flow history will populate when the live-state feed supplies chronological game states.</div></div></div></div>
      <div class="ctdGcPanel" data-gc-panel="matchup"><div class="ctdGcGrid two"><div class="ctdGcCard"><h3>${esc(t.away)} Matchup</h3>${playerRows(g,'offense')}</div><div class="ctdGcCard"><h3>${esc(t.home)} Matchup</h3>${playerRows(g,'defense')}</div></div></div>
      <div class="ctdGcPanel" data-gc-panel="offense"><div class="ctdGcCard"><h3>Offensive Statistics</h3>${playerRows(g,'offense')}</div></div>
      <div class="ctdGcPanel" data-gc-panel="defense"><div class="ctdGcCard"><h3>Defensive Statistics</h3>${playerRows(g,'defense')}</div></div>
      <div class="ctdGcPanel" data-gc-panel="trends"><div class="ctdGcCard"><h3>Game Trends</h3><div class="ctdWaiting">Drive, efficiency, scoring and in-game trend data will populate from verified game-state inputs.</div></div></div>
      <div class="ctdGcPanel" data-gc-panel="injuries"><div class="ctdGcCard"><h3>Injuries</h3>${injuries(g)}</div></div>
      <div class="ctdGcPanel" data-gc-panel="history"><div class="ctdGcCard"><h3>Betting History</h3><div class="ctdWaiting">Opening/current/closing market history and settled ATS/O-U/ML results will live here without overwriting the frozen pregame prediction.</div></div></div>
      <div class="ctdPredictionBlock"><h3>Chuck The Duke Prediction</h3><div class="ctdPredictionSub">Frozen pregame model output. Betting direction is shown separately for spread, total and moneyline.</div>${p?`<div class="ctdPredictionGrid"><div class="ctdPredMetric"><span>Projected score</span><b>${esc(r.t.away)} ${awayScore?.toFixed(1)??'—'} · ${esc(r.t.home)} ${homeScore?.toFixed(1)??'—'}</b></div><div class="ctdPredMetric"><span>Projected winner</span><b>${esc(winner)} · ${pct(winp)}</b></div><div class="ctdPredMetric"><span>Model spread</span><b>${esc(r.t.home)} ${r.model.model_home_spread>0?'+':''}${n(r.model.model_home_spread)?.toFixed(1)??'—'}</b></div><div class="ctdPredMetric"><span>Model total</span><b>${r.total?.toFixed(1)??'—'}</b></div></div><div class="ctdPredPicks">${picks}</div><div class="ctdBestBet"><b>Strongest current game-market read:</b> ${esc(r.best?`${r.best.side} · ${r.best.str}`:'Waiting for current sportsbook lines')}</div>`:'<div class="ctdWaiting">Projection is waiting for this matchup.</div>'}</div>
    </div>`;
    mount.insertAdjacentHTML('beforeend',html);
    const root=document.getElementById('ctdNFLStyleGameCenter');root?.querySelectorAll('[data-gc-tab]').forEach(btn=>btn.addEventListener('click',()=>{root.querySelectorAll('[data-gc-tab]').forEach(x=>x.classList.toggle('active',x===btn));root.querySelectorAll('[data-gc-panel]').forEach(x=>x.classList.toggle('active',x.dataset.gcPanel===btn.dataset.gcTab))}));
  }
  async function load(){style();try{[projections,markets]=await Promise.all([fetch(`${RAW}data/probability/generated/weekly-game-projections-2026.json?ts=${Date.now()}`,{cache:'no-store'}).then(r=>r.json()),fetch(`${RAW}data/market/weekly-matchup-market-snapshots-2026.json?ts=${Date.now()}`,{cache:'no-store'}).then(r=>r.json())])}catch(e){console.error('CTD game prediction load failed',e)}
    document.addEventListener('click',e=>{const el=e.target.closest?.('[data-game-key],[data-game-id]');if(!el)return;const k=el.dataset.gameKey||el.dataset.gameId;setTimeout(()=>render(k),0)});
    const obs=new MutationObserver(()=>{const a=document.querySelector('.ctdTickerGame.active[data-game-key]');if(a&&a.dataset.gameKey!==lastKey)render(a.dataset.gameKey)});obs.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();