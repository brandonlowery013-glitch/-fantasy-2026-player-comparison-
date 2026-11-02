const VERSION='weekly-receiving-usage-v1';
export function mergeSupplemental(projection,distribution,feed,{week,now=Date.now(),blockedTeams=[]}={}){
 if(!projection||!distribution||feed?.season!==2026||Number(feed.week)!==Number(week)||feed.sportsbook_inputs_used!==false)return {projection,distribution};
 const extra=Object.values(feed.players||{}).filter(p=>p.model_version===VERSION&&!projection.players?.[p.player]&&!blockedTeams.includes(p.team)&&p.week===Number(week)&&Date.parse(p.kickoff)>now&&Date.parse(p.generated_at)<=now&&now-Date.parse(p.generated_at)<=24*3600000);
 return {projection:{...projection,players:{...Object.fromEntries(extra.map(p=>[p.player,p.projection])),...projection.players}},distribution:{...distribution,distributions:{...Object.fromEntries(extra.map(p=>[p.player,p.distribution])),...distribution.distributions}}};
}
