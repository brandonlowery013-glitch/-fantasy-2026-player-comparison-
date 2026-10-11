const time=value=>Date.parse(String(value||''));
export function providerGameFinal(status){
  return status?.completed===true||String(status?.state||'').toLowerCase()==='post';
}

export function chooseWeek(games,now,forced=null,currentWeek=null){
  if(forced!=null){
    const week=Number(forced);
    if(Number.isInteger(week)&&week>=1&&week<=18)return week;
    throw new Error(`Invalid NFL_WEEK ${forced}`);
  }
  const valid=games.filter(g=>Number.isInteger(Number(g.week))&&Number(g.week)>=1&&Number(g.week)<=18&&Number.isFinite(time(g.event_start))&&(currentWeek==null||Number(g.week)>=currentWeek));
  // Kickoff is not completion. Keep a live, delayed, postponed or unknown
  // current game until the provider explicitly confirms final state.
  const unfinished=valid.filter(g=>g.completed!==true).sort((a,b)=>time(a.event_start)-time(b.event_start));
  if(unfinished.length)return Number(unfinished[0].week);
  const future=valid.filter(g=>time(g.event_start)>=now).sort((a,b)=>time(a.event_start)-time(b.event_start));
  if(future.length)return Number(future[0].week);
  const past=valid.filter(g=>time(g.event_start)<now).sort((a,b)=>time(b.event_start)-time(a.event_start));
  return past.length?Number(past[0].week):null;
}
