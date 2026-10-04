(()=>{
 const e=x=>String(x??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const team=x=>({WAS:'WSH',LA:'LAR'}[x]||x);
 const date=x=>new Date(x).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
 let kind='all',scope='game';
 window.ctdRecordedHistory=(g,history,settlements,error)=>{
  const week=Number(BET_FEED.week),season=Number(BET_FEED.season||2026);
  const events=settlements?.events||{};
  const rows=(history?.records||[]).filter(p=>Number(p.week)===week&&Number(p.season)===season).filter(p=>{
   const event=events[p.game_id]||p;
   return (scope==='week'||(team(event.home_team)===team(g.home_team)&&team(event.away_team)===team(g.away_team))||p.game_id===`${season}-W${week}-${team(g.away_team)}-${team(g.home_team)}`)&&(kind==='all'||(kind==='props'?!!p.player:!p.player));
  });
  const groups=new Map(),results=new Map((settlements?.settlements||[]).map(s=>[s.record_id,s]));
  for(const p of rows){if(!groups.has(p.stream_id))groups.set(p.stream_id,[]);groups.get(p.stream_id).push(p);}
  const stats={WIN:0,LOSS:0,PUSH:0,PENDING:0},cards=[];let profit=0,noPick=0;
  for(const list of groups.values()){
   list.sort((a,b)=>a.revision-b.revision);const p=list.find(x=>x.decision==='PICK');if(!p){noPick++;continue;}
   const result=results.get(p.record_id),outcome=result?.outcome||'PENDING';stats[outcome]++;profit+=result?.profit_units||0;
   const selection=x=>`${x.player?x.player+' · ':''}${x.selection||x.decision}${x.player&&x.selection?' '+x.line:''}`;
   const odds=x=>typeof x==='number'?(x>0?'+':'')+x:'—';
   const outcomeHtml=r=>`<b class="ctdResult ${e(r?.outcome||'PENDING')}">${e(r?.outcome||'Pending final result')}</b>`;
   const revisions=list.filter(x=>x.record_id!==p.record_id);
   cards.push(`<article class="ctdHistoryPick"><div class="ctdHistoryTop"><strong>${e(selection(p))}</strong>${outcomeHtml(result)}</div><p>${e(p.game_id.replace(`${season}-W${week}-`,''))} · ${e(p.market.replaceAll('_',' '))} · ${e(p.book)} · Odds ${e(odds(p.odds))}</p><p>Recorded ${e(date(p.captured_at))}${result?' · Finished with '+e(result.actual)+' '+e(p.player?p.market.replaceAll('_',' '):p.market==='total'?'combined points':'points of margin')+' · '+(result.profit_units>=0?'+':'')+result.profit_units.toFixed(2)+' units':''}</p>${revisions.length?`<details><summary>${revisions.length} pick update${revisions.length===1?'':'s'} · latest ${e(({WAIT:"Waiting",PASS:"No bet",WITHDRAWN:"Withdrawn",PICK:"Pick"})[list.at(-1).decision]||list.at(-1).decision)}</summary>${revisions.map(x=>`<p>${e(date(x.captured_at))} · ${e(selection(x))} · ${e(odds(x.odds))}${x.decision==='PICK'?' · '+e(results.get(x.record_id)?.outcome||'Pending'):''}</p>`).join('')}</details>`:''}</article>`);
  }
  return `<h3>BETTING HISTORY · WEEK ${week}</h3><div class="ctdHistoryFilters"><label>Show <select data-history-scope><option value="game" ${scope==='game'?'selected':''}>This game</option><option value="week" ${scope==='week'?'selected':''}>All games this week</option></select></label><label>Markets <select data-history-kind>${[['all','All picks'],['games','Game picks'],['props','Player props']].map(([v,t])=>`<option value="${v}" ${kind===v?'selected':''}>${t}</option>`).join('')}</select></label></div><div class="ctdHistorySummary"><b>${stats.WIN} wins · ${stats.LOSS} losses · ${stats.PUSH} pushes</b><span>${stats.PENDING} pending · ${profit>=0?'+':''}${profit.toFixed(2)} units</span></div><p class="ctdDetailNote">This tracks the first pick we saved for each bet, starting in Week 2. Each result assumes the same stake. For example, if your usual stake is $10, +0.91 units means +$9.10. Later changes are listed under each pick; these are model results, not bets placed for you.</p>${error?`<p class="ctdDetailNote">${e(error)}</p>`:''}${cards.join('')||'<p class="ctdDetailNote">No recorded picks for this selection.</p>'}<p class="ctdDetailNote">${noPick} markets had no recorded pick and are not counted. If a player’s final stats are missing, the result stays pending; we do not assume zero. Refund rules can differ by sportsbook.</p>`;
 };
 document.addEventListener('change',event=>{if(event.target.matches('[data-history-kind]'))kind=event.target.value;else if(event.target.matches('[data-history-scope]'))scope=event.target.value;else return;document.dispatchEvent(new Event('ctd:history-filter'));});
 const style=document.createElement('style');style.textContent='.ctdHistoryFilters{display:flex;gap:16px;flex-wrap:wrap;margin:14px 0}.ctdHistoryFilters label{font-size:13px;color:#a8bdd3}.ctdHistoryFilters select{background:#102138;color:#fff;border:1px solid #355172;border-radius:6px;padding:8px;margin-left:6px}.ctdHistorySummary{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:16px;background:#132840;border-left:3px solid #308bff;border-radius:6px}.ctdHistoryPick{border-bottom:1px solid #284059;padding:16px 0}.ctdHistoryTop{display:flex;justify-content:space-between;gap:12px}.ctdHistoryPick p{font-size:12px!important;color:#a8bdd3;line-height:1.6}.ctdResult{font-size:12px;color:#a8bdd3}.ctdResult.WIN{color:#4adea0}.ctdResult.LOSS{color:#ff9992}.ctdResult.PUSH{color:#efc56c}';document.head.appendChild(style);
})();
