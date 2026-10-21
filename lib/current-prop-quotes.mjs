const kinds=new Set(['EARLY','OPEN','CURRENT','PREDICTION_TIME']);
export function currentPropQuotes(evaluations,{week,now=Date.now(),staleAfterMinutes=150}={}){
 const groups=new Map();
 for(const e of evaluations){
  const at=Date.parse(e.captured_at),kickoff=Date.parse(e.kickoff);
  if(!kinds.has(e.snapshot_kind)||Number(e.week)!==Number(week)||!Number.isFinite(at)||at>now+300000||now-at>staleAfterMinutes*60000||Number.isFinite(kickoff)&&kickoff<=now)continue;
  const key=JSON.stringify([e.stat,e.book,e.game_id||null]);const old=groups.get(key);
  if(!old||at>Date.parse(old.captured_at))groups.set(key,e);
 }
 const stats={};for(const e of groups.values())(stats[e.stat]??=[]).push(e);
 return Object.fromEntries(Object.entries(stats).map(([stat,rows])=>[stat,rows.sort((a,b)=>(b.recommendation.decision==='PICK')-(a.recommendation.decision==='PICK')||b.recommendation.expected_value-a.recommendation.expected_value||Date.parse(b.captured_at)-Date.parse(a.captured_at))[0]]));
}
