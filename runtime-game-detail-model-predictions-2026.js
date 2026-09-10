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
  function reads(g,p,m){
    const t=teams(g),model=p?.model||{};
    const margin=n(model.home_minus_away_margin),total=n(model.model_total),hp=n(model.home_win_probability),ap=n(model.away_win_probability);
    const hs=n(m?.home_spread),mt=n(m?.total),hml=n(m?.home_moneyline),aml=n(m?.away_moneyline);
    const spreadEdge=margin!=null&&hs!=null?margin+hs:null;
    const spreadSide=spreadEdge==null?'No current spread':spreadEdge>=0?`${t.home} ${hs>0?'+':''}${hs}`:`${t.away} ${(-hs)>0?'+':''}${-hs}`;
    const totalEdge=total!=null&&mt!=null?total-mt:null;
    const totalSide=totalEdge==null?'No current total':`${totalEdge>=0?'OVER':'UNDER'} ${mt}`;
    const hip=priceProb(hml),aip=priceProb(aml),he=hp!=null&&hip!=null?hp-hip:null,ae=ap!=null&&aip!=null?ap-aip:null;
    const mlHome=(he??-999)>=(ae??-999),mlEdge=mlHome?he:ae,mlSide=mlEdge==null?'No current moneyline':`${mlHome?t.home:t.away} ML ${mlHome?hml:aml}`;
    const candidates=[
      {name:'Spread',side:spreadSide,edge:spreadEdge,str:spreadEdge==null?'WAITING':strength(spreadEdge,'spread'),rank:spreadEdge==null?-1:Math.abs(spreadEdge)/3},
      {name:'O/U',side:totalSide,edge:totalEdge,str:totalEdge==null?'WAITING':strength(totalEdge,'total'),rank:totalEdge==null?-1:Math.abs(totalEdge)/4},
      {name:'Moneyline',side:mlSide,edge:mlEdge,str:mlEdge==null?'WAITING':strength(mlEdge,'prob'),rank:mlEdge==null?-1:Math.abs(mlEdge)/.05}
    ];
    return {t,model,margin,total,hp,ap,candidates,best:[...candidates].filter(x=>x.rank>=0).sort((a,b)=>b.rank-a.rank)[0]||null};
  }
  function style(){if(document.getElementById('ctd-game-prediction-style'))return;const s=document.createElement('style');s.id='ctd-game-prediction-style';s.textContent=`.ctdPredictionBlock{margin-top:12px;border:1px solid #1b4f7f;background:#07101d;border-radius:12px;padding:14px}.ctdPredictionBlock h3{margin:0 0 4px;font-size:16px}.ctdPredictionSub{font-size:10px;color:#8da4bf;margin-bottom:10px}.ctdPredictionGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.ctdPredMetric,.ctdPredPick{border:1px solid #17385f;border-radius:9px;padding:10px;background:#091321}.ctdPredMetric span,.ctdPredPick span{display:block;font-size:9px;color:#8da4bf;text-transform:uppercase;letter-spacing:.08em}.ctdPredMetric b,.ctdPredPick b{display:block;margin-top:4px;font-size:13px}.ctdPredPicks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:8px}.ctdPredPick em{display:block;margin-top:4px;font-style:normal;font-size:10px;color:#8ccfff}.ctdBestBet{margin-top:8px;padding:10px;border:1px solid #1c5f91;border-radius:9px;color:#dff4ff}.ctdBestBet b{color:#5bd7ff}@media(max-width:820px){.ctdPredictionGrid,.ctdPredPicks{grid-template-columns:1fr 1fr}.ctdPredPicks .ctdPredPick:last-child{grid-column:1/-1}}`;document.head.appendChild(s)};
  function render(k){
    lastKey=String(k||lastKey||'');if(!lastKey)return;const mount=document.getElementById('ctdGameDetailMount');if(!mount)return;const g=findSchedule(lastKey);if(!g)return;const p=findProjection(g),m=latestMarket(g);let old=document.getElementById('ctdUnconditionalPrediction');if(old)old.remove();
    if(!p){mount.insertAdjacentHTML('beforeend','<div id="ctdUnconditionalPrediction" class="ctdPredictionBlock"><h3>Model Prediction</h3><div class="ctdPredictionSub">Projection is waiting for this matchup.</div></div>');return}
    const r=reads(g,p,m),awayScore=n(r.model.away_score_mean),homeScore=n(r.model.home_score_mean),winner=(r.hp??0)>=(r.ap??0)?r.t.home:r.t.away,winp=Math.max(r.hp??0,r.ap??0);
    const picks=r.candidates.map(x=>`<div class="ctdPredPick"><span>${esc(x.name)} recommendation</span><b>${esc(x.side)}</b><em>${esc(x.str)}${x.edge==null?'':` · model edge ${x.name==='Moneyline'?pct(Math.abs(x.edge)):Math.abs(x.edge).toFixed(1)}`}</em></div>`).join('');
    mount.insertAdjacentHTML('beforeend',`<div id="ctdUnconditionalPrediction" class="ctdPredictionBlock"><h3>Chuck The Duke Prediction</h3><div class="ctdPredictionSub">Always shown for every game. Betting strength is separate from the underlying prediction.</div><div class="ctdPredictionGrid"><div class="ctdPredMetric"><span>Projected score</span><b>${esc(r.t.away)} ${awayScore?.toFixed(1)??'—'} · ${esc(r.t.home)} ${homeScore?.toFixed(1)??'—'}</b></div><div class="ctdPredMetric"><span>Projected winner</span><b>${esc(winner)} · ${pct(winp)}</b></div><div class="ctdPredMetric"><span>Model spread</span><b>${esc(r.t.home)} ${r.model.model_home_spread>0?'+':''}${n(r.model.model_home_spread)?.toFixed(1)??'—'}</b></div><div class="ctdPredMetric"><span>Model total</span><b>${r.total?.toFixed(1)??'—'}</b></div></div><div class="ctdPredPicks">${picks}</div><div class="ctdBestBet"><b>Best game-market read:</b> ${esc(r.best?`${r.best.side} · ${r.best.str}`:'Waiting for current sportsbook lines')}</div></div>`);
  }
  async function load(){style();try{[projections,markets]=await Promise.all([fetch(`${RAW}data/probability/generated/weekly-game-projections-2026.json?ts=${Date.now()}`,{cache:'no-store'}).then(r=>r.json()),fetch(`${RAW}data/market/weekly-matchup-market-snapshots-2026.json?ts=${Date.now()}`,{cache:'no-store'}).then(r=>r.json())])}catch(e){console.error('CTD game prediction load failed',e)}
    document.addEventListener('click',e=>{const el=e.target.closest?.('[data-game-key],[data-game-id]');if(!el)return;const k=el.dataset.gameKey||el.dataset.gameId;setTimeout(()=>render(k),0)});
    const obs=new MutationObserver(()=>{const a=document.querySelector('.ctdTickerGame.active[data-game-key]');if(a&&a.dataset.gameKey!==lastKey)render(a.dataset.gameKey)});obs.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();