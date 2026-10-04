const central=at=>Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(at)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
const day=p=>`${p.year}-${p.month}-${p.day}`;
export function quarterbackRefreshPlan({games,reports=[],completedKeys=[],now}) {
 const at=Date.parse(now);if(!Number.isFinite(at))throw new Error('Invalid refresh time');
 const done=new Set(completedKeys),tasks=[],today=day(central(at));
 const add=t=>{if(!done.has(t.key)&&!tasks.some(x=>x.key===t.key))tasks.push(t);};
 for(const g of games){
  const start=Date.parse(g.kickoff);if(!g.verified||!Number.isFinite(start)||at>=start)continue;
  for(const r of reports.filter(r=>r.game_id===g.id&&r.id&&r.verified===true&&Number.isFinite(Date.parse(r.received_at))&&Date.parse(r.received_at)<=at))add({key:`report:${g.id}:${r.id}`,game_ids:[g.id],reason:'QUARTERBACK_REPORT'});
  const local=central(start),mins=+local.hour*60+(+local.minute),current=central(at),currentMins=+current.hour*60+(+current.minute);
  const inWindow=day(local)===today&&(mins<630?at>=start-90*60000:currentMins>=630);
  if(inWindow)add({key:`pregame:${g.id}:${Math.floor(at/300000)}`,game_ids:[g.id],reason:'FIVE_MINUTE_PREGAME'});
 }
 const waves=new Map();
 for(const g of games){const start=Date.parse(g.kickoff);if(!g.verified||!Number.isFinite(start)||at-start>24*3600000||start-at>24*3600000)continue;const p=central(start),hour=+p.hour,key=`${day(p)}:${hour<10?'early':hour<14?'noon':hour<18?'afternoon':'night'}`;if(!waves.has(key))waves.set(key,[]);waves.get(key).push(g);}
 for(const [key,gs] of waves)if(gs.every(g=>Date.parse(g.kickoff)<=at&&g.completed===true))add({key:`final:${key}`,game_ids:gs.map(g=>g.id),reason:'ALL_GAMES_IN_WAVE_FINAL'});
 return tasks;
}
