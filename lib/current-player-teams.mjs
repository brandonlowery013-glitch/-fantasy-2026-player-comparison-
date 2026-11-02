// Current roster context is separate from the locked season model.
export const normalizePlayerName=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
export function athleteRows(payload){
 const out=[],seen=new WeakSet();
 function walk(x,position=''){
  if(Array.isArray(x)){for(const v of x)walk(v,position);return;}
  if(!x||typeof x!=='object'||seen.has(x))return;seen.add(x);
  const pos=x.position?.abbreviation||position;
  const a=x.athlete||x,name=a.displayName||a.fullName,id=a.id;
  if(name&&id&&a.position?.abbreviation)out.push({name,id:String(id),position:a.position.abbreviation});
  else if(name&&id&&pos)out.push({name,id:String(id),position:pos});
  for(const [k,v]of Object.entries(x))if(v&&typeof v==='object'&&!['links','images','headshot','team'].includes(k))walk(v,pos);
 }
 walk(payload);return [...new Map(out.map(r=>[r.id+'|'+r.position,r])).values()];
}
export function resolveCurrentTeams(players,teams,observedAt=new Date().toISOString()){
 const result={},blocked=[];
 for(const p of players){
  const records=teams.flatMap(t=>['depth','roster'].flatMap(source=>(t[source]||[]).filter(r=>normalizePlayerName(r.name)===normalizePlayerName(p.n)&&r.position===p.p).map(r=>({...r,team:t.name,source,source_url:t[source+'_url']}))));
  const roster=records.filter(r=>r.source==='roster'),depth=records.filter(r=>r.source==='depth');
  const unique=[...new Set(roster.map(r=>r.team+'|'+r.id))];
  let current=p.t,id=null,status='UNRESOLVED_LIVE_TEAM';
  if(unique.length===1){
   const r=roster[0];id=r.id;
   if(r.team===p.t){current=r.team;status='MATCH';}
   else if(depth.some(d=>d.team===r.team&&d.id===r.id)){current=r.team;status='VERIFIED_TEAM_CHANGE';}
   else {status='TEAM_CHANGE_NOT_CORROBORATED';blocked.push(p.n+': new roster team lacks matching depth athlete identity');}
  } else if(unique.length>1){
   const matches=roster.filter(r=>r.team===p.t);
   if(matches.length===1){id=matches[0].id;status='MATCH_NAME_COLLISION';}
   else {status='AMBIGUOUS_LIVE_IDENTITY';blocked.push(p.n+': multiple current roster identities');}
  }
  result[p.n]={player:p.n,position:p.p,model_team:p.t,current_team:current,athlete_id:id,status,sources:records.map(r=>({team:r.team,athlete_id:r.id,kind:r.source,url:r.source_url}))};
 }
 return {schema_version:1,season:2026,observed_at:observedAt,status:blocked.length?'BLOCKED':'PASS',universe:players.length,players:result,blocked,policy:'Team changes require a unique name/position roster identity corroborated by the same athlete ID on the new team depth chart. Locked model files are not changed.'};
}
export function applyCurrentTeams(players,identity,now=Date.now()){
 const at=Date.parse(identity?.observed_at);
 if(identity?.season!==2026||identity.status!=='PASS'||identity.universe!==players.length||!Number.isFinite(at)||at>now+300000||now-at>12*3600000)throw Error('Current team identity is missing, stale or blocked');
 return players.map(p=>{const r=identity.players?.[p.n];if(!r||r.position!==p.p||r.model_team!==p.t||!r.current_team)throw Error('Current team identity does not match locked player: '+p.n);return {...p,t:r.current_team};});
}
