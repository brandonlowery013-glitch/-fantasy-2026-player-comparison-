(()=>{
 'use strict';
 let liveHelpers=null;const liveReady=import(new URL('lib/live-prop-board.mjs',document.currentScript.src)).then(x=>liveHelpers=x);
 let supplementalFeed=null;const supplementReady=import(new URL('lib/supplemental-prop-coverage.mjs',document.currentScript.src));
 let propModel=null,propPolicy=null;const propModelReady=import(new URL('lib/current-prop-model.mjs',document.currentScript.src)).then(x=>propModel=x);
 const RAW='https://raw.githubusercontent.com/brandonlowery013-glitch/-fantasy-2026-player-comparison-/main/';
 const esc=x=>String(x??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const label=x=>String(x||'').replaceAll('_',' ').replace(/^pass /,'passing ').replace(/^rush /,'rushing ');
 const price=x=>typeof x==='number'&&Number.isFinite(x)?(x>0?'+':'')+x:'—';
 const date=x=>Number.isFinite(Date.parse(x))?new Date(x).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Time unavailable';
 let projection=null,distribution=null,context=null,gameMarkets=null,availabilityFeed=null,baseProjection=null,baseDistribution=null,qbFeed=null,qbState={valid:false};
 const testTeam=new URLSearchParams(location.search).get('qb_test');
 let qbHelpers=null;const qbReady=import(new URL('lib-qb-live-board.mjs',document.currentScript.src)).then(x=>qbHelpers=x);
 let availabilityHelpers=null;const availabilityReady=import(new URL('lib-player-prop-availability.mjs',document.currentScript.src)).then(x=>availabilityHelpers=x);
 let currentSchedule=null;
 let publishedSnapshots=null;
 let snapshots=null,recs=null,personnel=null,error='',market='all',game='all',busy=false,visibleLimit=36;
 let personnelIndex=new Map();
 function indexPersonnel(){personnelIndex=new Map();for(const t of Object.values(personnel?.teams||{}))for(const p of t.players||[]){const k=key(p.name||p.player);if(!personnelIndex.has(k))personnelIndex.set(k,[]);personnelIndex.get(k).push({...p,captured_at:t.captured_at||personnel.captured_at});}}
 const key=n=>String(n||'').toLowerCase().normalize('NFKD').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
 window.CTD_PLAYER_PORTRAIT=(name,id,position)=>{const matches=(personnelIndex.get(key(name))||[]).filter(p=>!position||p.position===position);id=id||(matches.length===1?matches[0].athlete_id:null);const initials=String(name).split(' ').map(w=>w[0]).slice(0,2).join('');return `<span class="ctdPortrait"><span>${esc(initials)}</span>${/^\d+$/.test(String(id||''))?`<img loading="lazy" src="https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png" alt="${esc(name)}">`:''}</span>`;};
 document.addEventListener('error',e=>{if(e.target.matches?.('.ctdPortrait img'))e.target.remove();},true);
 const nav=document.getElementById('nav'),gamesButton=nav.querySelector('[data-page="gamesPage"]');
 const propsButton=document.createElement('button');propsButton.dataset.page='propsPage';propsButton.textContent='PROPS';gamesButton.after(propsButton);
 const page=document.createElement('section');page.id='propsPage';page.className='page content';page.innerHTML='<div class="ctdPropsHeading"><div><p>PLAYER MARKETS</p><div class="ctdPropsTitle"><h1>Props</h1><span id="propsWeek">Loading current week…</span></div></div></div>';
 document.getElementById('gamesPage').after(page);const panel=document.querySelector('[data-bet-panel="props"]');panel.classList.remove('betView');page.append(panel);document.querySelector('[data-bet-view="props"]')?.remove();
 function currentPropWeek(...feeds){for(const feed of feeds){const week=Number(feed?.week);if(Number.isInteger(week)&&week>=1&&week<=18)return week;}return null;}
 let chosenWeek=null;
 function syncWeek(){chosenWeek=currentPropWeek(currentSchedule,gameMarkets,recs,projection);page.querySelector('#propsWeek').textContent=chosenWeek===null?'Loading current week…':`Week ${chosenWeek}`;}
 propsButton.addEventListener('click',()=>{showPage('propsPage',propsButton);void refresh();});
 function boardRows(ledger,recommendations,week){
  const live=Array.isArray(ledger?.quotes);if(live)ledger=liveHelpers?.livePropSnapshots(ledger,{schedule:currentSchedule,week,personnel,recs:recommendations})||{snapshots:[]};
  ledger={snapshots:[...(ledger?.snapshots||[]),...(publishedSnapshots?.season===2026?(publishedSnapshots.snapshots||[]).filter(q=>Date.parse(q.kickoff)>Date.now()):[])]};
  const evaluations=new Map(),exactQuotes=new Map();
  for(const p of Object.values(recommendations?.players||{}))for(const e of p.weekly?.evaluations||[])if(Number(e.week)===Number(week)){evaluations.set(e.snapshot_id,e);if(Date.now()-Date.parse(e.captured_at)<=150*60000&&Date.parse(e.captured_at)<=Date.now()+300000)exactQuotes.set(liveHelpers?.evaluatedQuoteKey(e),e);}
  const byBook=new Map();
  for(const s of ledger?.snapshots||[]){
   if(s.horizon!=='WEEKLY'||Number(s.week)!==Number(week)||!s.game_id||!Number.isFinite(Date.parse(s.captured_at)))continue;
   if(Date.parse(s.kickoff)>Date.now()&&(Date.now()-Date.parse(s.captured_at)>150*60000||Date.parse(s.captured_at)>Date.now()+300000))continue;
   const k=[s.game_id,s.player,s.stat,s.book].join('|'),old=byBook.get(k);
   if(!old||Date.parse(s.captured_at)>Date.parse(old.captured_at))byBook.set(k,s);
  }
  const grouped=new Map();
  for(const s of byBook.values()){
   const k=[s.game_id,s.player,s.stat].join('|');if(!grouped.has(k))grouped.set(k,[]);
   const original=(live?exactQuotes.get(liveHelpers?.propEvaluationKey(s)):evaluations.get(s.snapshot_id))||propModel?.evaluateCurrentProp(s,{projection,distribution,schedule:currentSchedule,availability:window.CTD_PROP_AVAILABILITY?.(s.player,s.week),policy:propPolicy})||null;
   grouped.get(k).push({...s,evaluation:qbHelpers?qbHelpers.liveQBQuote(s,original,qbState):original});
  }
  return [...grouped.values()].map(books=>books.sort((a,b)=>Date.parse(b.captured_at)-Date.parse(a.captured_at)||a.book.localeCompare(b.book))).sort((a,b)=>a[0].player.localeCompare(b[0].player)||a[0].stat.localeCompare(b[0].stat));
 }
 window.CTD_PROP_BOARD_ROWS=boardRows;
 window.CTD_PROP_AVAILABILITY=(name,week)=>{
  if(!availabilityHelpers)return null;
  const match=personnelIndex.get(key(name))||[];
  const roster=match.length===1?match[0]:null;
  const cp=Number(context?.week)===Number(week)?context.players?.[name]:null;
  const team=roster?.team||cp?.signals?.role?.evidence?.team;
  const g=Number(currentSchedule?.week)===Number(week)?Object.values(currentSchedule.games||{}).find(g=>[g.home_team,g.away_team].includes(team)):null;
  const fresh=Date.now()-Date.parse(availabilityFeed?.observed_at)<=30*60000&&Date.parse(availabilityFeed?.observed_at)<=Date.now()+300000;
  const official=(availabilityFeed?.games||[]).find(x=>x.team===team&&String(x.event_id)===String(g?.provider_event_id||g?.event_id));
  const injury=fresh?(availabilityFeed?.injuries||[]).find(x=>(x.athlete_id&&x.athlete_id===String(roster?.athlete_id))||x.team===team&&key(x.name)===key(name)):null;
  const scenario=Object.values(qbFeed?.scenarios||{}).find(s=>s.team===team&&s.game_id&&Date.parse(s.kickoff)>Date.now());
  if(qbState.valid&&scenario?.status==='BACKUP_EXPECTED'&&key(scenario.starter)===key(name))return {state:'UNAVAILABLE',can_project:false,label:qbFeed.simulation?'TEST: starter unavailable':'Starting QB ruled out',reason:'Expected replacement: '+scenario.expected_qb};
  if(qbState.valid&&scenario?.status==='BACKUP_EXPECTED'&&key(scenario.expected_qb)===key(name))return {state:'ASSUMED_STARTER',can_project:true,label:'Assumes '+scenario.expected_qb+' starts',reason:scenario.selection_basis};
  return availabilityHelpers.projectionAvailability({name,context:cp,roster,game:g,official:official?{...official,observed_at:fresh?official.observed_at:null}:null,injury});
 };
 function verdict(s){
  const e=s.evaluation,r=e?.recommendation,q=e?.model;
  const availability=window.CTD_PROP_AVAILABILITY?.(s.player,s.week);
  if(availability?.state==='UNAVAILABLE'&&Date.parse(s.kickoff)>Date.now())return ['Unavailable',availability.label+' · '+availability.reason];
  const pendingQB=Object.values(qbFeed?.scenarios||{}).find(q=>q.game_id===s.game_id&&q.team===s.team&&['BACKUP_EXPECTED','REVIEW_REQUIRED'].includes(q.status));
  if(!e&&qbState.holds?.has(s.game_id+':'+s.team))return ['QB update pending','The starting quarterback is unavailable; waiting for the replacement projection.'];
  if(!e&&pendingQB)return ['QB update pending',pendingQB.reason||'Waiting for the matching quarterback-adjusted model inputs.'];
  if(!e&&typeof projection!=='undefined'&&projection?.season===2026&&Number(projection.week)===Number(s.week)&&!projection.players?.[s.player])return ['No player projection','Current sportsbook quote. This player is outside the current projection coverage; no model probability is assigned.'];
  if(!e)return ['Model update pending',(availability?.label?availability.label+'. ':'')+'Current sportsbook quote. The model has not evaluated this exact line and price yet.'];
  let pick=e?.model_pick;
  if(!pick&&[q?.over_probability,q?.under_probability,q?.push_probability].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1)&&Math.abs(q.over_probability+q.under_probability+q.push_probability-1)<1e-5){
   pick={side:q.over_probability>q.under_probability?'OVER':q.under_probability>q.over_probability?'UNDER':null,status:q.over_probability===q.under_probability?'EVEN':'AVAILABLE'};
  }
  const model=pick?.side?`MODEL ${pick.side}`:pick?.status==='EVEN'?'MODEL EVEN':'MODEL UNAVAILABLE';
  const direction=pick?.side?`${pick.side} ${s.line}. `:pick?.status==='EVEN'?'The model gives both sides equal probability. ':'A matching projection is unavailable. ';
  if(!Number.isFinite(Date.parse(s.kickoff)))return ['Waiting','We cannot confirm the game time yet.'];
  if(Date.parse(s.kickoff)<=Date.now())return [model,direction+'Betting: closed. This is the forecast saved before kickoff.'];
  const age=Date.now()-Date.parse(s.captured_at);
  if(!Number.isFinite(age)||age<0||age>150*60000)return [model,direction+'Betting: wait for a fresh quote.'];
  if(!availability?.can_project)return [model,availability?.reason||'Availability evidence needs review.'];
  const qb=e.qb_scenario;
  const note=(qb?(qb.restored?'Starter '+qb.expected_qb+' cleared; original projection restored. ':'Assumes '+qb.expected_qb+' starts. '):availability.label+'. ');
  if(qb)return [model,note+direction+(availability.state==='INJURY_CONCERN'?availability.label+'. ':'')+'Updated for the quarterback change; assumes the listed quarterback starts.'];
  if(availability.state==='INJURY_CONCERN')return [model,note+direction+'Injury concern remains.'];
  if(r?.decision==='WAIT')return [model,note+direction+'Projection shown under this availability assumption.'];
  if(r?.decision==='PICK')return [model,note+direction+`Betting: recommended ${r.side} at this quote · analysis only.`];
  return [model,note+direction+(r?.decision==='PASS'?'Betting: pass. We do not see enough value at this price.':'Betting recommendation unavailable.')];
 }
 function explanation(s){
  const extra=supplementalFeed?.players?.[s.player],extraStat=extra?.projection?.projections?.[s.stat];
  if(extraStat&&projection?.players?.[s.player]===extra.projection&&Date.parse(extra.kickoff)>Date.now()){
   const n=x=>Number(x).toFixed(1);
   return '<details><summary>Numbers and sources</summary><p>Recent receiving usage model · '+esc(extra.sample.length)+' completed 2026 games.</p><p>Projected '+esc(label(s.stat))+': '+n(extraStat.mean)+' · Floor (10th percentile): '+n(extraStat.floor)+' · Median: '+n(extraStat.median)+' · Ceiling (90th percentile): '+n(extraStat.ceiling)+'.</p><p>More recent games carry more weight (0.8 per older game). Predictive uncertainty includes the limited sample size. Sportsbook prices do not set this projection.</p><p>Saved pregame forecasts are compared with final results and update the next weekly fit.</p><a href="'+esc(extra.source_url)+'" target="_blank" rel="noopener">ESPN game logs</a></details>';
  }
  const e=s.evaluation;if(!e)return '';
  const matches=d=>d?.season===2026&&Number(d.week)===Number(s.week);
  if(!matches(projection)||!matches(distribution))return e.show_work?.reader?window.CTD_FORMATTED_WORK?.(e.show_work)||'':'';
  const pp=projection.players?.[s.player],cp=matches(context)&&context.sportsbook_inputs_used===false?context.players?.[s.player]:null;
  const qbNote=e.qb_scenario?'<p class="ctdQBNote">QB update: assumes '+esc(e.qb_scenario.expected_qb)+(e.qb_scenario.restored?' starts again after clearance':' starts in place of '+esc(e.qb_scenario.starter))+'. Updated '+esc(date(e.qb_scenario.updated_at))+'.</p>':'';
  const signals=Object.entries(cp?.signals||{}).map(([kind,x])=>({kind,...x}));
  const team=cp?.signals?.role?.evidence?.team;
  const work=window.CTD_SHOW_WORK?.propWork(e,window.CTD_SHOW_WORK.propStat(distribution.distributions?.[s.player]?.distributions,s.stat),window.CTD_SHOW_WORK.propStat(pp?.projections,s.stat),signals,Object.fromEntries(['attempts','targets','carries','routes','snaps'].map(k=>[k,pp?.projections?.[k]?.mean])),Date.now(),matches(gameMarkets)?window.CTD_SHOW_WORK.teamEnvironment(gameMarkets.games,team,s.week):null);
  if(work?.reader){const [state,reason]=verdict(s);if(!reason.includes('Betting: recommended'))work.reader.verdict=reason;}
  return qbNote+(window.CTD_FORMATTED_WORK?.(work)||'');
 }
 function probabilities(s){const m=s.evaluation?.model;if(!m)return '';const pct=p=>(100*p).toFixed(1)+'%';return '<p class="ctdPropProbabilities">Model chance · Over '+esc(pct(m.over_probability))+' · Under '+esc(pct(m.under_probability))+(m.push_probability>0?' · Push '+esc(pct(m.push_probability)):'')+'</p>';}
 function bookRow(s){const [state,reason]=verdict(s);return `<div class="ctdPropBook"><b>${esc(s.provider_book_title||s.book)}</b><span>Line ${esc(s.line)} · Over ${esc(price(s.over_price))} / Under ${esc(price(s.under_price))}</span><span>${esc(state)} · ${esc(reason)}</span><small>Quote ${esc(date(s.captured_at))}</small></div>`;}
 function render(){return window.CTD_READING.preserve(document.getElementById('propsPage'),renderData);}
function renderData(){
  const mount=document.querySelector('[data-bet-panel="props"]');if(!mount)return;
  const week=chosenWeek,rows=boardRows(snapshots,recs,week),games=[...new Set(rows.map(a=>a[0].game_id))].sort(),stats=[...new Set(rows.map(a=>a[0].stat))].sort();
  if(!games.includes(game))game='all';if(!stats.includes(market))market='all';
  const visible=rows.filter(a=>!(Date.parse(a[0].kickoff)>Date.now()&&window.CTD_PROP_AVAILABILITY?.(a[0].player,a[0].week)?.state==='UNAVAILABLE')).filter(a=>(game==='all'||a[0].game_id===game)&&(market==='all'||a[0].stat===market));
  mount.innerHTML=`<div class="panel">${qbFeed?.simulation?'<p class="ctdQBTest"><b>TEST SCENARIO — '+esc(qbFeed.simulation_starter)+' unavailable.</b> Not an official report. For illustration only.</p>':''}${Object.values(qbFeed?.scenarios||{}).filter(q=>q.status==='BACKUP_EXPECTED'&&(game==='all'||q.game_id===game)).map(q=>'<p class="ctdQBNote"><b>QB update · '+esc(q.team)+': '+esc(q.expected_qb)+'</b> is the expected replacement for '+esc(q.starter)+'. Receiver projections '+(qbState.valid?'updated':'awaiting an update')+'. '+esc(q.backup_projection?.historical_games===0?'Limited NFL playing history.':'')+'</p>').join('')}<p class="ctdPropUpdate">${rows.length?`Latest quote update ${esc(date(new Date(Math.max(...rows.flatMap(books=>books.map(s=>Date.parse(s.captured_at))))).toISOString()))}`:"Waiting for published quotes"}</p>${error?`<p class="copy">${esc(error)}</p>`:''}<div class="ctdPropFilters"><label>Matchup <select data-prop-game><option value="all">All games</option>${games.map(g=>`<option value="${esc(g)}" ${g===game?'selected':''}>${esc(g.replace(/^\d+-W\d+-/,''))}</option>`).join('')}</select></label><label>Stat <select data-prop-stat><option value="all">All stats</option>${stats.map(s=>`<option value="${esc(s)}" ${s===market?'selected':''}>${esc(label(s))}</option>`).join('')}</select></label></div><p class="copy">${visible.length} player markets · Showing ${Math.min(visible.length,visibleLimit)}</p><div class="ctdPropGrid">${visible.slice(0,visibleLimit).map(books=>{
   const s=books[0],[state,reason]=verdict(s);
   return `<article class="ctdPropCard"><div class="ctdPropTitle"><button class="ctdPropIdentity" data-profile="${esc(s.player)}">${window.CTD_PLAYER_PORTRAIT(s.player,null,s.position)}<span>${esc(s.player)}</span></button><strong>${esc(state)}</strong></div><p>${esc(s.game_id.replace(/^\d+-W\d+-/,''))} · ${esc(label(s.stat))}</p><div class="ctdPropLine">${esc(s.line)} <span>${esc(label(s.stat))}</span></div><div class="ctdPropPrices"><span>OVER <b>${esc(price(s.over_price))}</b></span><span>UNDER <b>${esc(price(s.under_price))}</b></span></div>${reason?`<p>${esc(reason)}</p>`:""}${probabilities(s)}${explanation(s)}<small>${esc(s.provider_book_title||s.book)} · Quote ${esc(date(s.captured_at))}</small>${books.length>1?`<details><summary>Compare ${books.length} sportsbooks</summary>${books.map(bookRow).join('')}</details>`:''}</article>`;
  }).join('')}</div>${visible.length>visibleLimit?'<button type="button" class="btn" data-prop-more>Show 36 more markets</button>':''}${!visible.length?`<p class="copy">${snapshots?'No sportsbook prop lines are available for this week and filter.':'Loading sportsbook prop lines…'}</p>`:''}</div>`;
 }
 async function refresh(){if(busy)return;busy=true;try{
  await Promise.all([liveReady,availabilityReady,qbReady,propModelReady,supplementReady]);
  const results=await Promise.allSettled(['/api/live/prop-quotes','data/market/player-prop-board-model-2026.json','data/ingestion/team-personnel-2026.json','data/probability/weekly-projection-inputs-2026.json','data/probability/generated/weekly-probability-distributions-2026.json','data/probability/weekly-football-context-inputs-2026.json','data/market/weekly-game-market-recommendations-2026.json','data/calibration/weekly-event-schedule-2026.json','/api/live/availability','/api/live/qb-projections'+(testTeam?'?verify='+encodeURIComponent(testTeam):''),'data/sources/player-prop-recommendation-layer-2026.json','data/market/player-prop-board-quotes-2026.json','/cloudflare/api/published/frontend/ctd-cloudflare-work/data/market/player-prop-board-quotes-2026.json','data/market/supplemental-weekly-props-2026.json'].map(async path=>{const r=await fetch(path.startsWith('/')?path:RAW+path+'?refresh='+Math.floor(Date.now()/300000),{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!r.ok){if(['data/market/player-prop-board-quotes-2026.json','data/market/player-prop-board-model-2026.json','data/market/supplemental-weekly-props-2026.json'].includes(path)){const fallback=await fetch('/cloudflare/api/published/frontend/ctd-cloudflare-work/'+path,{cache:'no-store'});if(fallback.ok)return fallback.json();}throw Error('HTTP '+r.status);}return r.json();}));
  if(results[0].status==='fulfilled')snapshots=results[0].value;if(results[1].status==='fulfilled')recs=results[1].value;
  if(results[2].status==='fulfilled'){personnel=results[2].value;indexPersonnel();}
  if(results[3].status==='fulfilled')baseProjection=results[3].value;if(results[4].status==='fulfilled')baseDistribution=results[4].value;if(results[5].status==='fulfilled')context=results[5].value;if(results[6].status==='fulfilled')gameMarkets=results[6].value;
  if(results[7].status==='fulfilled')currentSchedule=results[7].value;
  if(results[8].status==='fulfilled')availabilityFeed=results[8].value;
  if(results[9].status==='fulfilled')qbFeed=results[9].value;
  if(results[10].status==='fulfilled')propPolicy=results[10].value.recommendation_policy;
  const published=results.slice(11,13).filter(r=>r.status==='fulfilled'&&r.value?.season===2026).map(r=>r.value);
  if(published.length)publishedSnapshots={season:2026,snapshots:published.flatMap(f=>f.snapshots||[])};
  qbState=qbHelpers.applyLiveQBFeed({projection:baseProjection,distribution:baseDistribution,feed:qbFeed,availability:availabilityFeed});
  projection=qbState.projection;distribution=qbState.distribution;
  if(results[13]?.status==='fulfilled')supplementalFeed=results[13].value;
  const blockedTeams=Object.values(qbFeed?.scenarios||{}).filter(q=>['BACKUP_EXPECTED','REVIEW_REQUIRED'].includes(q.status)).map(q=>q.team);
  const merged=(await supplementReady).mergeSupplemental(projection,distribution,supplementalFeed,{week:currentSchedule?.week,blockedTeams});
  projection=merged.projection;distribution=merged.distribution;
  window.CTD_QB_PROJECTION_FOR=(name,base)=>{if(!qbState.valid)return base;const team=context?.players?.[name]?.signals?.role?.evidence?.team,scenario=Object.values(qbFeed?.scenarios||{}).find(s=>s.team===team&&Date.parse(s.kickoff)>Date.now());if(qbState.holds?.has(scenario?.game_id+':'+team)||scenario?.status==='REVIEW_REQUIRED'&&scenario.report?.out)return {...base,status:'REVIEW_REQUIRED',projections:{},reason:scenario.reason};const p=qbState.projection.players?.[name]||base;return qbFeed.simulation?{...p,qb_simulation:true}:p;};
  window.dispatchEvent(new CustomEvent('ctd:qb-projections',{detail:{valid:qbState.valid,feed:qbFeed}}));
  window.dispatchEvent(new Event('ctd:availability-updated'));
  error=results.slice(0,2).some(r=>r.status==='rejected')?'The current quote feed could not refresh. We retain original observation times and do not present expired prices as current.':'';
 }finally{busy=false;syncWeek();render();}}
 document.addEventListener('click',e=>{if(e.target.closest('[data-prop-more]')){visibleLimit+=36;render();}});
 document.addEventListener('change',e=>{if(e.target.matches('[data-prop-game]'))game=e.target.value;else if(e.target.matches('[data-prop-stat]'))market=e.target.value;else return;visibleLimit=36;render();});
 document.addEventListener('ctd:games-ready',()=>{syncWeek();render();});
 const style=document.createElement('style');style.textContent='.ctdQBNote{padding:10px;border-left:3px solid #7fb8ff;background:#13283a;font-size:12px}.ctdQBTest{padding:12px;border:2px solid #f2c66e;background:#3a2b10;color:#ffe1a3}.ctdPropsHeading{margin:14px 0 20px}.ctdPropsTitle{display:flex;align-items:center;gap:14px;flex-wrap:wrap}.ctdPropsHeading #propsWeek{font-size:13px;font-weight:600;line-height:1.4;color:#bdd5ed;background:#102138;border:1px solid #2b4662;border-radius:6px;padding:5px 9px;white-space:nowrap}.ctdPropsHeading h1{font-size:36px;margin:0}.ctdPropsHeading p{margin:0 0 6px;color:#85baff;letter-spacing:.15em;font-size:11px}.ctdPropsHeading select{background:#102138;color:white;padding:10px;border:1px solid #355172;border-radius:8px}.ctdPropUpdate{font-size:12px;color:#9fb5cc}.ctdPropIdentity{display:flex;align-items:center;gap:12px;background:none;border:0;color:#fff;text-align:left;font:inherit;font-size:17px;font-weight:700;cursor:pointer;padding:0}.ctdPortrait{display:inline-flex;position:relative;align-items:center;justify-content:center;flex-shrink:0;width:62px;height:62px;border-radius:14px;overflow:hidden;background:#203c5a;color:#9ccaff}.ctdPortrait img{position:absolute;width:100%;height:100%;object-fit:cover;background:#203c5a}.ctdProfileHero{display:flex;align-items:center;gap:20px;margin:22px 0}.ctdProfileHero .ctdPortrait{width:100px;height:100px}.ctdProfileHero h2{margin:0;font-size:30px}#propsPage{padding-top:10px}'+'.ctdPropFilters{display:flex;gap:16px;flex-wrap:wrap;margin:16px 0}.ctdPropFilters label{font-size:13px;color:#afc3da}.ctdPropFilters select{background:#102138;color:#fff;border:1px solid #34516f;border-radius:6px;padding:8px;margin-left:8px}.ctdPropGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:14px}.ctdPropCard{padding:18px;background:#101f30;border:1px solid #2b4662;border-radius:10px}.ctdPropTitle{display:flex;align-items:start;justify-content:space-between;gap:12px}.ctdPropTitle h3{font-size:18px!important;margin:0}.ctdPropTitle>strong{font-size:10px;color:#f2c66e;letter-spacing:.07em}.ctdPropCard p,.ctdPropCard small{font-size:12px;color:#a8bdd3;line-height:1.6}.ctdPropLine{font-size:30px;font-weight:800;margin:14px 0}.ctdPropLine span{font-size:13px;color:#afc3da;font-weight:400}.ctdPropPrices{display:flex;gap:24px;font-size:12px;color:#a8bdd3}.ctdPropPrices b{font-size:18px;color:#fff;margin-left:8px}.ctdPropCard summary{font-size:12px;color:#82bfff;cursor:pointer;margin-top:16px}.ctdPropBook{display:grid;gap:4px;border-top:1px solid #284059;margin-top:12px;padding-top:10px;font-size:12px;color:#a8bdd3}';document.head.appendChild(style);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&page.classList.contains('active'))void refresh();});
 render();void refresh();setInterval(()=>{if(!document.hidden)void refresh();},60000);
})();


