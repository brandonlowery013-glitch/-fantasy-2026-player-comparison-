(()=>{
 const RAW='https://raw.githubusercontent.com/brandonlowery013-glitch/-fantasy-2026-player-comparison-/main/';
 const get=async p=>{const r=await fetch(RAW+p+'?ts='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error(p+' '+r.status);return r.json()};
 (async()=>{try{
  const manifest=await get('MODEL_SOURCE_OF_TRUTH.json');
  const expected=manifest.active_player_model,shards=manifest.runtime_player_shards;
  if(!Number.isSafeInteger(expected)||expected<1||!Number.isSafeInteger(shards)||shards<1||shards>expected)throw Error('Canonical source contract mismatch');
  const raw=(await Promise.all(Array.from({length:shards},(_,i)=>get('players'+i+'.json')))).flat();
  const names=new Set(raw.map(p=>p.n));
  if(raw.length!==expected||names.size!==expected||raw.some(p=>typeof p.n!=='string'||!p.n.trim()))throw Error('Canonical universe mismatch');
  const players=raw.map(p=>({name:p.n,pos:p.p,team:p.t,overall:p.o,trueRank:p.tr,posRank:p.pr,score:p.s,production:p.pd,ceiling:p.ce,role:p.r,environment:p.e,availability:p.a,reliability:p.rl,sustainability:p.su,adp:p.ad,price:p.px,healthStatus:p.st,projectedPpr:p.mp,projection:p.m,overallWriteup:p.en}));
  window.CTD_CANONICAL_PLAYERS_2026=players;
  window.CTD_CANONICAL_PLAYER_SOURCE={status:'READY',rows:raw.length,unique:names.size,source:RAW+'MODEL_SOURCE_OF_TRUTH.json',effective_date:manifest.effective_date};
  document.documentElement.dataset.ctdCanonicalPlayerSource='READY';
  document.dispatchEvent(new CustomEvent('ctd:canonical-players-ready',{detail:window.CTD_CANONICAL_PLAYER_SOURCE}));
 }catch(e){window.CTD_CANONICAL_PLAYER_SOURCE={status:'FAIL',message:String(e)};document.documentElement.dataset.ctdCanonicalPlayerSource='FAIL';document.dispatchEvent(new Event('ctd:canonical-players-failed'));console.error('Canonical data failed',e)}})();
})();

// The Cloudflare LOCK1 entrypoint already loads this runtime. Use that stable
// bootstrap point to execute the merged main live-game runtime plus the
// Cloudflare adapters that bind ESPN live data to BET_FEED and game panels.
(()=>{
 if(window.__CTD_LIVE_CLOUDFLARE_BOOTSTRAP_2026__)return;
 window.__CTD_LIVE_CLOUDFLARE_BOOTSTRAP_2026__=true;
 const MAIN_LIVE='https://raw.githubusercontent.com/brandonlowery013-glitch/-fantasy-2026-player-comparison-/main/runtime-live-game-center-2026.js?v=20260917-cloudflare-live';
 const local=name=>new URL(name,document.baseURI).href;
 const SOURCES=[
  ['main-live-game-center',MAIN_LIVE],
  ['cloudflare-live-score-poller',local('live-score-poller.js?v=20260917-live')],
  ['cloudflare-game-detail-panels',local('game-detail-panels.js?v=20260917-live')]
 ];
 window.CTD_LIVE_RUNTIME_LOADS=window.CTD_LIVE_RUNTIME_LOADS||{};
 async function execute(name,url){
  const record={url,ok:false,requested_at:new Date().toISOString()};
  window.CTD_LIVE_RUNTIME_LOADS[name]=record;
  try{
   const response=await fetch(url,{cache:'no-store'});
   if(!response.ok)throw Error(`HTTP ${response.status}`);
   const code=await response.text();
   const script=document.createElement('script');
   script.dataset.ctdLiveRuntime=name;
   script.textContent=`${code}\n//# sourceURL=${url}`;
   document.head.appendChild(script);
   record.ok=true;
   record.loaded_at=new Date().toISOString();
  }catch(error){
   record.error=String(error?.message||error);
   console.error(`CTD live runtime failed: ${name}`,error);
  }
  return record;
 }
 async function start(){
  for(const source of SOURCES)await execute(...source);
  const ok=SOURCES.every(([name])=>window.CTD_LIVE_RUNTIME_LOADS[name]?.ok===true);
  document.documentElement.dataset.ctdLiveRuntimeBootstrap=ok?'READY':'DEGRADED';
  document.dispatchEvent(new CustomEvent('ctd:live-runtime-bootstrap',{detail:{ok,loads:window.CTD_LIVE_RUNTIME_LOADS}}));
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else void start();
})();
