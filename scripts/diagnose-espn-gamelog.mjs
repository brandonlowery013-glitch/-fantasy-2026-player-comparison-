const u='https://site.api.espn.com/apis/search/v2?query=Patrick%20Mahomes&limit=10&sport=football';
const r=await fetch(u,{headers:{'user-agent':'fantasy-2026-probability-pipeline'}});console.log('status',r.status);const j=await r.json();console.log(JSON.stringify(j,null,2).slice(0,12000));
