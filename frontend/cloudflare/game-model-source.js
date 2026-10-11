(()=>{
 const ROOT='https://raw.githubusercontent.com/brandonlowery013-glitch/-fantasy-2026-player-comparison-/';
 const HEAD='https://api.github.com/repos/brandonlowery013-glitch/-fantasy-2026-player-comparison-/git/ref/heads/main';
 const paths={recommendations:['data/market/weekly-game-market-recommendations-2026.json','all-game-model-rerun-2026.json'],projections:['data/probability/generated/weekly-game-projections-2026.json','all-game-rerun-projections-2026.json'],schedule:['data/calibration/weekly-event-schedule-2026.json'],lines:['data/market/current-game-lines-2026.json']};
 const cache=new Map(),releases=new Map();
 const read=async url=>{const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Game model unavailable: '+r.status);return r.json()};
 function release(slot){if(!releases.has(slot)){releases.clear();releases.set(slot,read(HEAD).then(x=>{if(x.ref!=='refs/heads/main'||x.object?.type!=='commit'||!/^[a-f0-9]{40}$/.test(x.object?.sha||''))throw Error('Invalid producer release');return x.object.sha;}).catch(()=> 'main'));}return releases.get(slot);}
 function select(base,rerun){return rerun?.rerun===true&&rerun.actionable===false&&rerun.season===base.season&&rerun.week===base.week&&Object.keys(base.games||{}).every(id=>rerun.games?.[id])?rerun:base;}
 window.CTD_GAME_MODEL={select,release:()=>release(Math.floor(Date.now()/300000)),load(kind='recommendations'){
  if(!paths[kind])return Promise.reject(Error('Unknown game model source'));
  const slot=Math.floor(Date.now()/300000),key=kind+slot;if(cache.has(key))return cache.get(key);
  for(const old of cache.keys())if(old.startsWith(kind))cache.delete(old);
  const [normal,rerun]=paths[kind];const p=release(slot).then(async sha=>{const [base,recalculated]=await Promise.all([read(ROOT+sha+'/'+normal),rerun?read(rerun).catch(()=>null):null]);return rerun?select(base,recalculated):base;});
  cache.set(key,p);p.catch(()=>cache.delete(key));return p;
 }};
})();
