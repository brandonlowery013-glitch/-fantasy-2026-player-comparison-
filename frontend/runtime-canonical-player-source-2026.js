(()=>{
 const RAW='https://raw.githubusercontent.com/brandonlowery013-glitch/-fantasy-2026-player-comparison-/main/';
 const get=async p=>{const r=await fetch(RAW+p+'?ts='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error(p+' '+r.status);return r.json()};
 (async()=>{try{
  const manifest=await get('MODEL_SOURCE_OF_TRUTH.json');
  if(manifest.active_player_model!==166||manifest.runtime_player_shards!==14)throw Error('Canonical source contract mismatch');
  const raw=(await Promise.all(Array.from({length:14},(_,i)=>get('players'+i+'.json')))).flat();
  const names=new Set(raw.map(p=>p.n));
  if(raw.length!==166||names.size!==166||['Kaleb Johnson','Corey Kiner','Tank Dell','Jonnu Smith'].some(n=>!names.has(n)))throw Error('Canonical universe mismatch');
  const players=raw.map(p=>({name:p.n,pos:p.p,team:p.t,overall:p.o,trueRank:p.tr,posRank:p.pr,score:p.s,production:p.pd,ceiling:p.ce,role:p.r,environment:p.e,availability:p.a,reliability:p.rl,sustainability:p.su,adp:p.ad,price:p.px,healthStatus:p.st,projectedPpr:p.mp,projection:p.m,overallWriteup:p.en}));
  window.CTD_CANONICAL_PLAYERS_2026=players;
  window.CTD_CANONICAL_PLAYER_SOURCE={status:'READY',rows:166,unique:166,source:RAW+'MODEL_SOURCE_OF_TRUTH.json',effective_date:manifest.effective_date};
  document.documentElement.dataset.ctdCanonicalPlayerSource='READY';
  document.dispatchEvent(new CustomEvent('ctd:canonical-players-ready',{detail:window.CTD_CANONICAL_PLAYER_SOURCE}));
 }catch(e){window.CTD_CANONICAL_PLAYER_SOURCE={status:'FAIL',message:String(e)};document.documentElement.dataset.ctdCanonicalPlayerSource='FAIL';document.dispatchEvent(new Event('ctd:canonical-players-failed'));console.error('Canonical data failed',e)}})();
})();
