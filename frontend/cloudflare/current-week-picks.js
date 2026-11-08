(()=>{
 if(window.CTD_CURRENT_WEEK_PICKS)return;window.CTD_CURRENT_WEEK_PICKS=true;
 const start=()=>{const old=document.getElementById('ourPicksMount');if(!old)return;
 const panel=document.createElement('section');panel.id='currentWeekPicks';panel.className='panel';old.before(panel);
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const odds=x=>x>0?'+'+x:String(x),pct=x=>(x*100).toFixed(1)+'%';let current=null;
 const cards=rows=>rows.length?'<div class="pickCards">'+rows.map(x=>'<div class="edgeCard"><strong>'+esc(x.selection)+'</strong><div class="market">'+odds(x.odds)+'</div><div class="edgeMetrics"><span>Model <b>'+pct(x.probability)+'</b></span></div></div>').join('')+'</div>':'<p class="copy">No pick clears the model thresholds at current prices.</p>';
 function render(){
  if(!current||Date.now()>Date.parse(current.expires_at)){panel.innerHTML='<h3>Current picks unavailable</h3><p class="copy">Waiting for current quotes. Expired selections are hidden.</p>';old.hidden=true;return;}
  const x=current,time=new Date(x.checked_at).toLocaleTimeString('en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit'});
  panel.innerHTML='<h3>Week 9 · Our picks</h3><p class="copy">Prices checked '+esc(time)+' CT · Spread learning: Weeks 1–8 · '+x.training_non_push_games+' settled non-push games</p><h4>Spreads · Calibration + learning</h4>'+cards(x.spreads.filter(p=>Date.parse(p.kickoff)>Date.now()))+'<h4>Moneyline upset watchlist · provisional</h4><p class="copy">These and the totals below use the scoring variant still awaiting validation.</p>'+cards(x.upset_watchlist.filter(p=>Date.parse(p.kickoff)>Date.now()))+'<h4>Totals · provisional candidates</h4>'+cards(x.total_candidates.filter(p=>Date.parse(p.kickoff)>Date.now()))+'<h4>Player props</h4><p class="copy">Waiting for verified Week 9 prop quotes.</p><details><summary>Every matchup, including Dallas–Indianapolis</summary><div style="overflow:auto"><table class="scoretable"><thead><tr><th>Game</th><th>Spread direction</th><th>Decision</th></tr></thead><tbody>'+x.games.map(g=>'<tr><td>'+esc(g.matchup)+'</td><td>'+esc(g.spread_direction)+'</td><td>'+esc(g.spread_decision)+'</td></tr>').join('')+'</tbody></table></div></details>';
  old.hidden=true;
 }
 async function refresh(){try{const r=await fetch('/api/live/current-picks',{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Current picks unavailable');const x=await r.json();if(x.status!=='CURRENT'||x.week!==9||x.training_weeks.join(',')!=='1,2,3,4,5,6,7,8')throw Error('Current-week verification failed');current=x;render();}catch{render();}}
 panel.innerHTML='<p class="copy">Loading current Week 9 picks…</p>';refresh();setInterval(refresh,60000);setInterval(render,30000);
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
