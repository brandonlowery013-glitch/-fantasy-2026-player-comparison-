(()=>{
  const POSITIONS=['QB','RB','WR','TE'];
  const css=`
    #board .card:first-child{padding:16px 16px 14px}
    #board .card:first-child .sub{max-width:780px}
    #board .toolbar{margin-top:14px}
    .positionGroup{margin:0 0 16px}
    .positionHeader{display:flex;justify-content:space-between;align-items:end;gap:12px;margin:0 0 8px;padding:0 2px}
    .positionHeader h3{margin:0;font-size:16px;letter-spacing:.02em}
    .positionHeader span{color:var(--muted);font-size:11px}
    .positionGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .player{padding:13px 14px;transition:border-color .15s ease,transform .15s ease}
    .player:hover{transform:translateY(-1px)}
    .playerHead{align-items:flex-start}
    .playerName{font-size:16px;line-height:1.25}
    .meta{margin-top:3px}
    .metrics{grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:12px}
    .metric{padding:9px}
    .metric span{font-size:9px;line-height:1.25}
    .metric b{font-size:14px;line-height:1.25}
    .profileHero{align-items:center}
    .profileHero h2{margin:0 0 4px;font-size:28px}
    .profileLead{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px}
    .profileLead .pill{font-size:10px;padding:5px 8px}
    .profileIntro{margin-top:10px;color:#c9d7e9;font-size:13px;line-height:1.55;max-width:850px}
    .profileGrid{grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
    .section{padding:13px}
    .section h3{font-size:13px;letter-spacing:.02em}
    .row{padding:8px 0}
    .profileExplainer{margin-top:8px;color:var(--muted);font-size:11px;line-height:1.45}
    .profileSectionTitle{display:flex;justify-content:space-between;gap:12px;align-items:flex-end;margin-bottom:10px}
    .profileSectionTitle h2{margin:0}
    .profileSectionTitle span{color:var(--muted);font-size:11px}
    @media(max-width:820px){
      .positionGrid{grid-template-columns:1fr}
      .profileGrid{grid-template-columns:1fr}
      .profileHero{align-items:flex-start}
      .profileHero h2{font-size:25px}
    }
    @media(max-width:520px){
      .metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
      .positionHeader{align-items:center}
      .player{padding:12px}
    }
  `;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const metricHtml=(label,value,help='')=>`<div class="metric"><span>${label}</span><b>${value??'—'}</b>${help?`<div class="meta" style="margin-top:3px">${help}</div>`:''}</div>`;
  function priceCopy(x){return({BUY:'Market price is cheaper than our valuation.',FAIR:'Market price is close to our valuation.',REACH:'You are paying ahead of our preferred range.',FADE:'Market price is materially too expensive.'})[x]||'No current price classification is available.'}
  function playerCard(p){
    const pc=priceClass(p);
    return `<article class="player" tabindex="0" role="button" data-name="${esc(p.n)}" aria-label="Open ${esc(p.n)} profile">
      <div class="playerHead"><div><div class="playerName">${esc(p.n)}</div><div class="meta">${esc(p.t||'—')} · ${esc(p.p)}</div></div><span class="pill ${tagClass(pc)}">${esc(pc)}</span></div>
      <div class="metrics">
        ${metricHtml('Our Projection',p.mp==null?'—':fmt(p.mp,1)+' PPR')}
        ${metricHtml('Player Quality',p.tr==null?'—':'#'+fmt(p.tr,0),'football-only')}
        ${metricHtml('Draft Rank',p.o==null?'—':'#'+fmt(p.o,0),'our board')}
        ${metricHtml('Market ADP',fmt(p.ad,1),'current cost')}
      </div>
    </article>`;
  }
  function bindCards(){document.querySelectorAll('#playerGrid .player').forEach(el=>{el.addEventListener('click',()=>openProfile(el.dataset.name));el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openProfile(el.dataset.name)}})})}
  function renderBoardStep4(){
    const q=$('search').value.trim().toLowerCase(),selected=$('pos').value;
    const list=P.filter(p=>(selected==='ALL'||p.p===selected)&&(!q||p.n.toLowerCase().includes(q)||String(p.t||'').toLowerCase().includes(q)));
    const groups=POSITIONS.filter(pos=>selected==='ALL'||selected===pos).map(pos=>{
      const players=list.filter(p=>p.p===pos).sort((a,b)=>lastKey(a.n).localeCompare(lastKey(b.n))||a.n.localeCompare(b.n));
      if(!players.length)return '';
      return `<section class="positionGroup" data-position-group="${pos}"><div class="positionHeader"><h3>${pos}</h3><span>${players.length} player${players.length===1?'':'s'} · alphabetical by last name</span></div><div class="positionGrid">${players.map(playerCard).join('')}</div></section>`;
    }).join('');
    $('playerGrid').className='';
    $('playerGrid').innerHTML=groups||stateBox('EMPTY','No matching players','No players match the current search and position filters.');
    bindCards();
  }
  function openProfileStep4(name){
    const p=P.find(x=>x.n===name);if(!p)return;
    const fs=playerForecasts(name),pc=priceClass(p);
    $('profileContent').className='';
    $('profileContent').innerHTML=`
      <div class="card">
        <div class="profileHero"><div><h2>${esc(p.n)}</h2><div class="sub">${esc(p.t||'—')} · ${esc(p.p)}</div><div class="profileLead"><span class="pill ${tagClass(pc)}">${esc(pc)} at current price</span><span class="pill">Our Draft Rank ${p.o==null?'—':'#'+fmt(p.o,0)}</span><span class="pill">Market ADP ${fmt(p.ad,1)}</span></div></div></div>
        <div class="profileIntro">This page separates three questions: how strong the player is on football merit, what we project him to score, and whether the current draft price is attractive. Draft price does not determine Player Quality.</div>
        <div class="profileGrid">
          <div class="section"><h3>Projection & Quality</h3>${row('Our projected PPR',fmt(p.mp,1))}${row('Consensus PPR',fmt(p.cp,1))}${row('Player Quality rank',p.tr==null?'—':'#'+p.tr)}${row('Our draft rank',p.o==null?'—':'#'+p.o)}<div class="profileExplainer">Player Quality is the football-only view. Draft Rank is where we are willing to select the player after price and roster-building considerations.</div></div>
          <div class="section"><h3>Role & Team Context</h3>${row('Role / volume',fmt(p.r,1))}${row('Offensive environment',fmt(p.e,1))}${row('Availability',fmt(p.a,1))}${row('Reliability',fmt(p.rl,1))}<div class="profileExplainer">These inputs describe opportunity, surrounding offense, availability and week-to-week trustworthiness.</div></div>
          <div class="section"><h3>Draft Price</h3>${row('Market ADP',fmt(p.ad,1))}${row('Consensus rank',p.cr==null?'—':'#'+p.cr)}${row('Price read',pc)}${row('Fair range',p.fw||'—')}<div class="profileExplainer">${priceCopy(pc)}</div></div>
        </div>
      </div>
      <div class="split">
        <div class="card"><div class="profileSectionTitle"><h2>Season Projection</h2><span>football forecast</span></div><div class="sub">Our projection is built independently of sportsbook pricing.</div><div class="section" style="margin-top:10px">${row('Median stat projection',p.m||'—')}${row('Upside projection',p.cl||'—')}${row('Consensus stat projection',p.cn||'—')}${row('Sportsbook threshold snapshot',p.vl||'—')}</div></div>
        <div class="card"><div class="profileSectionTitle"><h2>Weekly Forecasts</h2><span>when frozen</span></div>${weeklyStateForProfile(fs)}</div>
      </div>
      <div class="card"><div class="profileSectionTitle"><h2>Prop Market Context</h2><span>price context only</span></div><div class="marketNote">Sportsbook information is shown after the football model. It does not change the underlying player projection.</div>${marketRows(p)}</div>`;
    bindRetry();navTo('profile');
  }
  function enhanceCopy(){
    const board=document.querySelector('#board .card:first-child');
    if(board){const sub=board.querySelector('.sub');if(sub)sub.textContent='Browse players by position, alphabetically by last name. Rankings stay inside the player details instead of being attached to the player name.'}
    document.documentElement.dataset.uiStep4='player-board-profile';
  }
  function attach(){
    if(!document.getElementById('ui-step4-style')){const s=document.createElement('style');s.id='ui-step4-style';s.textContent=css;document.head.appendChild(s)}
    window.renderBoard=renderBoardStep4;
    window.openProfile=openProfileStep4;
    enhanceCopy();
    if(Array.isArray(window.P)&&P.length)renderBoardStep4();
    const search=$('search'),pos=$('pos');
    if(search)search.addEventListener('input',()=>setTimeout(renderBoardStep4,0));
    if(pos)pos.addEventListener('change',()=>setTimeout(renderBoardStep4,0));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach,{once:true});else attach();
})();