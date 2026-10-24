(()=>{
 const ROOT='https://raw.githubusercontent.com/brandonlowery013-glitch/-fantasy-2026-player-comparison-/';
 const HEAD='https://api.github.com/repos/brandonlowery013-glitch/-fantasy-2026-player-comparison-/git/ref/heads/main';
 const paths={recommendations:['data/market/game-model-consumer-2026.json','all-game-model-rerun-2026.json'],projections:['data/probability/generated/weekly-game-projections-2026.json','all-game-rerun-projections-2026.json'],schedule:['data/calibration/weekly-event-schedule-2026.json'],lines:['data/market/current-game-lines-2026.json']};
 const impactHelper=import('./lib/personnel-matchup.mjs');
 const moneylineHelper=import('./lib/moneyline-feed.mjs');
 const moneylineCache=new Map();
 function moneylines(){const slot=Math.floor(Date.now()/60000);if(!moneylineCache.has(slot)){moneylineCache.clear();moneylineCache.set(slot,read('/api/live/moneyline-projections').catch(()=>null));}return moneylineCache.get(slot);}
 const spreadHelper=import('./lib/spread-feed.mjs');
 const spreadCache=new Map();
 function spreads(){const slot=Math.floor(Date.now()/60000);if(!spreadCache.has(slot)){spreadCache.clear();spreadCache.set(slot,read('/api/live/spread-projections').catch(()=>null));}return spreadCache.get(slot);}
 const impactCache=new Map();
 function personnel(){const slot=Math.floor(Date.now()/60000);if(!impactCache.has(slot)){impactCache.clear();const u=new URLSearchParams(typeof location==='undefined'?'':location.search),team=u.get('game_test'),scenario=u.get('game_scenario')||'qb-out',unit=u.get('game_unit')||'WR';impactCache.set(slot,read('/api/live/game-projections'+(team?'?verify='+encodeURIComponent(team)+'&scenario='+encodeURIComponent(scenario)+'&unit='+encodeURIComponent(unit):'')).catch(()=>null));}return impactCache.get(slot);}
 const cache=new Map(),releases=new Map();
 const read=async url=>{const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Game model unavailable: '+r.status);return r.json()};
 function release(slot){if(!releases.has(slot)){releases.clear();releases.set(slot,read('/cloudflare/api/game-model/release').then(x=>{if(x.ref!=='refs/heads/main'||x.object?.type!=='commit'||!/^[a-f0-9]{40}$/.test(x.object?.sha||''))throw Error('Invalid producer release');return x.object.sha;}).catch(()=> 'main'));}return releases.get(slot);}
 function select(base,rerun){return rerun?.rerun===true&&rerun.actionable===false&&rerun.season===base.season&&rerun.week===base.week&&Object.keys(base.games||{}).every(id=>rerun.games?.[id])?rerun:base;}
 window.CTD_GAME_MODEL={select,release:()=>release(Math.floor(Date.now()/300000)),load(kind='recommendations'){
  if(!paths[kind])return Promise.reject(Error('Unknown game model source'));
  const slot=Math.floor(Date.now()/300000),key=kind+slot;if(cache.has(key))return cache.get(key);
  for(const old of cache.keys())if(old.startsWith(kind))cache.delete(old);
  const [normal,rerun]=paths[kind];const p=release(slot).then(async sha=>{const baseRead=read('/cloudflare/api/game-model/'+kind+'?ref='+sha).catch(()=>read(ROOT+sha+'/'+normal)).catch(error=>kind==='recommendations'?read(ROOT+sha+'/data/market/weekly-game-market-recommendations-2026.json'):Promise.reject(error));const [base,recalculated]=await Promise.all([baseRead,rerun?read(rerun).catch(()=>null):null]);const chosen=kind==='recommendations'?base:rerun?select(base,recalculated):base;if(!['recommendations','projections'].includes(kind))return chosen;const [helper,live]=await Promise.all([impactHelper,personnel()]);const withPersonnel=helper.overlayGameFeed(chosen,live,kind);if(kind!=='recommendations')return withPersonnel;const [spread,spreadLive]=await Promise.all([spreadHelper,spreads()]);const withSpread=spread.overlaySpreadFeed(withPersonnel,spreadLive);const [ml,mlLive]=await Promise.all([moneylineHelper,moneylines()]);return ml.overlayMoneylineFeed(withSpread,mlLive);});
  cache.set(key,p);p.catch(()=>cache.delete(key));return p;
 }};
})();

