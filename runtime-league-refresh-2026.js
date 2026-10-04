(function(root){
 const central=stamp=>Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(stamp)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 function plan(events,now=Date.now()){
  const t=central(now),day=`${t.year}${t.month}${t.day}`,minute=Number(t.hour)*60+Number(t.minute);
  const all=events.filter(g=>Number.isFinite(Date.parse(g.date)));
  const gameDay=g=>{const d=central(g.date);return `${d.year}${d.month}${d.day}`;};
  const games=all.filter(g=>gameDay(g)===day);
  const prior=all.filter(g=>gameDay(g)<day&&now-Date.parse(g.date)<18*3600000);
  const priorKeys=prior.length&&prior.every(g=>g.status?.type?.completed===true)?[`${gameDay(prior[0])}:final:night`]:[];
  const priorRunning=prior.some(g=>g.status?.type?.completed!==true);
  if(!games.length)return {day,keys:priorKeys,checkScores:priorRunning};
  const regular=games.filter(g=>{const c=central(g.date);return Number(c.hour)*60+Number(c.minute)>=630;});
  const first=Math.min(...(regular.length?regular:games).map(g=>Date.parse(g.date)));
  if(now<first)return {day,keys:minute>=630?[`${day}:pregame:${Math.floor(minute/5)}`]:[],checkScores:false};
  const groups=new Map();for(const g of games){const h=Number(central(g.date).hour),slot=h<14?'noon':h<18?'afternoon':'night';if(!groups.has(slot))groups.set(slot,[]);groups.get(slot).push(g);}
  const keys=[...groups].filter(([,gs])=>gs.every(g=>g.status?.type?.completed===true)).map(([slot])=>`${day}:final:${slot}`);
  return {day,keys:[...priorKeys,...keys],checkScores:priorRunning||[...groups.values()].some(gs=>gs.some(g=>g.status?.type?.completed!==true))};
 }
 root.CTD_LEAGUE_REFRESH={plan,central};
})(typeof window!=='undefined'?window:globalThis);
