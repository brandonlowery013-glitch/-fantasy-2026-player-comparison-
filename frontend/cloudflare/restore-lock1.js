(()=>{
  const load=(src)=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.head.appendChild(s)});
  const base='https://raw.githubusercontent.com/brandonlowery013-glitch/-fantasy-2026-player-comparison-/251a16428d468cd3eb764ef3218f1049d4d9b588/frontend/cloudflare/restore-lock1.js';
  load(base)
    .then(()=>load('./game-dashboard-enhancements.js'))
    .then(()=>load('./live-score-poller.js'))
    .catch(err=>console.error('CTD frontend enhancement bootstrap failed',err));
})();
