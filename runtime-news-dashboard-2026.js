(()=>{
 const nav=document.getElementById('nav');if(!nav)return;
 const clean=x=>{const box=document.createElement('textarea');box.innerHTML=String(x||'');return box.value.trim();};
 const sourceLinks=x=>String(x||'').split(',').map(v=>{v=v.trim();try{const u=new URL(v);if(u.protocol!=='https:')return '';return `<a href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">${esc(u.hostname.replace(/^www\./,''))} ↗</a>`;}catch{return esc(v.replaceAll('_',' '));}}).filter(Boolean).join(' · ')||'Source not supplied';
 const button=document.createElement('button');button.textContent='NEWS';button.dataset.page='newsPage';nav.append(button);
 const page=document.createElement('section');page.id='newsPage';page.className='page';page.innerHTML='<article class="panel"><h1>Player news</h1><p>Player updates saved in the model. Open the source for the original article and publication date.</p><label>Find a player or team <input id="newsSearch" type="search" placeholder="Player or team" style="padding:10px;border-radius:6px;max-width:100%"></label><div id="newsStories"></div></article>';document.getElementById('gamesPage').after(page);
 function render(){const q=page.querySelector('input').value.toLowerCase(),seen=new Set(),rows=[];for(const p of PLAYERS){if(!PLAYER_SOURCE_READY||!(`${p.name} ${p.team}`).toLowerCase().includes(q))continue;for(const raw of p.newsFeed||[]){const parts=clean(raw.headline).split('|').map(x=>x.trim()),title=parts[0];if(!title||title.length>220||/^[a-z]/.test(title))continue;const n={...raw,headline:title,summary:raw.summary||parts[1]||''};const key=p.name+'|'+n.headline;if(seen.has(key))continue;seen.add(key);rows.push({p,n});}}
 rows.sort((a,b)=>(Date.parse(b.n.date)||0)-(Date.parse(a.n.date)||0));
 page.querySelector('#newsStories').innerHTML=rows.length?rows.slice(0,60).map(({p,n})=>`<article class="evidenceRow"><p class="dataNote">${esc(p.name)} · ${esc(p.team)} · ${sourceLinks(n.source)} · Saved ${Number.isFinite(Date.parse(n.date))?esc(new Date(n.date).toLocaleString()):'Date not supplied'}</p><h3>${esc(n.headline)}</h3>${n.summary?`<p>${esc(n.summary)}</p>`:''}</article>`).join(''):'<p>No matching news is available. Try another player or team.</p>';
 }
 page.querySelector('input').addEventListener('input',render);button.addEventListener('click',()=>{showPage('newsPage',button);render();});
})();
