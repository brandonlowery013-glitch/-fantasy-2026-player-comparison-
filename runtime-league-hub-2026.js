/* Read-only live sheet view. Values and formulas stay in the source workbook. */
(()=>{
 const nav=document.getElementById('nav');if(!nav)return;
 const sheetId='1qFU32oC7Ka_sra2oZeJq1hfPYJq0omu9N-4zimUxJ_g';
 const button=document.createElement('button');button.textContent='OUR LEAGUE';button.dataset.page='leaguePage';nav.append(button);
 const page=document.createElement('section');page.id='leaguePage';page.className='page';
 const sheetIds={'50 dolla holla':'1340409521','Season Standings':'740717667','Week 1':'994643100','Week 2':'101010495','Week 3':'162301662','Week 4':'2024627488','Week 5':'844813745','Week 6':'847704697','Week 7':'734130043','Week 8':'898968135','Week 9':'1125798926','Week 10':'422245793','Week 11':'1976289742','Week 12':'1968521767','Week 13':'761495465','Week 14':'1173677390'};
 const sheets=Object.keys(sheetIds);
 page.innerHTML=`<article class="panel"><h1>Chuck the Duke Fantasy League</h1><p>Your league and season tracker.</p><div class="tabs"><button data-league-view="yahoo" class="active">Yahoo league</button><button data-league-view="sheet">Season spreadsheet</button></div><div data-league-panel="yahoo"><h2>Yahoo Fantasy</h2><p><a href="https://football.fantasysports.yahoo.com/f1/95280/1" target="_blank" rel="noopener noreferrer">Open your team, matchups and standings on Yahoo ↗</a></p></div><div data-league-panel="sheet" hidden><h2>Season tracker</h2><div class="leagueControls"><label>Sheet <select id="leagueSheetTab">${sheets.map(s=>`<option${s==='Week 3'?' selected':''}>${esc(s)}</option>`).join('')}</select></label><button id="leagueSheetRefresh">Refresh</button><a href="https://docs.google.com/spreadsheets/d/${sheetId}/edit?gid=162301662#gid=162301662" target="_blank" rel="noopener noreferrer">Open original spreadsheet ↗</a></div><p id="leagueSheetUpdated" class="dataNote" role="status"></p><div id="leagueSheet" class="leagueTableWrap" tabindex="0" aria-label="League spreadsheet"></div><p class="dataNote">Game-day updates: every 5 minutes from 10:30 a.m. Central until kickoff, then after each group of games finishes.</p></div></article>`;
 document.getElementById('gamesPage').after(page);
 button.addEventListener('click',()=>showPage('leaguePage',button));
 const mount=page.querySelector('#leagueSheet'),note=page.querySelector('#leagueSheetUpdated'),select=page.querySelector('#leagueSheetTab');let loaded='',request=0;
 async function refresh(){const selected=select.value,id=++request;note.textContent='Updating spreadsheet…';if(loaded!==selected)mount.replaceChildren();
  try{const url=`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${sheetIds[selected]}&refresh=${Date.now()}`;
   const r=await fetch(url,{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Sheet request failed');
   const raw=await r.text();if(/<html|<!doctype/i.test(raw))throw Error('Spreadsheet unavailable');
   const rows=window.CTD_LEAGUE_CSV.parse(raw);
   if(id!==request)return;
   while(rows.length&&rows.at(-1).every(x=>!x.trim()))rows.pop();
   const width=rows.reduce((max,row)=>Math.max(max,...row.map((value,i)=>value.trim()?i+1:0)),0);
   const managerRow=rows.findIndex(row=>/^pick detail$/i.test(row[0]?.trim()));
   if(managerRow>=0){
    const names=rows[managerRow],fields=rows.slice(managerRow+1).filter(row=>['Bet Type','Pick / Player / Team','Line','Odds','Game / Matchup','Result','Notes'].includes(row[0]?.trim()));
    const summaryStart=rows.findIndex(row=>row[0]?.trim()==='WEEKLY PARLAY STATUS');
    const summaryRows=summaryStart<0?[]:rows.slice(summaryStart+1).filter(row=>row[0]?.trim()&&row[1]?.trim());
    const labels={'Bet Type':'Bet type','Pick / Player / Team':'Pick','Game / Matchup':'Matchup'};
    mount.innerHTML=(summaryRows.length?`<div class="leagueSummary">${summaryRows.map(row=>`<span>${esc(row[0])}: <b>${esc(row[1])}</b></span>`).join('')}</div>`:'')+`<table><caption>${esc(rows[0]?.[0]||selected)}</caption><thead><tr><th scope="col">Manager</th>${fields.map(row=>`<th scope="col">${esc(labels[row[0]]||row[0])}</th>`).join('')}</tr></thead><tbody>${names.slice(1).map((name,index)=>name.trim()?`<tr><th scope="row">${esc(name)}</th>${fields.map(row=>{const value=row[index+1]||'',state=/^(win|loss|pending|push)$/i.test(value.trim())?` class="league${value.trim().toLowerCase()}"`:'';return `<td${state}>${esc(value)}</td>`;}).join('')}</tr>`:'').join('')}</tbody></table>`;
   }else{
    mount.innerHTML=rows.length?`<table><caption>${esc(selected)}</caption><tbody>${rows.map((row,i)=>i===0&&row.slice(1).every(x=>!x.trim())?`<tr class="leagueSheetTitle"><th colspan="${width}">${esc(row[0])}</th></tr>`:`<tr>${Array.from({length:width},(_,j)=>`<${j===0?'th scope="row"':'td'}>${esc(row[j]||'')}</${j===0?'th':'td'}>`).join('')}</tr>`).join('')}</tbody></table>`:'<p>This sheet is empty.</p>';
   }
   loaded=selected;note.textContent='Updated '+new Date().toLocaleTimeString();return true;
  }catch{if(id===request)note.textContent=loaded===selected?'Could not refresh. The last loaded values are still shown; open the original sheet for the latest update.':'Could not load this sheet. Open the original spreadsheet above.';}
 }
 page.addEventListener('click',e=>{const tab=e.target.closest('[data-league-view]');if(!tab)return;page.querySelectorAll('[data-league-view]').forEach(x=>x.classList.toggle('active',x===tab));page.querySelectorAll('[data-league-panel]').forEach(x=>x.hidden=x.dataset.leaguePanel!==tab.dataset.leagueView);if(tab.dataset.leagueView==='sheet'&&!loaded)void refresh();});
 select.addEventListener('change',()=>void refresh());page.querySelector('#leagueSheetRefresh').addEventListener('click',()=>void refresh());
 let events=[],scoreDay='',scoreAt=0;const completed=new Set();
 try{JSON.parse(localStorage.getItem('ctdLeagueRefreshKeys')||'[]').forEach(k=>completed.add(k));}catch{}
 async function scheduled(){
  if(document.hidden||!page.classList.contains('active')||page.querySelector('[data-league-panel="sheet"]').hidden)return;
  const now=Date.now(),clock=window.CTD_LEAGUE_REFRESH;if(!clock)return;const parts=clock.central(now),day=parts.year+parts.month+parts.day;
  const yesterday=clock.central(now-86400000),from=yesterday.year+yesterday.month+yesterday.day;
  const previous=clock.plan(events,now);
  if(scoreDay!==day||(previous.checkScores&&now-scoreAt>=300000)){
   try{const r=await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates='+from+'-'+day,{credentials:'omit',signal:AbortSignal.timeout(15000)});if(!r.ok)return;const data=await r.json();if(!Array.isArray(data.events))return;events=data.events;scoreDay=day;scoreAt=now;}catch{return;}
  }
  const due=clock.plan(events,now).keys.filter(k=>!completed.has(k));
  if(due.length&&await refresh()){due.forEach(k=>completed.add(k));try{localStorage.setItem('ctdLeagueRefreshKeys',JSON.stringify([...completed].filter(k=>k.startsWith(day)||k.startsWith(from))));}catch{}}
 }
 setInterval(()=>void scheduled(),300000);
 const style=document.createElement('style');style.textContent='.leagueSummary{display:flex;gap:20px;flex-wrap:wrap;padding:16px;background:#142c44;color:#c8def5}.leagueControls{display:flex;gap:16px;align-items:center;flex-wrap:wrap}.leagueControls select{background:#142c44;color:#eaf3ff;border:1px solid #497398;border-radius:6px;padding:10px}.leagueTableWrap{overflow:auto;max-height:70vh;border:1px solid #294159;border-radius:10px;background:#0b1626}.leagueTableWrap table{border-collapse:collapse;min-width:100%;font-size:14px}.leagueTableWrap caption{text-align:left;background:#142c44;color:#a8d6ff;padding:16px;font-weight:700}.leagueTableWrap td,.leagueTableWrap th{border:1px solid #294159;padding:12px;min-width:145px;max-width:320px;white-space:pre-wrap;overflow-wrap:anywhere;color:#d9e6f4;text-align:left;vertical-align:top}.leagueTableWrap thead th{position:sticky;top:0;left:auto;background:#153555;z-index:2}.leagueTableWrap tbody th{position:sticky;left:0;background:#102238;min-width:120px}.leagueTableWrap tr:nth-child(even){background:#101f31}.leagueTableWrap .leagueSheetTitle{background:#153555;font-weight:700}.leagueTableWrap .leaguewin{color:#63e2b7}.leagueTableWrap .leagueloss{color:#ffa09f}.leagueTableWrap .leaguepending,.leagueTableWrap .leaguepush{color:#f3cc80}';document.head.append(style);
})();
