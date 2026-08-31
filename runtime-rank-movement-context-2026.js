(()=>{
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  let context=null,phase=null;
  const load=async()=>{
    try{context=await fetch('rankMovement2026.json?v=20260908-phase').then(r=>r.ok?r.json():null)}catch{}
    try{phase=await fetch('data/sources/season-phase-2026.json?v=20260908-phase').then(r=>r.ok?r.json():null)}catch{}
    apply();
  };
  const now=()=>new Date();
  const regular=()=>phase&&now()>=new Date(phase.regular_season_mode_starts_at);
  const arrow=m=>m?.direction==='UP'?`↑ ${m.delta}`:m?.direction==='DOWN'?`↓ ${m.delta}`:m?.direction==='NEW'?'NEW':'';
  const cls=m=>m?.direction==='UP'?'ctdMoveUp':m?.direction==='DOWN'?'ctdMoveDown':m?.direction==='NEW'?'ctdMoveNew':'ctdMoveHold';
  function styles(){
    if(document.getElementById('ctd-rank-movement-style'))return;
    const s=document.createElement('style');s.id='ctd-rank-movement-style';s.textContent=`
      .ctdMoveContext{margin-top:8px;padding:8px 9px;border:1px solid #1b416b;border-radius:9px;background:#07111e;font-size:10px;line-height:1.45;color:#9fb6cd}.ctdMoveLine{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.ctdMoveBadge,.ctdNewsBadge,.ctdPhaseBadge{display:inline-flex;align-items:center;border-radius:999px;padding:3px 6px;font-weight:900;letter-spacing:.03em}.ctdMoveUp{color:#6ee7a8;background:#073b31;border:1px solid #14654f}.ctdMoveDown{color:#ff9aaa;background:#491523;border:1px solid #79283a}.ctdMoveNew{color:#79d7ff;background:#083a54;border:1px solid #17688f}.ctdNewsBadge{color:#ffd98b;background:#443313;border:1px solid #795c1c}.ctdMoveWhy{margin-top:5px;color:#b6c8da}.ctdMoveWhy b{color:#e8f4ff}.ctdSeasonPhase{margin-left:7px}.ctdPhaseBadge{color:#8fd8ff;background:#092d49;border:1px solid #175e8d}.ctdRegularSeason [data-draft-cost],.ctdRegularSeason .draftCost,.ctdRegularSeason .adp,.ctdRegularSeason [data-adp]{opacity:.58}.ctdRegularSeason .ctdMoveContext{border-color:#25618f}
    `;document.head.appendChild(s);
  }
  function phaseBadge(){
    const top=document.querySelector('.status')||document.querySelector('.top');if(!top||!phase)return;
    let b=document.getElementById('ctdSeasonPhase');if(!b){b=document.createElement('span');b.id='ctdSeasonPhase';b.className='ctdSeasonPhase ctdPhaseBadge';top.appendChild(b)}
    const isRegular=regular();b.textContent=isRegular?'REGULAR SEASON MODE':'DRAFT MODE · THROUGH SEP 8';document.documentElement.classList.toggle('ctdRegularSeason',isRegular);document.documentElement.dataset.seasonPhase=isRegular?'regular-season':'draft';
  }
  function candidateNodes(){return [...document.querySelectorAll('.player,[data-player],[data-player-name],tr')];}
  function findNode(name){
    const exact=document.querySelector(`[data-player-name="${CSS.escape(name)}"],[data-player="${CSS.escape(name)}"]`);if(exact)return exact;
    return candidateNodes().find(n=>{const t=(n.textContent||'').trim();return t.includes(name)})||null;
  }
  function renderRow(x){
    const node=findNode(x.player);if(!node)return;if(node.querySelector(`.ctdMoveContext[data-player="${CSS.escape(x.player)}"]`))return;
    const oa=arrow(x.overall),ta=arrow(x.true_value),hasMove=Boolean(oa||ta),news=x.news||{},hasNews=Boolean(news.source||news.summary||news.action||(news.status&&news.status!=='PASS'));
    if(!hasMove&&!hasNews)return;
    const parts=[];
    if(oa)parts.push(`<span class="ctdMoveBadge ${cls(x.overall)}" title="Overall ${esc(x.overall.from)} → ${esc(x.overall.to)}">Overall ${esc(oa)}</span>`);
    if(ta)parts.push(`<span class="ctdMoveBadge ${cls(x.true_value)}" title="True Value ${esc(x.true_value.from)} → ${esc(x.true_value.to)}">TV ${esc(ta)}</span>`);
    if(hasNews&&!hasMove)parts.push('<span class="ctdNewsBadge">NEWS / HOLD</span>');else if(hasNews)parts.push('<span class="ctdNewsBadge">WHY IT MOVED</span>');
    const reason=news.summary||news.action||news.status||news.source||'';
    const div=document.createElement('div');div.className='ctdMoveContext';div.dataset.player=x.player;div.innerHTML=`<div class="ctdMoveLine">${parts.join('')}</div>${reason?`<div class="ctdMoveWhy"><b>${hasMove?'Context':'News'}:</b> ${esc(reason)}</div>`:''}`;
    node.appendChild(div);
  }
  function apply(){styles();phaseBadge();if(!context?.players)return;context.players.forEach(renderRow)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
  new MutationObserver(()=>apply()).observe(document.documentElement,{childList:true,subtree:true});
})();
