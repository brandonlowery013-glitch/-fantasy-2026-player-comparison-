(()=>{
 if(window.CTD_CURRENT_WEEK_PICKS)return;window.CTD_CURRENT_WEEK_PICKS=true;
 const start=()=>{const old=document.getElementById('ourPicksMount');if(!old)return;
 const weekSelector=document.getElementById('liveWeekSelect');if(weekSelector&&weekSelector.value!=='9'){weekSelector.value='9';weekSelector.dispatchEvent(new Event('change',{bubbles:true}));}
 const panel=document.createElement('section');panel.id='currentWeekPicks';panel.className='panel';old.before(panel);
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const odds=x=>x>0?'+'+x:String(x),pct=x=>(x*100).toFixed(1)+'%';let current=null;
 const cards=rows=>rows.length?'<div class="pickCards">'+rows.map(x=>'<div class="edgeCard"><strong>'+esc(x.selection)+'</strong><div class="market">'+odds(x.odds)+'</div><div class="edgeMetrics"><span>Model <b>'+pct(x.probability)+'</b></span></div>'+(x.rationale?'<details><summary>Why this pick</summary><p>'+esc(x.rationale)+'</p>'+(x.availability?'<p>'+esc(x.availability)+'</p>':'')+'</details>':'')+'</div>').join('')+'</div>':'<p class="copy">No pick clears the model thresholds at current prices.</p>';
 function render(){
  if(!current||Date.now()>Date.parse(current.expires_at)){panel.innerHTML='<h3>Current picks unavailable</h3><p class="copy">Waiting for current quotes. Expired selections are hidden.</p>';old.hidden=true;return;}
  const x=current,time=new Date(x.checked_at).toLocaleTimeString('en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit'});
  panel.innerHTML='<h3>Week 9 · Our picks</h3><p class="copy">Prices checked '+esc(time)+' CT · '+esc(x.quote_source)+' · Spread learning: Weeks 1–8 · '+x.training_non_push_games+' settled non-push games</p><h4>Spreads · Calibration + learning</h4>'+cards(x.spreads.filter(p=>Date.parse(p.kickoff)>Date.now()))+'<h4>Moneyline · strongest upset picks</h4><p class="copy">Up to three underdogs ranked by model win chance. Indianapolis excluded from your shortlist. Moneyline, totals and the new history/defense props are developing estimates pending live validation.</p>'+cards(x.upset_watchlist.filter(p=>Date.parse(p.kickoff)>Date.now()))+'<h4>Game totals · Over / Under</h4>'+cards(x.total_candidates.filter(p=>Date.parse(p.kickoff)>Date.now()))+'<h4>Player props · History + defense</h4>'+cards((x.props||[]).filter(p=>Date.parse(p.kickoff)>Date.now()))+(!(x.props||[]).length?'<p class="copy">A current line and confirmed game-day availability are required. No stale or inactive-player selection is shown.</p>':'')+'<details><summary>Every matchup, including Dallas–Indianapolis</summary><div style="overflow:auto"><table class="scoretable"><thead><tr><th>Game</th><th>Spread direction</th><th>Decision</th></tr></thead><tbody>'+x.games.map(g=>'<tr><td>'+esc(g.matchup)+'</td><td>'+esc(g.spread_direction)+'</td><td>'+esc(g.spread_decision)+'</td></tr>').join('')+'</tbody></table></div></details>';
  old.hidden=true;
 }
 async function refresh(){try{const helper=await import('./lib/current-picks-client.mjs?v=20261108-2');const x=await helper.currentPicks();if(x.status!=='CURRENT'||x.week!==9||x.training_weeks.join(',')!=='1,2,3,4,5,6,7,8')throw Error('Current-week verification failed');current=x;render();}catch{render();}}
 panel.innerHTML='<p class="copy">Loading current Week 9 picks…</p>';refresh();setInterval(refresh,60000);setInterval(render,30000);
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
