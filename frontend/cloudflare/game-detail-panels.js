(function(root){
 'use strict';
 const CSS='.ctdLegacyPicks{display:none!important}#gamesPage .grid3{grid-template-columns:1fr 1fr}#ctdMarketsSummary{margin:16px 0}.ctdMarketTiming{font-size:12px;color:#b2cce7;margin-bottom:12px}.ctdMarketTop{display:grid;grid-template-columns:1fr 2fr;gap:20px;border-bottom:1px solid #294a68;padding-bottom:16px}.ctdMarketTop span,.ctdMarketCard span{display:block;font-size:12px;color:#b2cce7;margin:9px 0 5px}.ctdMarketTop strong{display:block;font-size:20px;line-height:1.4}.ctdMarketTop small,.ctdMarketCard small{display:block;font-size:11px;line-height:1.5;color:#a8bdd3}.ctdMarketCards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:16px}.ctdMarketCard{background:#0b1c2d;border:1px solid #294a68;border-radius:8px;padding:14px}.ctdMarketCard h3{font-size:14px;margin:0 0 12px}.ctdMarketCard strong{font-size:16px;line-height:1.5;display:block}.ctdMarketMetrics{font-size:12px;line-height:1.8;margin:12px 0}.ctdValueYes{color:#56de95}.ctdMarketNote{font-size:12px;line-height:1.6;color:#a8bdd3;margin-bottom:0}@media(max-width:640px){.ctdMarketTop,.ctdMarketCards,#gamesPage .grid3{grid-template-columns:1fr}}\n';
 const UPSET_CSS='.ctdUpsetPanel{margin-top:16px;padding:14px;border:1px solid #294a68;border-radius:8px;background:#0b1c2d}.ctdUpsetPanel h3{font-size:13px;margin:0 0 12px}.ctdUpsetGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.ctdUpsetGrid span,.ctdUpsetGrid small{display:block;color:#a8bdd3;font-size:11px;line-height:1.5}.ctdUpsetGrid strong{display:block;font-size:19px;margin:5px 0}.ctdUpsetCompare,.ctdUpsetPanel details{font-size:12px;line-height:1.7;margin-top:12px}.ctdUpsetPanel summary{cursor:pointer;color:#a9d1ff}.ctdUpsetPanel p{font-size:12px;line-height:1.7}@media(max-width:640px){.ctdUpsetGrid{grid-template-columns:1fr}}';
 const kinds=['spread','total','moneyline'];
 const finite=x=>typeof x==='number'&&Number.isFinite(x);
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const pct=x=>finite(x)?(100*x).toFixed(1)+'%':'Unavailable';
 const odds=x=>finite(x)?(x>0?'+':'')+x:'Odds unavailable';
 const names={spread:'Spread',total:'Total',moneyline:'Moneyline'};
 const signed=x=>(x>0?'+':'')+x;
 function direction(kind,e,s,g){
  if(e?.model_prediction?.selection)return e.model_prediction;
  const a=e?.side_a?.conditional_win_probability,b=e?.side_b?.conditional_win_probability;
  if(!finite(a)||!finite(b))return null;
  if(Math.abs(a-b)<1e-9)return {selection:'No statistical preference',probability:a};
  const home=a>b,m=e.quote||s?.market||{};
  const selection=kind==='moneyline'?(home?g.home_team:g.away_team)+' ML':kind==='total'?(finite(m.total)?(home?'OVER ':'UNDER ')+m.total:null):finite(m.home_spread)?(home?g.home_team:g.away_team)+' '+signed(home?m.home_spread:-m.home_spread):null;
  return selection?{selection,probability:Math.max(a,b)}:null;
 }
 let comparisons={},current={};
 try{const saved=JSON.parse(root.localStorage?.getItem('ctdSavedGameComparisons2026')||'null');if(saved?.season===2026)comparisons=saved.games||{};}catch{}
 function setCurrent(payload){current=payload?.games||{};
  for(const [id,g] of Object.entries(current)){if(!(Date.parse(g.kickoff)<=Date.now()))continue;const qs=(g.snapshot_evaluations||[]).filter(q=>q.eligible_for_current_recommendation&&Date.parse(q.captured_at)<=Date.parse(g.kickoff)).sort((a,b)=>Date.parse(b.captured_at)-Date.parse(a.captured_at));const q=qs.find(q=>q.book==='draftkings')||qs[0];if(!q)continue;const keys=['model_version','model_prediction','side_a','side_b','fair_market','recommendation','quote','context_validation','football_source','value_policy','thresholds'];const markets=Object.fromEntries(Object.entries(q.markets||{}).map(([k,m])=>[k,Object.fromEntries(Object.entries(m).filter(([key])=>keys.includes(key)))]));comparisons[id]={week:g.week,away_team:g.away_team,home_team:g.home_team,kickoff:g.kickoff,football_projection:g.football_projection,rerun:g.rerun,model_version:g.model_version,model_predictions:g.model_predictions,snapshot_evaluations:[{snapshot_id:q.snapshot_id,book:q.book,captured_at:q.captured_at,market:q.market,eligible_for_current_recommendation:true,markets}]};}
  try{root.localStorage?.setItem('ctdSavedGameComparisons2026',JSON.stringify({season:2026,games:comparisons}));}catch{}
 }
 function setComparisons(payload){if(['RECONSTRUCTED_NOT_LIVE','SAVED_GAME_COMPARISONS'].includes(payload?.kind))comparisons={...comparisons,...payload.games};}
 function resolve(g){if(g?.snapshot_evaluations?.length)return g;return Object.values({...comparisons,...current}).find(x=>x.home_team===g?.home_team&&x.away_team===g?.away_team&&Date.parse(x.kickoff)===Date.parse(g?.kickoff||g?.event_start))||g;}

 const implied=o=>o<0?-o/(100-o):100/(100+o);
 const validOdds=o=>finite(o)&&Math.abs(o)>=100;
 function upset(g,s,now=Date.now()){
  g=resolve(g);const start=Date.parse(g?.kickoff||g?.event_start),started=Number.isFinite(start)&&start<=now;
  if(!s){const qs=(g?.snapshot_evaluations||[]).filter(q=>q.eligible_for_current_recommendation===true&&Date.parse(q.captured_at)<start).sort((a,b)=>Date.parse(b.captured_at)-Date.parse(a.captured_at));s=qs.find(q=>String(q.book).toLowerCase()==='draftkings')||qs[0]||g?.reconstruction&&g.snapshot_evaluations?.[0];}
  const e=s?.markets?.moneyline,m=e?.quote||s?.market||{};
  const h=e?.side_a?.offered_odds??m.home_moneyline,a=e?.side_b?.offered_odds??m.away_moneyline;
  if(!validOdds(h)||!validOdds(a))return {ready:false,status:'Awaiting moneyline and model'};
  const ih=implied(h),ia=implied(a);
  if(Math.abs(ih-ia)<1e-12)return {ready:false,pickem:true,status:'Pick’em · no sportsbook underdog'};
  const home=ih<ia,side=home?e?.side_a:e?.side_b,team=home?g.home_team:g.away_team,price=home?h:a;
  const fair=(home?ih:ia)/(ih+ia),breakEven=implied(price),at=e?.quote?.captured_at||s?.captured_at;
  const win=side?.win_probability,loss=side?.loss_probability,tie=side?.push_probability,p=side?.conditional_win_probability;
  const quotedHome=e?.quote?.home_moneyline,quotedAway=e?.quote?.away_moneyline;
  const pricesMatch=(!finite(quotedHome)||quotedHome===h)&&(!finite(quotedAway)||quotedAway===a);
  const valid=[win,loss,tie,p].every(x=>finite(x)&&x>=0&&x<=1)&&Math.abs(win+loss+tie-1)<1e-5&&1-tie>0&&Math.abs(win/(1-tie)-p)<1e-5;
  const contextFresh=started||!e?.football_source?.generated_at||(now-Date.parse(e.football_source.generated_at)>=0&&now-Date.parse(e.football_source.generated_at)<=30*60000);
  const modelHeld=e?.context_validation?.status==='HOLD'||!contextFresh||(!started&&e?.model_version!=='ctd-football-moneyline-v1');
  if(!valid||modelHeld||!pricesMatch)return {ready:false,team,price,status:'Awaiting current model inputs'};
  const profit=price>0?price/100:100/-price,calculatedEV=win*profit-loss,calculatedEdge=p-fair;
  if(finite(side.expected_value)&&Math.abs(side.expected_value-calculatedEV)>1e-6*(profit+2)||finite(side.probability_edge)&&Math.abs(side.probability_edge-calculatedEdge)>2e-6)return {ready:false,team,price,status:'Awaiting consistent model inputs'};
  const ev=finite(side.expected_value)?side.expected_value:calculatedEV,edge=finite(side.probability_edge)?side.probability_edge:calculatedEdge;
  const policy=e?.value_policy||{},minimumEdge=finite(policy.minimum_probability_edge)?policy.minimum_probability_edge:.03,minimumEV=finite(policy.minimum_expected_value)?policy.minimum_expected_value:.02;
  const historical=started&&g?.reconstruction?.book_verified===true&&g.reconstruction.historical_prices===true;
  const validAt=Number.isFinite(Date.parse(at))&&Date.parse(at)<start&&Date.parse(at)<=now;
  const freshQuote=started||validAt&&now-Date.parse(at)<=6*3600000;
  const held=e?.recommendation?.decision==='WAIT'||!(validAt||historical)||!freshQuote;
  const qualifies=!held&&ev>0&&edge>=minimumEdge&&ev>=minimumEV;
  return {ready:true,team,price,probability:win,conditionalProbability:p,tie,marketProbability:fair,breakEven,edge,ev,profit,minimumEdge,minimumEV,qualifies,held,started,book:e?.quote?.book||s?.book||'',at,status:held?'Awaiting current quote / inputs':qualifies?'Value':ev>0?'Positive EV · below betting threshold':'No value'};
 }
 function underdogValueLabel(u){
  if(!u?.ready)return u?.status||'Awaiting moneyline and model';
  const status=u.held?'Waiting for current inputs':u.qualifies?'Positive value':u.ev>0?'Below betting threshold':'No value';
  const profit=(u.ev<0?'−':u.ev>0?'+':'')+'$'+Math.abs(u.ev*100).toFixed(2);
  return u.team+' ML '+odds(u.price)+' · '+status+' · '+profit+' per $100';
 }
 function upsetMarkup(u,started){
  if(!u?.ready)return `<section class="ctdUpsetPanel"><h3>UPSET PROBABILITY</h3><p>${esc(u?.team?u.team+' · ':'')}${esc(u?.status||'Awaiting moneyline and model')}</p></section>`;
  const ev=(u.ev>0?'+':'')+(100*u.ev).toFixed(1)+'%',quote=u.at?new Date(u.at).toLocaleString('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' CT':'Historical odds';
  return `<section class="ctdUpsetPanel"><h3>${started?'PREGAME ':''}UPSET PROBABILITY &amp; UNDERDOG VALUE</h3><div class="ctdUpsetGrid"><div><span>Sportsbook underdog</span><strong>${esc(u.team)} ${esc(odds(u.price))}</strong><small>${esc(u.book)} · ${esc(quote)}</small></div><div><span>Chance to win outright</span><strong>${esc(pct(u.probability))}</strong><small>Tie chance ${esc(pct(u.tie))}</small></div><div><span>${started?'Pregame underdog value':'Underdog moneyline value'}</span><strong class="${u.qualifies?'ctdValueYes':''}">${esc(underdogValueLabel(u))}</strong><small>Expected profit per $100: ${esc((u.ev<0?"−":u.ev>0?"+":"")+"$"+Math.abs(u.ev*100).toFixed(2))} · Edge: ${esc((u.edge>0?"+":"")+(100*u.edge).toFixed(1))} pp</small></div></div><details data-reading-key="upset"><summary>How upset probability and value are measured</summary><div class="ctdUpsetCompare">Decided-game win chance: <b>${esc(pct(u.conditionalProbability))}</b> · Market without margin: <b>${esc(pct(u.marketProbability))}</b> · Break-even at ${esc(odds(u.price))}: <b>${esc(pct(u.breakEven))}</b> · Edge: <b>${esc((100*u.edge).toFixed(1))} percentage points</b></div><p>An upset is the sportsbook underdog winning outright. The underdog is identified from the two moneyline prices at the quoted sportsbook. Covering a spread is a separate event.</p><p>The upset chance is this team’s outright win probability from the selected moneyline forecast for this game. A tie is not an upset. For upcoming games, the current football model uses performance, quarterback and injury availability, matchup inputs and the existing football-only learning adjustment.</p><p>Moneyline comparisons exclude refunded ties: decided-game win chance = P(win) / [1 − P(tie)]. Market chance removes the margin by dividing the underdog’s implied probability by both teams’ implied probabilities added together. Break-even uses the offered price itself.</p><p>Expected return per $1 = P(win) × profit on a winning $1 bet − P(loss). A refunded tie returns the stake and contributes zero profit. Value qualifies at ${esc((100*u.minimumEdge).toFixed(1))} percentage points of edge and ${esc((100*u.minimumEV).toFixed(1))}% expected return with current verified inputs. No 50% minimum win chance is imposed.</p><p>The sportsbook prices identify the underdog and its payout. The current football forecast is calculated separately; saved pregame forecasts remain as recorded.</p></details></section>`;
 }
 function build(g,s,directions={},meta={},now=Date.now()){
  g=resolve(g);if(!s){const qs=(g?.snapshot_evaluations||[]).filter(q=>q.eligible_for_current_recommendation&&Date.parse(q.captured_at)<=Date.parse(g.kickoff)).sort((a,b)=>Date.parse(b.captured_at)-Date.parse(a.captured_at));s=qs.find(q=>q.book==='draftkings')||qs[0]||(g?.reconstruction?g.snapshot_evaluations?.[0]:null);}
  const kickoff=Date.parse(g?.kickoff||g?.event_start),started=Number.isFinite(kickoff)&&kickoff<=now;
  const rows=kinds.map(kind=>{
   const e=s?.markets?.[kind],rec=e?.recommendation,dir=directions[kind]||direction(kind,e,s,g),quote=e?.quote||{},at=quote.captured_at||s?.captured_at;
   const held=e?.context_validation?.status==='HOLD'||rec?.decision==='WAIT';
   const selectedA=kind==='total'?/^OVER\b/i.test(rec?.selection||''):String(rec?.selection||'').startsWith(g?.home_team+' ');
   let side=selectedA?e?.side_a:e?.side_b,sideA=selectedA;
   if(!rec?.selection&&finite(e?.side_a?.expected_value)&&finite(e?.side_b?.expected_value)){sideA=e.side_a.expected_value>=e.side_b.expected_value;side=sideA?e.side_a:e.side_b;}
   const m=e?.quote||s?.market||{},priceSelection=rec?.selection||(kind==='moneyline'?(sideA?g.home_team:g.away_team)+' ML':kind==='total'?(sideA?'OVER ':'UNDER ')+m.total:(sideA?g.home_team:g.away_team)+' '+signed(sideA?m.home_spread:-m.home_spread));
   const historical=started&&g?.reconstruction?.kind==='RECONSTRUCTED_NOT_LIVE'&&g.reconstruction.data_through_week<g.week&&g.reconstruction.historical_prices===true;
   const metricEV=rec?.decision==='PICK'?rec.expected_value:side?.expected_value,metricEdge=rec?.decision==='PICK'?rec.probability_edge:side?.probability_edge;
   const hasMetrics=!held&&finite(side?.offered_odds)&&finite(metricEV)&&finite(metricEdge);
   const validQuote=Number.isFinite(Date.parse(at))&&Number.isFinite(kickoff)&&Date.parse(at)<kickoff&&Date.parse(at)<=now;
   const eligible=rec?.decision==='PICK'&&!held&&(validQuote||historical)&&finite(rec.expected_value)&&rec.expected_value>0&&finite(side?.offered_odds);
   return {kind,label:names[kind],prediction:held?'On hold':dir?.selection||'Unavailable',probability:held?null:dir?.probability??null,bet:eligible?rec.selection:held?'Wait':rec?.decision==='PASS'?'Pass — no qualifying value':'Unavailable',eligible,ev:hasMetrics?metricEV:null,edge:hasMetrics?metricEdge:null,odds:hasMetrics?side.offered_odds:null,hasMetrics,priceSelection,historical,book:quote.book||s?.book||'',at:at||null,reason:held?'Waiting for complete verified inputs':rec?.decision==='PASS'?'No qualifying value at these odds':!validQuote?'No verified pregame quote':'Model decision unavailable'};
  });
  const candidates=rows.filter(r=>r.eligible).sort((a,b)=>b.ev-a.ev||kinds.indexOf(a.kind)-kinds.indexOf(b.kind));
  const best=candidates[0]||null,tied=best?candidates.filter(r=>Math.abs(r.ev-best.ev)<1e-6):[];
  return {rows,best,tied,started,upset:upset(g,s,now),rerun:meta.rerun===true||!!g?.reconstruction,reconstruction:g?.reconstruction||null,winner:rows[2].prediction,winnerProbability:rows[2].probability};
 }

 const money=x=>finite(x)?(x<0?'−':x>0?'+':'')+'$'+Math.abs(x*100).toFixed(2):'Unavailable';
 let lastRender=null;
 const activeMarket=()=>kinds.includes(root.CTD_ACTIVE_MARKET)?root.CTD_ACTIVE_MARKET:'moneyline';
 function applyMarket(){
  const doc=root.document;if(!doc)return;const kind=activeMarket(),page=doc.getElementById('gamesPage');if(page)page.dataset.activeMarket=kind;
  const win=doc.getElementById('awayProb')?.closest('.panel'),score=doc.getElementById('ctdScoreComparison');
  if(win){win.dataset.ctdMarket='moneyline';if(score&&win.contains(score)){win.before(score);score.classList.add('panel');score.dataset.ctdMarket='total';const title=[...score.querySelectorAll('h3')].find(x=>x.textContent==='CHANCE TO WIN OUTRIGHT');if(title)title.remove();const old=[...win.children].find(x=>x.tagName==='H3');if(old){old.hidden=false;old.textContent='CHANCE TO WIN OUTRIGHT';}}}
  for(const host of doc.querySelectorAll('.lowgrid > .panel')){const title=host.querySelector('h3')?.textContent||'';if(/^SPREAD PROBABILITIES/.test(title))host.dataset.ctdMarket='spread';if(/^TOTAL PROBABILITIES/.test(title))host.dataset.ctdMarket='total';}
  const ml=doc.getElementById('ctdMoneylineMarket');if(ml)ml.dataset.ctdMarket='moneyline';
  for(const host of doc.querySelectorAll('#gamesPage [data-ctd-market]'))host.hidden=host.dataset.ctdMarket!==kind;
 }
 function setMarket(kind){if(!kinds.includes(kind))return;root.CTD_ACTIVE_MARKET=kind;if(root.document)root.document.dispatchEvent(new CustomEvent('ctd:market-selected',{detail:{market:kind}}));}
 function markup(v,kind=activeMarket()){
  if(!kinds.includes(kind))kind='moneyline';
  const r=v.rows.find(r=>r.kind===kind),title={moneyline:'Moneyline',spread:'Spread',total:'Total (Over/Under)'};
  const timing=v.reconstruction?'Historical model comparison':v.rerun?'Updated model comparison':'Model picks';
  const quote=r.historical?r.book+' · historical odds':r.at?new Date(r.at).toLocaleString('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' CT':'Quote unavailable';
  const tabs=['moneyline','spread','total'].map(k=>`<button type="button" data-model-market="${k}" aria-pressed="${kind===k}">${title[k]}</button>`).join('');
  const best=v.best?v.best.label+' · '+v.best.bet:'Pass — no qualifying value bet';
  return `<div class="ctdMarketHeader"><strong>${esc(timing)}</strong><div class="ctdMarketTabs" role="group" aria-label="Model pick market">${tabs}</div></div><article class="ctdMarketCard ctdSelectedMarket" data-selected-market="${kind}"><h3>${title[kind]}</h3><div class="ctdSelectedGrid"><div><span>${kind==='moneyline'?'Model winner':'Model pick'}</span><strong>${esc(r.prediction)}</strong><small>${esc(pct(r.probability))} model chance${kind==='moneyline'?' on decided games':''}</small></div><div><span>${v.started?'Pregame value bet':'Value bet'}</span><strong class="${r.eligible?'ctdValueYes':''}">${esc(r.bet)}</strong><small>Expected profit per $100: <b>${r.hasMetrics?esc(money(r.ev)):'—'}</b></small></div></div><small class="ctdMarketQuote">${r.hasMetrics?esc(r.priceSelection+' · '+odds(r.odds)+' · '+r.book):esc(r.reason)} · ${esc(quote)}</small><details data-reading-key="market-${kind}" class="ctdMarketNote"><summary>Calculation details</summary><p>Model edge: ${finite(r.edge)?esc((100*r.edge).toFixed(1))+' percentage points':'Unavailable'}.</p><p>Expected profit is the model’s average estimated profit or loss per $100 bet, including refunds. A positive payout on a winning bet does not mean a positive expected profit.</p><p>Highest qualifying value across all markets: ${esc(best)}.</p></details></article>${kind==='moneyline'?upsetMarkup(v.upset,v.started):''}<details class="ctdMarketNote" data-reading-key="sources"><summary>Sources</summary>${v.reconstruction?`<p>CTD scoring comparison rebuilt using results through Week ${esc(v.reconstruction.data_through_week)}. The original pregame forecast was not saved.</p>${(v.reconstruction.sources||[]).map(source=>`<p><a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.label)}</a></p>`).join('')}`:'<p>Model picks use their evaluated sportsbook prices. The quote is shown above.</p>'}</details>`;
 }
 function render(g,s,directions,meta){
  lastRender={g,s,directions,meta};const doc=root.document;if(!doc)return;
  let mount=doc.getElementById('ctdMarketsSummary');
  if(!mount){const grid=doc.querySelector('#gamesPage .grid3');if(!grid)return;mount=doc.createElement('section');mount.id='ctdMarketsSummary';mount.className='panel';mount.setAttribute('aria-label','Spread total and moneyline picks');grid.insertAdjacentElement('beforebegin',mount);doc.getElementById('spreadPick')?.closest('.panel')?.classList.add('ctdLegacyPicks');}
  if(!doc.getElementById('ctdMarketPicksStyle')){const style=doc.createElement('style');style.id='ctdMarketPicksStyle';style.textContent=CSS+UPSET_CSS+'.ctdMarketHeader{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px}.ctdMarketTabs{display:flex;gap:4px;padding:3px;background:#081522;border:1px solid #294a68;border-radius:8px}.ctdMarketTabs button{background:none;color:#a8bdd3;border:0;border-radius:5px;padding:9px 13px;font:inherit;font-size:12px;cursor:pointer}.ctdMarketTabs button[aria-pressed=true]{background:#1e4269;color:#fff}.ctdSelectedGrid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.ctdMarketQuote{display:block;margin-top:14px}.ctdSelectedMarket{padding:16px}.ctdSelectedMarket h3{margin:0 0 12px}#gamesPage .grid3{grid-template-columns:1fr!important}#gamesPage [data-ctd-market][hidden]{display:none!important}@media(max-width:600px){.ctdSelectedGrid{grid-template-columns:1fr}.ctdMarketTabs{width:100%}.ctdMarketTabs button{flex:1;padding:8px}}';doc.head.appendChild(style);}
 
  if(!g){mount.innerHTML='<p>Choose a game to see spread, total and moneyline separately.</p>';return;}
  const matchup=[g.home_team,g.away_team,g.kickoff||g.event_start,activeMarket()].join('|');
  const opened=mount.dataset.upsetGame===matchup?[...mount.querySelectorAll('details[open][data-reading-key]')].map(x=>x.dataset.readingKey):[];
  mount.innerHTML=markup(build(g,s,directions,meta));mount.dataset.upsetGame=matchup;
  for(const detail of mount.querySelectorAll('details[data-reading-key]'))if(opened.includes(detail.dataset.readingKey))detail.open=true;
  applyMarket();
 }
 root.CTD_MARKET_PICKS={build,markup,render,setComparisons,setCurrent,comparisonGame:resolve,upset,upsetMarkup,underdogValueLabel,setMarket,getMarket:activeMarket,applyMarket};
 root.document?.addEventListener('click',event=>{const button=event.target.closest?.('[data-model-market]');if(button)setMarket(button.dataset.modelMarket);});
 root.document?.addEventListener('ctd:market-selected',event=>{const kind=event.detail?.market;if(!kinds.includes(kind))return;root.CTD_ACTIVE_MARKET=kind;if(lastRender)render(lastRender.g,lastRender.s,lastRender.directions,lastRender.meta);applyMarket();});
})(globalThis);


(()=>{
  'use strict';
  const RAW='https://raw.githubusercontent.com/brandonlowery013-glitch/-fantasy-2026-player-comparison-/main/';
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
  let issuedHistory=null,pickResults=null,historyError='',markets=null,history=null,scoreboard=null,feedError='',lastKey='',busy=false;
  const games=new Map();
  const style=document.createElement('style');
  style.textContent=`.ctdDetailNote{font-size:12px!important;line-height:1.6!important;color:#a8bdd3;margin:10px 0}.ctdDetailRow{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid #1d314b;font-size:12px;line-height:1.4}.ctdDetailRow b{text-align:right}.ctdDetailPlayer{padding:9px 0;border-bottom:1px solid #1d314b}.ctdDetailPlayer strong{display:block;font-size:14px}.ctdDetailPlayer span{font-size:12px;color:#a8bdd3;line-height:1.5}.ctdDetailColumns{display:grid;grid-template-columns:1fr 1fr;gap:16px}.ctdDetailTableWrap{overflow:auto;max-height:360px}.ctdDetailTable{width:100%;border-collapse:collapse;font-size:12px}.ctdDetailTable th,.ctdDetailTable td{text-align:left;padding:9px;border-bottom:1px solid #263e58;white-space:nowrap}.ctdDetailTable th{color:#a8bdd3}.ctdDetailList{padding-left:18px;font-size:12px;line-height:1.7}.ctdDetailList li{margin:6px 0}.ctdFlowChart{width:100%;height:auto;display:block}.ctdFlowRange{width:100%;accent-color:#72b8ff}.ctdDetailPanel h4{font-size:12px;margin:12px 0 6px;color:#b2cce7}.ctdDetailPanel details summary{font-size:12px;cursor:pointer;padding:10px 0;color:#a9d1ff}.ctdDetailPanel details{margin:6px 0}.ctdPickContext{font-size:11px;line-height:1.5;color:#a8bdd3;max-width:760px;margin-top:10px}.ctdPickContext>span{display:block;margin:5px 0 10px}.ctdWhyPick{margin:8px 0;padding:10px 12px;border:1px solid #294a68;border-radius:8px;background:#0b1c2d}.ctdWhyPick b{color:#dcecff}.ctdWhyPick p{margin:5px 0;color:#c0d2e3}.ctdWhyPick small{color:#829ab2}.ctdWrittenPreview{margin-top:20px;border-top:1px solid #294a68;padding-top:16px;font-size:14px;line-height:1.75;color:#c0d2e3}.ctdPickExplanation{padding:12px 0 16px;border-bottom:1px solid #263e58}.ctdPreviewDecision{font-size:12px;color:#8fb9dd}.ctdWrittenPreview h4{font-size:14px;color:#e0edfa;margin:18px 0 6px}.ctdWrittenPreview p{margin:8px 0 14px}.ctdExternalContext{font-size:11px;line-height:1.5;color:#8fa7bf;max-width:760px;margin-top:8px;padding:10px 12px;border:1px dashed #31485f;border-radius:8px}.ctdExternalContext b{color:#a9bdd1}.ctdExternalContext p{margin:5px 0}#ctdGameTabContent{margin:12px 0;padding:16px;border:1px solid #263e58;border-radius:8px;background:#091524}#ctdGameTabContent[hidden]{display:none}#ctdGameTabContent h3{font-size:14px}.ctdDetailPanel .chart{height:auto}.ctdDetailPanel .kicker{font-size:10px}@media(max-width:600px){.ctdDetailColumns{grid-template-columns:1fr}.ctdDetailTable{font-size:11px}.ctdDetailTable th,.ctdDetailTable td{padding:8px 6px}}`;
  document.head.appendChild(style);

  async function get(url){const r=await fetch(url.startsWith(RAW)?`${url}?refresh=${Math.floor(Date.now()/60000)}`:url,{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`Request failed (${r.status})`);return r.json()}
  function marketGame(g){const live=Number(markets?.week)===Number(BET_FEED.week)?Object.values(markets.games||{}).find(x=>same(x,g)):null;if(live)return live;const saved=window.CTD_MARKET_PICKS?.comparisonGame?.(g);return saved?.snapshot_evaluations?.length?saved:null}
  function pregame(raw){return (raw?.snapshot_evaluations||[]).filter(s=>s.eligible_for_current_recommendation===true&&Date.parse(s.captured_at)<=Date.parse(raw.kickoff)).sort((a,b)=>Date.parse(b.captured_at)-Date.parse(a.captured_at))}
  function snapshot(raw){if(raw?.reconstruction?.kind==='RECONSTRUCTED_NOT_LIVE')return raw.snapshot_evaluations?.[0];const rows=pregame(raw);return rows.find(x=>x.book==='draftkings')||rows[0]}
  function modelDirection(kind,e,s,raw,g){
    const direction=window.CTD_SHOW_WORK?.gameDirectionPrediction(raw||g,s,kind);
    return direction?.selection?direction:null;
  }
  function writtenPreview(g){
    const report=window.CTD_MATCHUP_REPORTS?.get(`${norm(g.away_team)}@${norm(g.home_team)}:${Date.parse(g.kickoff||g.event_start)}`);
    if(!report?.sections?.length)return '<section class="ctdWrittenPreview"><h3>FOOTBALL MATCHUP REPORT</h3><p>Current player and matchup evidence is loading.</p></section>';
    return `<section class="ctdWrittenPreview"><h3>FOOTBALL MATCHUP REPORT</h3>${report.stale?'<p class="ctdDetailNote">Saved football report · Fresh evidence is being checked.</p>':''}${report.sections.map(x=>`<article><h4>${esc(x.title)}</h4><p>${esc(x.text)}</p></article>`).join('')}<details><summary>Football sources · ${esc(date(report.generated_at))}</summary>${(report.sources||[]).map(x=>`<p><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label)}</a>${x.at?' · '+esc(date(x.at)):''}</p>`).join('')}</details></section>`;
  }

  function modelPicks(g){
    const raw=marketGame(g),s=snapshot(raw);window.CTD_MARKET_PICKS?.render(raw||g,s,Object.fromEntries(['spread','total','moneyline'].map(k=>[k,modelDirection(k,s?.markets?.[k],s,raw,g)])),{rerun:markets?.rerun===true});if(!s){let note=document.getElementById('ctdPickContext');if(!note){note=document.createElement('section');note.id='ctdPickContext';note.className='ctdPickContext panel';document.getElementById('spreadPick')?.closest('.grid3')?.insertAdjacentElement('afterend',note)}if(note)note.textContent=raw?.football_projection?'Waiting for current picks and matching sportsbook prices.':'Current picks are unavailable for this matchup.';if(note&&raw?.football_projection){const facts=window.CTD_MATCHUP_REPORTS?.get(`${norm(raw.away_team)}@${norm(raw.home_team)}:${Date.parse(raw.kickoff)}`),review=facts&&window.CTD_MATCHUP_ASSESSMENT?.({kind:'moneyline'},facts);if(review?.sections?.length)note.innerHTML='<h3>OUR MATCHUP ASSESSMENT</h3><p>Waiting for current picks and matching sportsbook prices.</p>'+review.sections.map(x=>`<h4>${esc(x.title)}</h4><p>${esc(x.text)}</p>`).join('')+'<details><summary>Sources</summary>'+review.sources.map(x=>`<p><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label)}</a> ${esc(x.at||'')}</p>`).join('')+'</details>';}if(note)note.innerHTML='<h3>OUR MATCHUP ASSESSMENT</h3><p>Waiting for current picks and matching sportsbook prices.</p>'+writtenPreview(raw||g);for(const id of ['spreadPick','totalPick','mlPick']){const el=document.getElementById(id);if(el){el.textContent='Not published';el.title='Waiting for a matching pregame model snapshot';const badge=el.parentElement.lastElementChild;if(badge!==el)badge.textContent='';}}const edge=document.getElementById('mlEdge'),direction=modelDirection('moneyline',null,null,raw,g);if(direction){const el=document.getElementById('mlPick');if(el){el.textContent=direction.selection;el.title='Football prediction; matching betting prices unavailable';}if(edge)edge.textContent=`${pct(direction.probability)} · ${direction.confidence.toLowerCase()} · bet WAIT`;}else if(edge)edge.textContent='—';return;}
    for(const [kind,id,field] of [['spread','spreadPick','model_spread_pick'],['total','totalPick','total_pick'],['moneyline','mlPick','moneyline_pick']]){
      const r=s.markets?.[kind]?.recommendation,el=document.getElementById(id);if(!el)continue;
      const value=r?.decision==='PICK'?r.selection:r?.decision==='WAIT'?'On hold':r?.decision==='PASS'?'No bet':'Not published';
      const direction=modelDirection(kind,s.markets?.[kind],s,raw,g);
      el.textContent=direction?.selection||value;g[field]=direction?.selection||value;
      el.title=r?.decision==='PASS'?(r.reason||'No side clears the model thresholds'):r?.decision==='PICK'?`Stored pregame model pick · ${date(s.captured_at)}`:'No stored decision';
      if(direction)el.title=`Model prediction: ${direction.selection}, ${pct(direction.probability)}, ${direction.confidence.toLowerCase()} confidence. Betting decision: ${r?.decision||'WAIT'}${r?.selection?' '+r.selection:''}. ${r?.reason||''}`;
      const badge=el.parentElement.lastElementChild;if(badge!==el)badge.textContent=direction&&raw.personnel_matchup&&!raw.moneyline_model&&kind==='moneyline'?`${pct(direction.probability)} · bet WAIT`:direction?`${pct(direction.probability)} · ${direction.confidence.toLowerCase()} · bet ${r?.decision||'WAIT'}${kind==='moneyline'&&r?.decision==='PICK'?' '+r.selection+' · value bet':''}${s.markets?.[kind]?.context_validation?.status==='HOLD'?' · before QB review':''}`:r?.decision==='PICK'&&typeof r.probability_edge==='number'?`${(r.probability_edge*100).toFixed(1)} percentage points`:'';
    }
    const edge=document.getElementById('mlEdge');if(edge&&!modelDirection('moneyline',s.markets?.moneyline,s,raw,g))edge.textContent=s.markets?.moneyline?.recommendation?.decision==='PICK'?pct(s.markets.moneyline.recommendation.probability_edge):'—';
    let note=document.getElementById('ctdPickContext');if(!note){note=document.createElement('section');note.id='ctdPickContext';note.className='ctdPickContext panel';note.style.maxWidth='none';document.getElementById('spreadPick')?.closest('.grid3')?.insertAdjacentElement('afterend',note)}
    note.innerHTML=`<h3>OUR MATCHUP ASSESSMENT</h3>${writtenPreview(raw||g)}`;
    document.getElementById('ctdExternalContext')?.remove();
  }
  function playerRows(d,team,categories){return (d?.player_stats||[]).filter(p=>norm(p.team)===norm(team)&&categories.includes(p.category))}
  function leaders(d,team,defense=false){
    if(defense)return playerRows(d,team,['defensive']).sort((a,b)=>(Number(b.stats?.TOT)||0)-(Number(a.stats?.TOT)||0)).slice(0,3);
    return ['passing','rushing','receiving'].flatMap(category=>playerRows(d,team,[category]).sort((a,b)=>(Number(b.stats?.YDS)||0)-(Number(a.stats?.YDS)||0)).slice(0,1));
  }
  function playerList(rows){return rows.length?rows.map(p=>`<div class="ctdDetailPlayer"><strong>${window.CTD_PLAYER_DETAILS?.nameLink(p.player)||esc(p.player)}</strong><span>${esc(p.team)} · ${esc(p.category)} · ${esc(Object.entries(p.stats||{}).slice(0,6).map(([k,v])=>`${k}: ${v}`).join(' · '))}</span></div>`).join(''):empty('No individual statistics have been reported for this game yet.')}
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
  function settledPick(g,s,kind){
    const rec=s.markets?.[kind]?.recommendation;
    if(rec?.decision==='PASS')return 'PASS · no pick';
    if(rec?.decision!=='PICK')return 'Not published';
    if(g.completed!==true||typeof g.away_score!=='number'||typeof g.home_score!=='number'||!Number.isFinite(g.away_score)||!Number.isFinite(g.home_score))return 'Awaiting final';
    const selection=String(rec.selection||''),market=s.market||{};
    let delta;
    if(kind==='total'){
      if(typeof market.total!=='number'||!Number.isFinite(market.total)||!(/^(OVER|UNDER) /.test(selection)))return 'Unverified selection';
      delta=(g.away_score+g.home_score-market.total)*(selection.startsWith('OVER ')?1:-1);
    }else{
      const team=norm(selection.split(' ')[0]);
      if(team!==norm(g.home_team)&&team!==norm(g.away_team))return 'Unverified selection';
      const home=team===norm(g.home_team);
      if(kind==='spread'&&(typeof market.home_spread!=='number'||!Number.isFinite(market.home_spread)))return 'Missing line';
      delta=(g.home_score-g.away_score+(kind==='spread'?market.home_spread:0))*(home?1:-1);
    }
    return delta>0?'WIN':delta<0?'LOSS':'PUSH';
  }
  function historyHtml(g){
    if(window.ctdRecordedHistory)return window.ctdRecordedHistory(g,issuedHistory,pickResults,historyError);
    const h=Number(history?.week)===Number(BET_FEED.week)?Object.values(history.games||{}).find(x=>same(x,g)):null;
    const bits=h?.tidbits||[];const raw=marketGame(g),s=snapshot(raw);
    const rows=pregame(raw).filter(x=>x.book===s?.book);
    return `<h3>BETTING HISTORY &amp; MODEL RECORD</h3><p class="ctdDetailNote">Published historical context · ${esc(date(history?.generated_at))}</p>${bits.length?`<ul class="ctdDetailList">${bits.map(t=>`<li>${esc(t.text)} <small>(${esc(t.sample_size)} games)</small></li>`).join('')}</ul>`:empty('No published matchup history is available for this pairing.')}<p class="ctdDetailNote">Source: ${esc([...new Set(bits.map(t=>t.source))].join('; ')||'No historical source published')}. Trends are historical samples, not the current game result.</p><details open><summary>Stored pregame picks and lines · ${esc(s?.book||'No sportsbook snapshot')}</summary>${rows.length?`<div class="ctdDetailTableWrap"><table class="ctdDetailTable"><thead><tr><th>Recorded</th><th>Spread pick</th><th>Total pick</th><th>Moneyline pick</th><th>Home line</th><th>Total line</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(date(x.captured_at))}</td>${['spread','total','moneyline'].map(k=>`<td>${esc(x.markets?.[k]?.recommendation?.selection||x.markets?.[k]?.recommendation?.decision||'Not published')}<br><small>${esc(settledPick(g,x,k))}</small></td>`).join('')}<td>${esc(g.home_team)} ${esc(x.market?.home_spread)}</td><td>${esc(x.market?.total)}</td></tr>`).join('')}</tbody></table></div>`:empty('No eligible pregame model snapshots have been published.')}</details><p class="ctdDetailNote">Results compare each displayed selection and its recorded line with the final score, including overtime. PASS is not a wager. These are snapshot outcomes, not a verified record of bets placed or an immutable pregame model archive. Closing-line value requires a verified closing line and entry price.</p>`;
  }
  function offenseDefense(g,d,defense){return `<h3>${defense?'DEFENSE':'OFFENSE'} · BOTH TEAMS</h3><div class="ctdDetailColumns">${[g.away_team,g.home_team].map(t=>`<section><h4>${esc(t)}</h4>${playerList(defense?playerRows(d,t,['defensive']).sort((a,b)=>(Number(b.stats?.TOT)||0)-(Number(a.stats?.TOT)||0)):playerRows(d,t,['passing','rushing','receiving']))}</section>`).join('')}</div>`}

  function injuriesHtml(g,d){
    const context=marketGame(g)?.personnel_context;
    const concern=/^(questionable|doubtful|out|injured reserve|ir|physically unable to perform|pup|suspended|inactive)$/i;
    const card=(x)=>`<div class="ctdDetailPlayer"><strong>${esc(x.name)} · ${esc(x.position||'')} <span style="color:#ffb6a5">${esc(x.designation)}</span></strong><span>Reported ${esc(date(x.reported_at))}${x.confirmed_for_game?' · Game status confirmed':' · Last reported designation'}</span>${x.practice_status?empty('Practice: '+x.practice_status):''}${x.impact?empty(x.impact):''}${x.depth_options?.length?empty('Next on the depth chart: '+x.depth_options.map(p=>p.name+(p.designation&&p.designation!=='Active'?' ('+p.designation+')':'')).join(', ')+'. Replacement role not confirmed.'):''}</div>`;
    const columns=[g.away_team,g.home_team].map(team=>{
      const record=Object.values(context?.teams||{}).find(t=>norm(t.team)===norm(team));
      const summary=record?.weekly_injuries;
      const valid=summary&&Number(summary.week)===Number(BET_FEED.week);
      const items=valid?summary.items:(d?.injuries||[]).filter(x=>norm(x.team)===norm(team)&&concern.test(x.status)).map(x=>({name:x.player,designation:x.status,reported_at:x.source_updated_at,impact:x.detail,depth_chart_starter:true,long_term:/^(injured reserve|ir|pup|suspended)$/i.test(x.status)}));
      const starters=items.filter(x=>x.depth_chart_starter&&!x.long_term),depth=items.filter(x=>!x.depth_chart_starter&&!x.long_term),long=items.filter(x=>x.long_term);
      return `<section><h4>${esc(team)}</h4>${starters.map(card).join('')}${depth.length?`<details><summary>Other reported injuries · ${depth.length}</summary>${depth.map(card).join('')}</details>`:''}${long.length?`<details><summary>Long-term absences · ${long.length}</summary>${long.map(card).join('')}</details>`:''}${!items.length?empty('No unresolved injury designations supplied for this matchup.'):''}</section>`;
    }).join('');
    return `<h3>WEEK ${esc(BET_FEED.week)} · INJURY WATCH</h3>${empty('Last reported status stays visible until updated. Report dates are separate from game-day confirmation.')}<div class="ctdDetailColumns">${columns}</div>`;
  }

  function tabs(g,d){
    let mount=document.getElementById('ctdGameTabContent');if(!mount){mount=document.createElement('section');mount.id='ctdGameTabContent';mount.className='ctdDetailPanel';document.querySelector('#gamesPage .tabs')?.after(mount)}
    mount.hidden=activeGameTab==='OVERVIEW';if(mount.hidden)return;
    if(activeGameTab==='OFFENSE'||activeGameTab==='DEFENSE')mount.innerHTML=offenseDefense(g,d,activeGameTab==='DEFENSE');
    else if(activeGameTab==='MATCHUP')mount.innerHTML=matchup(g,d);
    else if(activeGameTab==='BETTING HISTORY'||activeGameTab==='TRENDS')mount.innerHTML=historyHtml(g);
    else if(activeGameTab==='INJURIES')mount.innerHTML=injuriesHtml(g,d);
  }
  function render(){return window.CTD_READING.preserve(document.getElementById('gamesPage'),renderData);}
function renderData(){
    const g=selected();if(!g)return;const record=games.get(key(g)),d=record?.data;
    modelPicks(g);pivotal(g,d);
    const match=document.querySelector('#gamesPage .midgrid .panel:nth-child(2)'),chart=document.querySelector('#gamesPage .midgrid .panel:nth-child(3)'),hist=document.querySelector('#gamesPage .panel.history');
    for(const [el,html] of [[match,matchup(g,d)],[chart,flow(g,d)],[hist,historyHtml(g)]])if(el){el.classList.add('ctdDetailPanel');el.innerHTML=html}
    if(chart&&record){const note=document.createElement('p');note.className='ctdDetailNote';note.textContent=`${record.error?'Last available data · ':''}${record.updated?`Updated ${date(record.updated)} · `:''}${record.error||(d?.state==='post'?'FINAL':d?.state==='in'?'LIVE':d?.state==='pre'?'UPCOMING':d?.status||'')}`;chart.appendChild(note)}
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
    const results=await Promise.allSettled([window.CTD_GAME_MODEL.load(),get(RAW+'data/probability/generated/matchup-tidbits-2026.json'),get('/api/live/history'),get('./historical-game-comparisons-2026.json?v=20261101')]);
    if(results[0].status==='fulfilled'){markets=results[0].value;window.CTD_MARKET_PICKS.setCurrent(markets);renderTicker();}
    if(results[3]?.status==='fulfilled'&&results[3].value.season===2026&&Number(results[3].value.week)===Number(BET_FEED.week)){const archive=results[3].value;window.CTD_MARKET_PICKS.setComparisons(archive);if(markets?.games)for(const [id,g]of Object.entries(archive.games||{}))if(!markets.games[id])markets.games[id]=g;renderTicker();}
    if(results[1].status==='fulfilled')history=results[1].value;
    if(results[2].status==='fulfilled'){issuedHistory=results[2].value.history;pickResults=results[2].value.results;}
    historyError=results.slice(2).some(r=>r.status==='rejected')?'History refresh unavailable; showing any last loaded records.':'';
    feedError=results.filter(x=>x.status==='rejected').map(x=>x.reason?.message||'Published data unavailable').join('; ');
    if(feedError)console.warn('Game reference feeds:',feedError);
    render();
  }
  document.addEventListener('ctd:history-filter',render);
  void loadFeeds();void refresh();
  setInterval(()=>{if(!document.hidden)void refresh()},20000);
  setInterval(()=>{if(!document.hidden)void loadFeeds()},60000);
})();

