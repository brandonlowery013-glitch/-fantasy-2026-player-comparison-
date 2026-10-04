(()=>{
 'use strict';
 const RAW='https://raw.githubusercontent.com/brandonlowery013-glitch/-fantasy-2026-player-comparison-/main/';
 const esc=x=>String(x??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const label=x=>String(x||'').replaceAll('_',' ').replace(/^pass /,'passing ').replace(/^rush /,'rushing ');
 const price=x=>typeof x==='number'&&Number.isFinite(x)?(x>0?'+':'')+x:'—';
 const date=x=>Number.isFinite(Date.parse(x))?new Date(x).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Time unavailable';
 let projection=null,distribution=null,context=null,gameMarkets=null;
 let currentSchedule=null;
 let snapshots=null,recs=null,personnel=null,error='',market='all',game='all',busy=false;
 const key=n=>String(n||'').toLowerCase().normalize('NFKD').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
 window.CTD_PLAYER_PORTRAIT=(name,id,position)=>{const matches=Object.values(personnel?.teams||{}).flatMap(t=>t.players||[]).filter(p=>key(p.name||p.player)===key(name)&&(!position||p.position===position));id=id||(matches.length===1?matches[0].athlete_id:null);const initials=String(name).split(' ').map(w=>w[0]).slice(0,2).join('');return `<span class="ctdPortrait"><span>${esc(initials)}</span>${/^\d+$/.test(String(id||''))?`<img loading="lazy" src="https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png" alt="${esc(name)}">`:''}</span>`;};
 document.addEventListener('error',e=>{if(e.target.matches?.('.ctdPortrait img'))e.target.remove();},true);
 const nav=document.getElementById('nav'),gamesButton=nav.querySelector('[data-page="gamesPage"]');
 const propsButton=document.createElement('button');propsButton.dataset.page='propsPage';propsButton.textContent='PROPS';gamesButton.after(propsButton);
 const page=document.createElement('section');page.id='propsPage';page.className='page';page.innerHTML='<div class="ctdPropsHeading"><div><p>PLAYER MARKETS</p><h1>Props</h1></div><span id="propsWeek">Loading current week…</span></div>';
 document.getElementById('gamesPage').after(page);const panel=document.querySelector('[data-bet-panel="props"]');panel.classList.remove('betView');page.append(panel);document.querySelector('[data-bet-view="props"]')?.remove();
 function currentPropWeek(...feeds){for(const feed of feeds){const week=Number(feed?.week);if(Number.isInteger(week)&&week>=1&&week<=18)return week;}return null;}
 let chosenWeek=null;
 function syncWeek(){chosenWeek=currentPropWeek(currentSchedule,gameMarkets,recs,projection);page.querySelector('#propsWeek').textContent=chosenWeek===null?'Loading current week…':`Week ${chosenWeek}`;}
 propsButton.addEventListener('click',()=>showPage('propsPage',propsButton));
 function boardRows(ledger,recommendations,week){
  const evaluations=new Map();
  for(const p of Object.values(recommendations?.players||{}))for(const e of p.weekly?.evaluations||[])if(Number(e.week)===Number(week))evaluations.set(e.snapshot_id,e);
  const byBook=new Map();
  for(const s of ledger?.snapshots||[]){
   if(s.horizon!=='WEEKLY'||Number(s.week)!==Number(week)||!s.game_id||!Number.isFinite(Date.parse(s.captured_at)))continue;
   const k=[s.game_id,s.player,s.stat,s.book].join('|'),old=byBook.get(k);
   if(!old||Date.parse(s.captured_at)>Date.parse(old.captured_at))byBook.set(k,s);
  }
  const grouped=new Map();
  for(const s of byBook.values()){
   const k=[s.game_id,s.player,s.stat].join('|');if(!grouped.has(k))grouped.set(k,[]);
   grouped.get(k).push({...s,evaluation:evaluations.get(s.snapshot_id)||null});
  }
  return [...grouped.values()].map(books=>books.sort((a,b)=>Date.parse(b.captured_at)-Date.parse(a.captured_at)||a.book.localeCompare(b.book))).sort((a,b)=>a[0].player.localeCompare(b[0].player)||a[0].stat.localeCompare(b[0].stat));
 }
 window.CTD_PROP_BOARD_ROWS=boardRows;
 function verdict(s){
  const e=s.evaluation,r=e?.recommendation,q=e?.model;
  let pick=e?.model_pick;
  if(!pick&&[q?.over_probability,q?.under_probability,q?.push_probability].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1)&&Math.abs(q.over_probability+q.under_probability+q.push_probability-1)<1e-5){
   pick={side:q.over_probability>q.under_probability?'OVER':q.under_probability>q.over_probability?'UNDER':null,status:q.over_probability===q.under_probability?'EVEN':'AVAILABLE'};
  }
  const model=pick?.side?`MODEL ${pick.side}`:pick?.status==='EVEN'?'MODEL EVEN':'MODEL UNAVAILABLE';
  const direction=pick?.side?`${pick.side} ${s.line}. `:pick?.status==='EVEN'?'The model gives both sides equal probability. ':'A matching projection is unavailable. ';
  if(!Number.isFinite(Date.parse(s.kickoff)))return ['Waiting','We cannot confirm the game time yet.'];
  if(Date.parse(s.kickoff)<=Date.now())return [model,direction+'Betting: closed. This is the forecast saved before kickoff.'];
  const age=Date.now()-Date.parse(s.captured_at);
  if(!Number.isFinite(age)||age<0||age>6*3600000)return [model,direction+'Betting: wait for a fresh quote.'];
  const state=window.CTD_WEEKLY_ELIGIBILITY?.(s.player,s.week)?.state;
  const conditional=pick?.conditional_on_availability||e?.eligibility?.eligible_for_pick!==true||state!=='ELIGIBLE';
  if(conditional||r?.decision==='WAIT')return ['Waiting for player status','No current recommendation. We need to confirm that the player is available.'];
  if(r?.decision==='PICK')return [model,direction+`Betting: recommended ${r.side} at this quote · analysis only.`];
  return [model,direction+(r?.decision==='PASS'?'Betting: pass. We do not see enough value at this price.':'Betting recommendation unavailable.')];
 }
 function explanation(s){
  const e=s.evaluation;if(!e)return '';
  const matches=d=>d?.season===2026&&Number(d.week)===Number(s.week);
  if(!matches(projection)||!matches(distribution))return e.show_work?.reader?window.CTD_FORMATTED_WORK?.(e.show_work)||'':'';
  const pp=projection.players?.[s.player],cp=matches(context)&&context.sportsbook_inputs_used===false?context.players?.[s.player]:null;
  const signals=Object.entries(cp?.signals||{}).map(([kind,x])=>({kind,...x}));
  const team=cp?.signals?.role?.evidence?.team;
  const work=window.CTD_SHOW_WORK?.propWork(e,window.CTD_SHOW_WORK.propStat(distribution.distributions?.[s.player]?.distributions,s.stat),window.CTD_SHOW_WORK.propStat(pp?.projections,s.stat),signals,Object.fromEntries(['attempts','targets','carries','routes','snaps'].map(k=>[k,pp?.projections?.[k]?.mean])),Date.now(),matches(gameMarkets)?window.CTD_SHOW_WORK.teamEnvironment(gameMarkets.games,team,s.week):null);
  if(work?.reader){const [state,reason]=verdict(s);if(!reason.includes('Betting: recommended'))work.reader.verdict=reason;}
  return window.CTD_FORMATTED_WORK?.(work)||'';
 }
 function bookRow(s){const [state,reason]=verdict(s);return `<div class="ctdPropBook"><b>${esc(s.provider_book_title||s.book)}</b><span>Line ${esc(s.line)} · Over ${esc(price(s.over_price))} / Under ${esc(price(s.under_price))}</span><span>${esc(state)} · ${esc(reason)}</span><small>Quote ${esc(date(s.captured_at))}</small></div>`;}
 function render(){return window.CTD_READING.preserve(document.getElementById('propsPage'),renderData);}
function renderData(){
  const mount=document.querySelector('[data-bet-panel="props"]');if(!mount)return;
  const week=chosenWeek,rows=boardRows(snapshots,recs,week),games=[...new Set(rows.map(a=>a[0].game_id))].sort(),stats=[...new Set(rows.map(a=>a[0].stat))].sort();
  if(!games.includes(game))game='all';if(!stats.includes(market))market='all';
  const visible=rows.filter(a=>!(Date.parse(a[0].kickoff)>Date.now()&&window.CTD_WEEKLY_ELIGIBILITY?.(a[0].player,a[0].week)?.state==='UNAVAILABLE')).filter(a=>(game==='all'||a[0].game_id===game)&&(market==='all'||a[0].stat===market));
  mount.innerHTML=`<div class="panel"><p class="ctdPropUpdate">${rows.length?`Latest quote update ${esc(date(new Date(Math.max(...rows.flatMap(books=>books.map(s=>Date.parse(s.captured_at))))).toISOString()))}`:"Waiting for published quotes"}</p>${error?`<p class="copy">${esc(error)}</p>`:''}<div class="ctdPropFilters"><label>Matchup <select data-prop-game><option value="all">All games</option>${games.map(g=>`<option value="${esc(g)}" ${g===game?'selected':''}>${esc(g.replace(/^\d+-W\d+-/,''))}</option>`).join('')}</select></label><label>Stat <select data-prop-stat><option value="all">All stats</option>${stats.map(s=>`<option value="${esc(s)}" ${s===market?'selected':''}>${esc(label(s))}</option>`).join('')}</select></label></div><p class="copy">${visible.length} player markets</p><div class="ctdPropGrid">${visible.map(books=>{
   const s=books[0],[state,reason]=verdict(s);
   return `<article class="ctdPropCard"><div class="ctdPropTitle"><button class="ctdPropIdentity" data-profile="${esc(s.player)}">${window.CTD_PLAYER_PORTRAIT(s.player,null,s.position)}<span>${esc(s.player)}</span></button><strong>${esc(state)}</strong></div><p>${esc(s.game_id.replace(/^\d+-W\d+-/,''))} · ${esc(label(s.stat))}</p><div class="ctdPropLine">${esc(s.line)} <span>${esc(label(s.stat))}</span></div><div class="ctdPropPrices"><span>OVER <b>${esc(price(s.over_price))}</b></span><span>UNDER <b>${esc(price(s.under_price))}</b></span></div>${reason?`<p>${esc(reason)}</p>`:""}${explanation(s)}<small>${esc(s.provider_book_title||s.book)} · Quote ${esc(date(s.captured_at))}</small>${books.length>1?`<details><summary>Compare ${books.length} sportsbooks</summary>${books.map(bookRow).join('')}</details>`:''}</article>`;
  }).join('')}</div>${!visible.length?`<p class="copy">${snapshots?'No sportsbook prop lines are available for this week and filter.':'Loading sportsbook prop lines…'}</p>`:''}</div>`;
 }
 async function refresh(){if(busy)return;busy=true;try{
  const results=await Promise.allSettled(['data/market/player-prop-market-snapshots-2026.json','data/market/player-prop-recommendations-2026.json','data/ingestion/team-personnel-2026.json','data/probability/weekly-projection-inputs-2026.json','data/probability/generated/weekly-probability-distributions-2026.json','data/probability/weekly-football-context-inputs-2026.json','data/market/weekly-game-market-recommendations-2026.json','data/calibration/weekly-event-schedule-2026.json'].map(async path=>{const r=await fetch(RAW+path+'?refresh='+Math.floor(Date.now()/300000),{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('HTTP '+r.status);return r.json();}));
  if(results[0].status==='fulfilled')snapshots=results[0].value;if(results[1].status==='fulfilled')recs=results[1].value;
  if(results[2].status==='fulfilled')personnel=results[2].value;
  if(results[3].status==='fulfilled')projection=results[3].value;if(results[4].status==='fulfilled')distribution=results[4].value;if(results[5].status==='fulfilled')context=results[5].value;if(results[6].status==='fulfilled')gameMarkets=results[6].value;
  if(results[7].status==='fulfilled')currentSchedule=results[7].value;
  error=results.slice(0,2).some(r=>r.status==='rejected')?'A feed could not refresh. Any displayed quotes retain their original timestamps.':'';
 }finally{busy=false;syncWeek();render();}}
 document.addEventListener('change',e=>{if(e.target.matches('[data-prop-game]'))game=e.target.value;else if(e.target.matches('[data-prop-stat]'))market=e.target.value;else return;render();});
 document.addEventListener('ctd:games-ready',()=>{syncWeek();render();});
 const style=document.createElement('style');style.textContent='.ctdPropsHeading{display:flex;align-items:center;justify-content:space-between;margin:24px 0}.ctdPropsHeading h1{font-size:36px;margin:0}.ctdPropsHeading p{color:#85baff;letter-spacing:.15em;font-size:11px}.ctdPropsHeading select{background:#102138;color:white;padding:10px;border:1px solid #355172;border-radius:8px}.ctdPropUpdate{font-size:12px;color:#9fb5cc}.ctdPropIdentity{display:flex;align-items:center;gap:12px;background:none;border:0;color:#fff;text-align:left;font:inherit;font-size:17px;font-weight:700;cursor:pointer;padding:0}.ctdPortrait{display:inline-flex;position:relative;align-items:center;justify-content:center;flex-shrink:0;width:62px;height:62px;border-radius:14px;overflow:hidden;background:#203c5a;color:#9ccaff}.ctdPortrait img{position:absolute;width:100%;height:100%;object-fit:cover;background:#203c5a}.ctdProfileHero{display:flex;align-items:center;gap:20px;margin:22px 0}.ctdProfileHero .ctdPortrait{width:100px;height:100px}.ctdProfileHero h2{margin:0;font-size:30px}#propsPage{padding-top:10px}'+'.ctdPropFilters{display:flex;gap:16px;flex-wrap:wrap;margin:16px 0}.ctdPropFilters label{font-size:13px;color:#afc3da}.ctdPropFilters select{background:#102138;color:#fff;border:1px solid #34516f;border-radius:6px;padding:8px;margin-left:8px}.ctdPropGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:14px}.ctdPropCard{padding:18px;background:#101f30;border:1px solid #2b4662;border-radius:10px}.ctdPropTitle{display:flex;align-items:start;justify-content:space-between;gap:12px}.ctdPropTitle h3{font-size:18px!important;margin:0}.ctdPropTitle>strong{font-size:10px;color:#f2c66e;letter-spacing:.07em}.ctdPropCard p,.ctdPropCard small{font-size:12px;color:#a8bdd3;line-height:1.6}.ctdPropLine{font-size:30px;font-weight:800;margin:14px 0}.ctdPropLine span{font-size:13px;color:#afc3da;font-weight:400}.ctdPropPrices{display:flex;gap:24px;font-size:12px;color:#a8bdd3}.ctdPropPrices b{font-size:18px;color:#fff;margin-left:8px}.ctdPropCard summary{font-size:12px;color:#82bfff;cursor:pointer;margin-top:16px}.ctdPropBook{display:grid;gap:4px;border-top:1px solid #284059;margin-top:12px;padding-top:10px;font-size:12px;color:#a8bdd3}';document.head.appendChild(style);
 render();void refresh();setInterval(()=>{if(!document.hidden)void refresh();},300000);
})();
