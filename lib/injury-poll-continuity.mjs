const adverse=r=>['Q','D','O','IR','SSPD'].includes(r.designation);
const key=r=>JSON.stringify([r.player,r.team,r.source]);

// An absent row is not a clearance report. This also covers partial responses
// and successful endpoints that stop listing an injured player.
export function retainUnresolvedInjuries(previous, incoming, capturedAt) {
  const next=new Map(incoming.map(r=>[key(r),{...r,last_seen_at:capturedAt,carried_forward:false}]));
  for(const old of previous?.players||[]) {
    if(!adverse(old))continue;
    const incoming=next.get(key(old));
    if(incoming&&!(Number.isFinite(Date.parse(old.source_updated_at))&&(!Number.isFinite(Date.parse(incoming.source_updated_at))||Date.parse(incoming.source_updated_at)<Date.parse(old.source_updated_at))))continue;
    next.set(key(old),{...old,carried_forward:true,last_seen_at:old.last_seen_at||previous.captured_at||null});
  }
  return [...next.values()];
}
