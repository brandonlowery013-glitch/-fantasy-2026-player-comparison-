export function propBoardModel(feed,{now=Date.now(),maxAgeMs=150*60000}={}){
 const players={};
 for(const [name,p]of Object.entries(feed?.players||{})){
  const latest=new Map();
  for(const e of p.weekly?.evaluations||[]){const at=Date.parse(e.captured_at);if(Number(e.week)!==Number(feed.week)||!Number.isFinite(at)||at>now+300000||now-at>maxAgeMs||Date.parse(e.kickoff)<=now)continue;const k=[e.game_id,e.stat,e.book].join('|');if(!latest.has(k)||at>Date.parse(latest.get(k).captured_at))latest.set(k,e);}
  players[name]={position:p.position,team:p.team,weekly:{week:Number(feed.week),evaluations:[...latest.values()].map(({show_work,...e})=>e)}};
 }
 return {schema_version:1,season:feed.season,week:Number(feed.week),generated_at:new Date(now).toISOString(),players};
}
