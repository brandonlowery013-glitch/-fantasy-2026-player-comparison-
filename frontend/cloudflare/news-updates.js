(()=>{
  if(document.getElementById('ctdNewsUpdates'))return;
  const anchor=document.querySelector('header.topbar');if(!anchor)return;
  const section=document.createElement('section');section.id='ctdNewsUpdates';section.setAttribute('aria-labelledby','ctdNewsTitle');
  section.innerHTML='<div class="news-heading"><h2 id="ctdNewsTitle">News &amp; Player Updates</h2><span class="news-status" role="status">Loading published news…</span></div><p class="news-note">Latest reports and player context. A news mention does not by itself confirm a model adjustment.</p><div class="news-items"></div><button type="button" class="news-more" hidden>Show more updates</button>';
  anchor.after(section);
  const style=document.createElement('style');style.textContent='#ctdNewsUpdates{margin:18px 24px;padding:18px;border:1px solid #334155;border-radius:12px;background:#111827;color:#e5e7eb}#ctdNewsUpdates .news-heading{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}#ctdNewsUpdates h2{font-size:18px;margin:0}#ctdNewsUpdates .news-status,#ctdNewsUpdates .news-note,#ctdNewsUpdates .news-meta{font-size:12px;color:#aab7ca}#ctdNewsUpdates .news-items{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}#ctdNewsUpdates article{border-top:1px solid #334155;padding-top:12px;min-width:0}#ctdNewsUpdates a{color:#f8fafc;font-weight:600;line-height:1.45;text-decoration:none}#ctdNewsUpdates a:hover{text-decoration:underline}#ctdNewsUpdates a:focus-visible,#ctdNewsUpdates button:focus-visible{outline:2px solid #fbbf24;outline-offset:4px}#ctdNewsUpdates .news-meta{margin-top:8px;line-height:1.5}#ctdNewsUpdates .news-more{margin-top:14px;padding:8px 12px;background:#263449;color:#fff;border:1px solid #64748b;border-radius:6px;cursor:pointer}#ctdNewsUpdates [hidden]{display:none!important}@media(max-width:700px){#ctdNewsUpdates{margin:12px;padding:14px}#ctdNewsUpdates .news-items{grid-template-columns:1fr}}';document.head.append(style);
  let feed=null,expanded=false,busy=false;
  const status=section.querySelector('.news-status'),list=section.querySelector('.news-items'),more=section.querySelector('button');
  const date=value=>Number.isFinite(Date.parse(value))?new Date(value).toLocaleString():null;
  function render(){
    list.replaceChildren();const items=feed.items||[];
    status.textContent=(feed.status==='CURRENT'?'Updated ':'Older saved feed · Last reviewed ')+(date(feed.reviewed_at)||'time unavailable');
    if(feed.status==='UNAVAILABLE')status.textContent='News updates unavailable';
    if(!items.length){const p=document.createElement('p');p.textContent='No published headlines available yet.';list.append(p)}
    for(const item of items.slice(0,expanded?30:3)){
      let url;try{url=new URL(item.url);if(url.protocol!=='https:')continue}catch{continue}
      const card=document.createElement('article'),link=document.createElement('a'),meta=document.createElement('p');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent=item.title;meta.className='news-meta';meta.textContent=[item.source,date(item.published_at)||'Publication time unavailable',(item.players||[]).slice(0,4).join(', ')].filter(Boolean).join(' · ');card.append(link,meta);list.append(card);
    }
    more.hidden=items.length<=3;more.textContent=expanded?'Show fewer updates':'Show more updates';
  }
  more.onclick=()=>{expanded=!expanded;render()};
  async function refresh(){if(busy||document.hidden)return;busy=true;try{const r=await fetch('/api/live/news',{cache:'no-store'});const data=await r.json();if(!r.ok||!Array.isArray(data.items))throw Error('News unavailable');feed=data;render()}catch{if(feed){feed={...feed,status:'STALE'};render();status.textContent+=' · Refresh unavailable'}else status.textContent='News updates temporarily unavailable'}finally{busy=false}}
  refresh();setInterval(refresh,300000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
})();
