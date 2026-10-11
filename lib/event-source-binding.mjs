const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function parseEventDepth(payload){
  const rows=[];
  const walk=x=>{
    if(Array.isArray(x)){ for(const y of x) walk(y); return; }
    if(!x || typeof x!=='object') return;
    const pos=String(x.position?.abbreviation||x.position?.name||x.name||x.position||'').toUpperCase();
    const athletes=x.athletes||x.items;
    if(Array.isArray(athletes)) for(const [index,a] of athletes.entries()){
      const athlete=a.athlete||a;
      const name=athlete.displayName||athlete.fullName||athlete.name;
      const rank=Number(a.rank??athlete.rank??(x.position ? index+1 : 0));
      const position=String(athlete.position?.abbreviation||pos||'').toUpperCase();
      if(name && rank && ['QB','RB','WR','TE'].includes(position)) rows.push({name,rank,position,athlete_id:athlete.id?String(athlete.id):null});
    }
    for(const v of Object.values(x)) if(v && typeof v==='object') walk(v);
  };
  walk(payload.depthchart||payload.depthcharts||payload.items||payload);
  const seen=new Set();
  return rows.filter(r=>{ const k=`${norm(r.name)}|${r.position}|${r.rank}`; if(seen.has(k)) return false; seen.add(k); return true; });
}


export function leagueInjuriesByTeam(payload){
  if(!Array.isArray(payload?.injuries)||payload.injuries.length!==32)throw Error('League injury feed must contain 32 teams');
  const by=new Map();
  for(const team of payload.injuries){
    if(!team.id||by.has(String(team.id))||!Array.isArray(team.injuries))throw Error('Invalid or duplicate injury team');
    by.set(String(team.id),team);
  }
  return by;
}
