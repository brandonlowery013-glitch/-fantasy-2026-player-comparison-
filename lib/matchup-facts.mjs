export const canon=s=>({WAS:'WSH',LA:'LAR',JAC:'JAX'}[s]||s);
const number=s=>s==null||s===''?null:Number.isFinite(Number(s))?Number(s):null;
export function previousGames(schedule,kickoff){return (schedule.events||[]).filter(e=>e.competitions?.[0]?.status?.type?.completed===true&&Date.parse(e.date)<Date.parse(kickoff)).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)).slice(0,3);}
export function teamFacts(team,summaries){
 const rows=summaries.flatMap(s=>{const own=s.boxscore?.teams?.find(x=>canon(x.team?.abbreviation)===canon(team)),opp=s.boxscore?.teams?.find(x=>canon(x.team?.abbreviation)!==canon(team));if(!own||!opp)return [];const stats=x=>Object.fromEntries(x.statistics.map(v=>[v.name,v.displayValue]));return [{own:stats(own),opp:stats(opp),id:s.header?.id}];});
 if(!rows.length)return [];
 const avg=(side,key)=>{const vals=rows.map(r=>number(r[side][key])).filter(x=>x!=null);return vals.length===rows.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;};
 const fmt=n=>n.toFixed(1),facts=[],source='ESPN box scores · last '+rows.length+' completed games',add=text=>facts.push({text,source,game_ids:rows.map(r=>r.id)});
 const plays=avg('own','totalOffensivePlays'),rush=avg('own','rushingAttempts'),passAllowed=avg('opp','netPassingYards'),rushAllowed=avg('opp','rushingYards'),oppRush=avg('opp','rushingAttempts');
 if(plays!=null&&rush!=null&&plays>0)add(`${team} averaged ${fmt(plays)} offensive plays, with ${fmt(100*(plays-rush)/plays)}% passing plays (including sacks) and ${fmt(rush)} runs per game.`);
 if(passAllowed!=null&&rushAllowed!=null)add(`${team}'s defense allowed ${fmt(passAllowed)} net passing yards and ${fmt(rushAllowed)} rushing yards per game${oppRush>0?`, or ${fmt(rushAllowed/oppRush)} yards per carry`:''}.`);
 for(const [side,label] of [['own','allowed'],['opp','made']]){const sacks=rows.map(r=>r[side].sacksYardsLost?.match(/^(\d+)[-–]/)?.[1]).map(number);if(sacks.every(n=>n!=null))add(`${team} ${label} ${sacks.reduce((a,b)=>a+b,0)} sacks across these ${rows.length} games.`);}
 return facts;
}
export async function loadMatchup(game,get){
 const kickoff=game.kickoff||game.event_start||game.start_at,year=new Date(kickoff).getUTCFullYear();if(!Number.isFinite(Date.parse(kickoff)))throw Error('Missing game date');
 const teams=[canon(game.away_team),canon(game.home_team)],schedules=await Promise.all(teams.map(t=>get(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${t.toLowerCase()}/schedule?season=${year}&seasontype=2`)));
 const prior=schedules.map(s=>previousGames(s,kickoff)),ids=[...new Set(prior.flat().map(g=>g.id))];
 const summaries=new Map(await Promise.all(ids.map(async id=>[id,await get(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${id}`)])));
 return {home:teams[1],away:teams[0],kickoff,facts:teams.flatMap((t,i)=>teamFacts(t,prior[i].map(g=>summaries.get(g.id)))),history_before:kickoff,observed_at:new Date().toISOString()};
}
