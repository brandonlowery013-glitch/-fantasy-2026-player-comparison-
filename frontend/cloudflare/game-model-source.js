(()=>{
 const ROOT='https://raw.githubusercontent.com/brandonlowery013-glitch/-fantasy-2026-player-comparison-/';
 const HEAD='https://api.github.com/repos/brandonlowery013-glitch/-fantasy-2026-player-comparison-/git/ref/heads/main';
 const paths={recommendations:['data/market/game-model-consumer-2026.json','all-game-model-rerun-2026.json'],projections:['data/probability/generated/weekly-game-projections-2026.json','all-game-rerun-projections-2026.json'],schedule:['data/calibration/weekly-event-schedule-2026.json'],lines:['data/market/current-game-lines-2026.json']};
 const impactHelper=import('./lib/personnel-matchup.mjs');
 const impactCache=new Map();
 function personnel(){const slot=Math.floor(Date.now()/60000);if(!impactCache.has(slot)){impactCache.clear();const u=new URLSearchParams(typeof location==='undefined'?'':location.search),team=u.get('game_test'),scenario=u.get('game_scenario')||'qb-out',unit=u.get('game_unit')||'WR';impactCache.set(slot,read('/api/live/game-projections'+(team?'?verify='+encodeURIComponent(team)+'&scenario='+encodeURIComponent(scenario)+'&unit='+encodeURIComponent(unit):'')).catch(()=>null));}return impactCache.get(slot);}
 const cache=new Map(),releases=new Map();
 const read=async url=>{for(let attempt=0;attempt<2;attempt++){let r;try{r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(30000)});}catch(error){if(attempt===0)continue;throw error;}if(!r.ok){if(attempt===0&&(r.status===429||r.status>=500))continue;throw Error('Game model unavailable: '+r.status);}try{return await r.json();}catch(error){if(attempt===0&&error.name!=='SyntaxError')continue;throw error;}}};
 function release(slot){if(!releases.has(slot)){releases.clear();releases.set(slot,read('/cloudflare/api/game-model/release').then(x=>{if(x.ref!=='refs/heads/main'||x.object?.type!=='commit'||!/^[a-f0-9]{40}$/.test(x.object?.sha||''))throw Error('Invalid producer release');return x.object.sha;}).catch(()=> 'main'));}return releases.get(slot);}
 function select(base,rerun){return rerun?.rerun===true&&rerun.actionable===false&&rerun.season===base.season&&rerun.week===base.week&&Object.keys(base.games||{}).every(id=>rerun.games?.[id])?rerun:base;}
 window.CTD_GAME_MODEL={select,release:()=>release(Math.floor(Date.now()/300000)),load(kind='recommendations'){
  if(!paths[kind])return Promise.reject(Error('Unknown game model source'));
  const slot=Math.floor(Date.now()/300000),key=kind+slot;if(cache.has(key))return cache.get(key);
  for(const old of cache.keys())if(old.startsWith(kind))cache.delete(old);
  const [normal,rerun]=paths[kind];
  // Start independent context I/O while resolving the release and main feed.
  const pendingPersonnel=['recommendations','projections'].includes(kind)?personnel():null;
  const p=Promise.resolve('main').then(async sha=>{
   // Recommendations are evaluated by the deployed server. Never replace them with a
   // raw producer, research replay, personnel model, or a second browser-side fit.
   const base=await (kind==='recommendations'?read('/cloudflare/api/game-model/recommendations?ref='+sha):read('/cloudflare/api/game-model/'+kind+'?ref='+sha).catch(()=>read(ROOT+sha+'/'+normal)));
   const chosen=kind!=='recommendations'&&rerun?select(base,await read(rerun).catch(()=>null)):base;
   if(!['recommendations','projections'].includes(kind))return chosen;
   const [helper,live]=await Promise.all([impactHelper,pendingPersonnel]);
   const result=helper.overlayGameFeed(chosen,live,kind);
   // Started games retain original pregame snapshots, labeled retrospective in the UI.
   // Current-model version gates apply only before kickoff; never rewrite saved history.
   if(kind==='recommendations')for(const g of Object.values(result.games||{}))for(const q of (Date.parse(g.kickoff||g.event_start)<=Date.now()?[]:g.snapshot_evaluations||[]))if(q.eligible_for_current_recommendation)for(const [market,version] of [['spread','sportsbook-calibration-learning-v1'],['moneyline','ctd-football-moneyline-v1']])if(q.markets?.[market]?.model_version!==version){q.markets||={};q.markets[market]={model_version:version,recommendation:{decision:'WAIT',reason:'CURRENT_MODEL_UNAVAILABLE'}};}
   return result;
  });
  cache.set(key,p);p.catch(()=>cache.delete(key));return p;
 }};
})();

