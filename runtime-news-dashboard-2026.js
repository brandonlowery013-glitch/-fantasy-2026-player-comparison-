(()=>{
 const nav=document.getElementById('nav');if(!nav)return;
 const button=document.createElement('button');button.textContent='NEWS';button.dataset.page='newsPage';nav.append(button);
 const page=document.createElement('section');page.id='newsPage';page.className='page';page.innerHTML='<article class="panel"><h1>Player news</h1><p>Recent player updates, with the source and date beside each story.</p><label>Find a player or team <input id="newsSearch" type="search" placeholder="Player or team" style="padding:10px;border-radius:6px;max-width:100%"></label><div id="newsStories"></div></article>';document.getElementById('gamesPage').after(page);
 function render(){const q=page.querySelector('input').value.toLowerCase(),seen=new Set(),rows=[];for(const p of PLAYERS){if(!PLAYER_SOURCE_READY||!(`${p.name} ${p.team}`).toLowerCase().includes(q))continue;for(const n of p.newsFeed||[]){const key=p.name+'|'+n.headline;if(seen.has(key))continue;seen.add(key);rows.push({p,n});}}
 rows.sort((a,b)=>(Date.parse(b.n.date)||0)-(Date.parse(a.n.date)||0));
 page.querySelector('#newsStories').innerHTML=rows.length?rows.slice(0,60).map(({p,n})=>`<article class="evidenceRow"><p class="dataNote">${esc(p.name)} · ${esc(p.team)} · ${esc(n.source||'Source not supplied')} · ${Number.isFinite(Date.parse(n.date))?esc(new Date(n.date).toLocaleString()):'Date not supplied'}</p><h3>${esc(n.headline)}</h3>${n.summary?`<p>${esc(n.summary)}</p>`:''}</article>`).join(''):'<p>No matching news is available. Try another player or team.</p>';
 }
 page.querySelector('input').addEventListener('input',render);button.addEventListener('click',()=>{showPage('newsPage',button);render();});
})();
