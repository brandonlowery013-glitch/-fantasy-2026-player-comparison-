(()=>{
  const TEAM_NAMES={ARI:'Arizona Cardinals',ATL:'Atlanta Falcons',BAL:'Baltimore Ravens',BUF:'Buffalo Bills',CAR:'Carolina Panthers',CHI:'Chicago Bears',CIN:'Cincinnati Bengals',CLE:'Cleveland Browns',DAL:'Dallas Cowboys',DEN:'Denver Broncos',DET:'Detroit Lions',GB:'Green Bay Packers',HOU:'Houston Texans',IND:'Indianapolis Colts',JAX:'Jacksonville Jaguars',KC:'Kansas City Chiefs',LV:'Las Vegas Raiders',LAC:'Los Angeles Chargers',LAR:'Los Angeles Rams',LA:'Los Angeles Rams',MIA:'Miami Dolphins',MIN:'Minnesota Vikings',NE:'New England Patriots',NO:'New Orleans Saints',NYG:'New York Giants',NYJ:'New York Jets',PHI:'Philadelphia Eagles',PIT:'Pittsburgh Steelers',SEA:'Seattle Seahawks',SF:'San Francisco 49ers',TB:'Tampa Bay Buccaneers',TEN:'Tennessee Titans',WAS:'Washington Commanders',WSH:'Washington Commanders'};
  const ESPN_IDS={ARI:22,ATL:1,BAL:33,BUF:2,CAR:29,CHI:3,CIN:4,CLE:5,DAL:6,DEN:7,DET:8,GB:9,HOU:34,IND:11,JAX:30,KC:12,LV:13,LAC:24,LAR:14,LA:14,MIA:15,MIN:16,NE:17,NO:18,NYG:19,NYJ:20,PHI:21,PIT:23,SEA:26,SF:25,TB:27,TEN:10,WAS:28,WSH:28};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=t=>String(t||'').toUpperCase()==='LA'?'LAR':String(t||'').toUpperCase()==='WAS'?'WSH':String(t||'').toUpperCase();
  const logo=t=>{const code=norm(t);return TEAM_NAMES[code]?`https://a.espncdn.com/i/teamlogos/nfl/500/${code.toLowerCase()}.png`:''};
  const teamName=t=>TEAM_NAMES[norm(t)]||t;
  const teamMark=(t,compact=false)=>{const src=logo(t);return `<span class="ctdTeamMark ${compact?'compact':''}">${src?`<img src="${src}" alt="${esc(teamName(t))} logo" loading="eager" referrerpolicy="no-referrer">`:''}<span>${esc(t)}</span></span>`};
  const style=document.createElement('style');
  style.textContent=`
    .ctdTeamMark{display:inline-flex;align-items:center;gap:8px}.ctdTeamMark img{width:34px;height:34px;object-fit:contain;flex:0 0 auto}.ctdTeamMark.compact{gap:5px}.ctdTeamMark.compact img{width:22px;height:22px}
    .ctdMatchupHero{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;margin:12px 0;padding:16px;background:#081522;border:1px solid #23405f;border-radius:12px}.ctdMatchupSide{display:grid;justify-items:center;gap:6px;text-align:center}.ctdMatchupSide img{width:56px;height:56px;object-fit:contain}.ctdMatchupSide strong{font-size:16px}.ctdMatchupSide small{color:#8fa7bf}.ctdMatchupCenter{text-align:center}.ctdMatchupCenter b{display:block;font-size:13px;color:#8fa7bf;margin-bottom:4px}.ctdMatchupCenter span{font-size:24px;font-weight:800}
    .ctdGameUtility{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 16px}.ctdGameUtility .btn{min-height:40px}.ctdGameUtility .active{background:#197ce8;border-color:#44a0ff;color:#fff}
    .ctdCompactGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 0}.ctdCompactCard{background:#081522;border:1px solid #23405f;border-radius:10px;padding:14px}.ctdCompactCard h3{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#a8bed4;margin:0 0 10px}.ctdCompactRow{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-top:1px solid #17334d}.ctdCompactRow:first-of-type{border-top:0}.ctdCompactRow span{color:#95aac0}.ctdCompactRow b{text-align:right}
    #gameSummary{display:none!important}.ctdNarrativeSummary{display:none!important}
    @media(max-width:700px){.ctdMatchupHero{padding:12px 8px}.ctdMatchupSide img{width:44px;height:44px}.ctdMatchupSide strong{font-size:13px}.ctdMatchupCenter span{font-size:20px}.ctdCompactGrid{grid-template-columns:1fr}.ctdGameUtility{position:sticky;top:0;z-index:9;background:#040d17;padding:8px 0;margin-top:8px}.ctdTeamMark img{width:28px;height:28px}}
  `;
  document.head.appendChild(style);

  function ensureGamesDefault(){
    const nav=document.getElementById('nav');
    const games=nav?.querySelector('[data-page="gamesPage"]');
    if(!games)return;
    nav.prepend(games);
    const visible=[...document.querySelectorAll('[id$="Page"]')].find(x=>getComputedStyle(x).display!=='none');
    if(!visible||visible.id!=='gamesPage'){
      try{showPage('gamesPage',games)}catch{}
    }
  }

  function enhanceTicker(){
    const lane=document.getElementById('ctdGameTicker');
    if(!lane)return;
    for(const el of lane.querySelectorAll('*')){
      if(el.children.length)continue;
      const text=el.textContent.trim();
      if(!/^[A-Z]{2,3}$/.test(text))continue;
      const t=norm(text);if(!TEAM_NAMES[t]||el.querySelector('img'))continue;
      const img=document.createElement('img');img.src=logo(t);img.alt=teamName(t)+' logo';img.loading='eager';img.referrerPolicy='no-referrer';img.style.cssText='width:20px;height:20px;object-fit:contain;vertical-align:middle;margin-right:5px';el.prepend(img);
    }
  }

  function moveBettingToolsUp(){
    const games=document.getElementById('gamesPage');
    if(!games)return;
    const tools=[...games.querySelectorAll('h1,h2,h3,p,div,section')].find(x=>x.childElementCount<5&&/BETTING TOOLS/i.test(x.textContent||''));
    if(!tools)return;
    let block=tools.closest('section')||tools.parentElement;
    if(!block||block.dataset.ctdMoved==='1')return;
    const ticker=document.getElementById('ctdGameTicker');
    const anchor=ticker?.parentElement||games.firstElementChild;
    if(anchor&&block!==anchor){anchor.insertAdjacentElement('afterend',block);block.dataset.ctdMoved='1';}
  }

  function gameHero(){
    const g=window.BET_FEED?.games?.[window.selectedGameIndex??0]||window.BET_FEED?.games?.[0];
    const page=document.getElementById('gamesPage');if(!g||!page)return;
    let hero=document.getElementById('ctdMatchupHero');
    if(!hero){hero=document.createElement('div');hero.id='ctdMatchupHero';hero.className='ctdMatchupHero';const title=document.getElementById('gameTitle');(title?.parentElement||page).insertBefore(hero,title?title.nextSibling:(title?.parentElement||page).firstChild)}
    const status=esc(g.status||'');
    const scoreKnown=Number.isFinite(Number(g.away_score))&&Number.isFinite(Number(g.home_score));
    hero.innerHTML=`<div class="ctdMatchupSide"><img src="${logo(g.away_team)}" alt="${esc(teamName(g.away_team))} logo" loading="eager" referrerpolicy="no-referrer"><strong>${esc(teamName(g.away_team))}</strong><small>${esc(g.away_team)}</small></div><div class="ctdMatchupCenter"><b>${status}</b><span>${scoreKnown?`${esc(g.away_score)} — ${esc(g.home_score)}`:'VS'}</span></div><div class="ctdMatchupSide"><img src="${logo(g.home_team)}" alt="${esc(teamName(g.home_team))} logo" loading="eager" referrerpolicy="no-referrer"><strong>${esc(teamName(g.home_team))}</strong><small>${esc(g.home_team)}</small></div>`;
  }

  function removeNarrative(){
    const summary=document.getElementById('gameSummary');if(summary)summary.style.display='none';
    for(const el of document.querySelectorAll('#gamesPage h2,#gamesPage h3')){
      if(el.textContent.trim().toUpperCase()==='GAME SUMMARY'){const card=el.closest('.panel,.card,.categoryCard,section,article,div');if(card)card.classList.add('ctdNarrativeSummary')}
    }
  }

  function plainEnglishBetting(){
    const root=document.getElementById('gamesPage')||document;
    const replacements=new Map([
      ['Model probability','Chance this bet hits'],['Expected value','Value vs listed odds'],['Probability advantage','Model edge'],['Expected return / unit risked','Estimated profit on a $100 bet'],['Market chance (margin removed)','Sportsbook implied chance'],['LONGSHOT · POSITIVE_EV','Long-shot parlay'],['LONGSHOT · POSITIVE EV','Long-shot parlay']
    ]);
    for(const el of root.querySelectorAll('span,p,div,td,th,h2,h3')){
      if(el.children.length)continue;
      const text=el.textContent.trim();
      if(replacements.has(text))el.textContent=replacements.get(text);
      else if(/\bpp\b/.test(text))el.textContent=text.replace(/\bpp\b/g,'percentage points');
    }
  }

  function addLogosToGameDetail(){
    const root=document.getElementById('gamesPage');if(!root)return;
    for(const el of root.querySelectorAll('td,th,b,strong,span')){
      if(el.children.length)continue;
      const t=norm(el.textContent.trim());
      if(!TEAM_NAMES[t])continue;
      el.innerHTML=teamMark(t,true);
    }
  }

  function enhance(){ensureGamesDefault();enhanceTicker();moveBettingToolsUp();gameHero();removeNarrative();plainEnglishBetting();addLogosToGameDetail()}
  document.addEventListener('DOMContentLoaded',enhance,{once:true});
  document.addEventListener('ctd:games-ready',enhance);
  document.addEventListener('click',e=>{if(e.target.closest('#ctdGameTicker,.tabs,[data-open-game]'))setTimeout(enhance,40)});
  const mo=new MutationObserver(()=>{clearTimeout(window.__ctdEnhanceTimer);window.__ctdEnhanceTimer=setTimeout(enhance,80)});mo.observe(document.documentElement,{subtree:true,childList:true});
  setTimeout(enhance,0);
})();
