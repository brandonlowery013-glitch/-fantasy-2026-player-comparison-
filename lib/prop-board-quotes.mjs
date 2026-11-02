export function propBoardQuotes(snapshots,{week,now=Date.now(),maxAgeMs=150*60000}={}){
 const byBook=new Map();
 for(const s of snapshots||[]){
  const at=Date.parse(s.captured_at),kickoff=Date.parse(s.kickoff);
  if(s.horizon!=='WEEKLY'||Number(s.week)!==Number(week)||!s.game_id||!s.player||!s.stat||!s.book||!Number.isFinite(at)||at>now+300000||now-at>maxAgeMs||!Number.isFinite(kickoff)||kickoff<=now||!Number.isFinite(Number(s.line))||![s.over_price,s.under_price].every(x=>Number.isInteger(Number(x))&&Math.abs(Number(x))>=100))continue;
  const k=[s.game_id,s.player,s.stat,s.book].join('|');
  if(!byBook.has(k)||at>Date.parse(byBook.get(k).captured_at))byBook.set(k,s);
 }
 return {schema_version:1,season:2026,week:Number(week),generated_at:new Date(now).toISOString(),snapshots:[...byBook.values()].map(s=>Object.fromEntries(['snapshot_id','horizon','week','game_id','kickoff','player','position','athlete_id','team','stat','line','over_price','under_price','book','captured_at','provider_updated_at','provider_event_id','provider_book_title','snapshot_kind','source','market_only','identity_status'].filter(k=>s[k]!==undefined).map(k=>[k,s[k]])))};
}
