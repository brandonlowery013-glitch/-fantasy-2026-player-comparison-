(()=>{
 const RAW='https://raw.githubusercontent.com/brandonlowery013-glitch/-fantasy-2026-player-comparison-/main/';
 const paths={recommendations:['data/market/weekly-game-market-recommendations-2026.json','all-game-model-rerun-2026.json'],projections:['data/probability/generated/weekly-game-projections-2026.json','all-game-rerun-projections-2026.json']};
 const cache=new Map();
 const read=async url=>{const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('Game model unavailable: '+r.status);return r.json()};
 function select(base,rerun){return rerun?.rerun===true&&rerun.actionable===false&&rerun.season===base.season&&rerun.week===base.week&&Object.keys(base.games||{}).every(id=>rerun.games?.[id])?rerun:base;}
 window.CTD_GAME_MODEL={select,load(kind='recommendations'){
  if(!paths[kind])return Promise.reject(Error('Unknown game model source'));
  const slot=Math.floor(Date.now()/300000),key=kind+slot;if(cache.has(key))return cache.get(key);
  for(const old of cache.keys())if(old.startsWith(kind))cache.delete(old);
  const [normal,rerun]=paths[kind];const p=Promise.all([read(RAW+normal+'?refresh='+slot),read(rerun).catch(()=>null)]).then(([base,recalculated])=>select(base,recalculated));
  cache.set(key,p);p.catch(()=>cache.delete(key));return p;
 }};
})();
