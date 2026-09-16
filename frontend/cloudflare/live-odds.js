;(()=>{
  const codes=['ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC','LV','LAC','LAR','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SF','SEA','TB','TEN','WSH'];
  const names=['Arizona Cardinals','Atlanta Falcons','Baltimore Ravens','Buffalo Bills','Carolina Panthers','Chicago Bears','Cincinnati Bengals','Cleveland Browns','Dallas Cowboys','Denver Broncos','Detroit Lions','Green Bay Packers','Houston Texans','Indianapolis Colts','Jacksonville Jaguars','Kansas City Chiefs','Las Vegas Raiders','Los Angeles Chargers','Los Angeles Rams','Miami Dolphins','Minnesota Vikings','New England Patriots','New Orleans Saints','New York Giants','New York Jets','Philadelphia Eagles','Pittsburgh Steelers','San Francisco 49ers','Seattle Seahawks','Tampa Bay Buccaneers','Tennessee Titans','Washington Commanders'];
  const code=n=>codes[names.indexOf(n)]||({LA:'LAR',WAS:'WSH'}[n]||n);
  const esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const signed=n=>Number.isFinite(n)?(n>0?'+':'')+n:'—';
  let feed=null,busy=false,sequence=0;
  function render(){
    const host=document.querySelector('#gamesPage .lowgrid');if(!host)return;
    let panel=document.getElementById('ctdLiveOdds');if(!panel){panel=document.createElement('section');panel.id='ctdLiveOdds';panel.className='panel';host.before(panel)}
    const g=BET_FEED.games?.[selectedGameIndex];
    const match=g&&feed?.games?.find(x=>code(x.home_team)===code(g.home_team)&&code(x.away_team)===code(g.away_team)&&Math.abs(Date.parse(x.start_at)-Date.parse(g.event_start||g.kickoff))<21600000);
    panel.innerHTML='<h3>LIVE SPORTSBOOK LINES</h3>';
    if(!match){panel.innerHTML+='<p class="copy">'+esc(feed?.status==='unavailable'?feed.message:g?.completed?'This game is complete. Pregame lines remain in betting history.':'No live lines are currently available for this matchup.')+'</p>';return}
    panel.innerHTML+=`<p class="copy">${feed.status==='stale'?'Last retrieved lines · provider delayed':'Updated automatically'} · ${esc(new Date(feed.fetched_at).toLocaleString())} · Checks every 5 minutes.</p>`;
    for(const b of match.bookmakers){
      const market=k=>b.markets.find(m=>m.key===k);const side=(k,n)=>market(k)?.outcomes.find(o=>o.name===n);
      const h=side('spreads',match.home_team),a=side('spreads',match.away_team),over=side('totals','Over'),under=side('totals','Under');
      panel.innerHTML+=`<details><summary>${esc(b.title)} · ${esc(g.home_team)} ${signed(h?.point)} · Total ${esc(over?.point)}</summary><p class="copy">Spread: ${esc(g.away_team)} ${signed(a?.point)} (${signed(a?.price)}) / ${esc(g.home_team)} ${signed(h?.point)} (${signed(h?.price)})<br>Total: Over ${esc(over?.point)} (${signed(over?.price)}) / Under ${esc(under?.point)} (${signed(under?.price)})<br>Moneyline: ${esc(g.away_team)} ${signed(side('h2h',match.away_team)?.price)} / ${esc(g.home_team)} ${signed(side('h2h',match.home_team)?.price)}<br>Book updated: ${esc(b.last_update?new Date(b.last_update).toLocaleString():'Unavailable')}</p></details>`;
    }
    panel.innerHTML+='<p class="copy">Model picks above retain their original evaluated lines. A new sportsbook price does not automatically create a new model edge.</p>';
  }
  async function refresh(){if(busy||document.hidden)return;busy=true;try{const r=await fetch('/api/live/odds');feed=await r.json()}catch{feed={status:'unavailable',message:'Live odds are temporarily unavailable.'}}finally{busy=false;render()}}
  async function schedule(){
    const seq=++sequence,week=Number(BET_FEED.week);if(!week)return;
    try{const r=await fetch('/api/live/scoreboard?week='+week);if(!r.ok)return;const data=await r.json();if(seq!==sequence||Number(BET_FEED.week)!==week)return;
      for(const s of data.games||[]){if(BET_FEED.games.some(g=>code(g.home_team)===code(s.home.team)&&code(g.away_team)===code(s.away.team)))continue;
        BET_FEED.games.push({event_id:s.event_id,away_team:code(s.away.team),home_team:code(s.home.team),event_start:s.start_at,status:s.status,completed:s.state==='post',away_score:s.state==='pre'?null:s.away.score,home_score:s.state==='pre'?null:s.home.score,venue:s.venue,model_pick:'PENDING',total_pick:'PENDING',model_spread_pick:'PENDING',moneyline_pick:'PENDING',model_summary:'Model analysis has not been published for this matchup. Available sportsbook prices appear below.'});
      }renderTicker();renderSelectedGame();
    }catch{}
  }
  const original=renderSelectedGame;renderSelectedGame=function(){original();render()};
  document.addEventListener('ctd:games-ready',()=>{schedule();render()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
  schedule();refresh();setInterval(refresh,300000);
})();

;(()=>{
  const originalTicker=renderTicker;
  renderTicker=function(){
    originalTicker();
    document.querySelectorAll('#ctdGameTicker [data-game-index]').forEach(card=>{
      const g=BET_FEED.games[Number(card.dataset.gameIndex)],row=card.querySelector('.marketline');
      if(!g||!row)return;
      row.replaceChildren();
      const market=document.createElement('span');
      market.textContent='Stored market: '+(g.spread||'Spread pending')+' · Total '+(g.total??'pending');
      market.title='Sportsbook spread quoted for the home team: minus means favored; plus means underdog. Updated prices are in Live Sportsbook Lines.';
      const pick=document.createElement('span');pick.className='edge';
      const value=typeof g.model_edge==='string'&&/[A-Za-z]/.test(g.model_edge)?g.model_edge:g.model_pick;
      pick.textContent='Model pick: '+(!value||value==='PENDING'?'Pending analysis':value==='PASS'?'Pass — no qualifying pick':value);
      row.append(market,pick);
    });
  };
  const style=document.createElement('style');
  style.textContent='#gamesPage .gamecard{flex-basis:260px!important}#ctdGameTicker .marketline{display:flex;flex-direction:column;align-items:flex-start;gap:8px;white-space:normal;text-align:left}#ctdGameTicker .marketline .edge{line-height:1.4}';
  document.head.append(style);
  renderTicker();
})();
