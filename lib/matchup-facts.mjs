import {teamProfile,currentReport} from './matchup-assessment.mjs';
export const canon=s=>({WAS:'WSH',LA:'LAR',JAC:'JAX'}[s]||s);
const number=s=>s==null||s===''?null:Number.isFinite(Number(s))?Number(s):null;
export function previousGames(schedule,kickoff){return (schedule.events||[]).filter(e=>e.competitions?.[0]?.status?.type?.completed===true&&Date.parse(e.date)<Date.parse(kickoff)).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)).slice(0,3);}
export function teamFacts(team,summaries){
 const rows=summaries.flatMap(s=>{const own=s.boxscore?.teams?.find(x=>canon(x.team?.abbreviation)===canon(team)),opp=s.boxscore?.teams?.find(x=>canon(x.team?.abbreviation)!==canon(team));if(!own||!opp)return [];const stats=x=>Object.fromEntries(x.statistics.map(v=>[v.name,v.displayValue]));return [{own:stats(own),opp:stats(opp),id:s.header?.id}];});
 if(!rows.length)return [];
 const avg=(side,key)=>{const vals=rows.map(r=>number(r[side][key])).filter(x=>x!=null);return vals.length===rows.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;};
 const fmt=n=>n.toFixed(1),facts=[],source=team+' · ESPN box scores · last '+rows.length+' completed games',add=text=>facts.push({text,source,game_ids:rows.map(r=>r.id)});
 const plays=avg('own','totalOffensivePlays'),rush=avg('own','rushingAttempts'),passAllowed=avg('opp','netPassingYards'),rushAllowed=avg('opp','rushingYards'),oppRush=avg('opp','rushingAttempts');
 if(plays!=null&&rush!=null&&plays>0)add(`${team} averaged ${fmt(plays)} offensive plays, with ${fmt(100*(plays-rush)/plays)}% passing plays (including sacks) and ${fmt(rush)} runs per game.`);
 if(passAllowed!=null&&rushAllowed!=null)add(`${team}'s defense allowed ${fmt(passAllowed)} net passing yards and ${fmt(rushAllowed)} rushing yards per game${oppRush>0?`, or ${fmt(rushAllowed/oppRush)} yards per carry`:''}.`);
 for(const [side,label] of [['own','allowed'],['opp','made']]){const sacks=rows.map(r=>r[side].sacksYardsLost?.match(/^(\d+)[-–]/)?.[1]).map(number);if(sacks.every(n=>n!=null))add(`${team} ${label} ${sacks.reduce((a,b)=>a+b,0)} sacks across these ${rows.length} games.`);}
 return facts;
}
export function mergeInjuryReport(summary,payload,now=Date.now()){
 const year=new Date(summary.header?.competitions?.[0]?.date).getUTCFullYear();
 if(payload?.season?.year!==year||!Number.isFinite(Date.parse(payload.timestamp))||Date.parse(payload.timestamp)>now||now-Date.parse(payload.timestamp)>86400000)return summary;
 const competitors=summary.header?.competitions?.[0]?.competitors||[];
 const injuries=competitors.map(c=>{const team=c.team,old=summary.injuries?.find(t=>String(t.team?.id)===String(team.id))?.injuries||[],full=payload.injuries?.find(t=>String(t.id)===String(team.id))?.injuries||[];
  const records=[...old,...full].filter(i=>Number.isFinite(Date.parse(i.date))&&Date.parse(i.date)<=now).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)),byName=new Map();for(const i of records){const key=String(i.athlete?.displayName||i.athlete?.id||'').toLowerCase().replace(/[^a-z0-9]/g,'');if(key&&!byName.has(key))byName.set(key,i);}return {team,injuries:[...byName.values()]};});
 return {...summary,injuries};
}
export async function loadMatchup(game,get){
 const kickoff=game.kickoff||game.event_start||game.start_at,year=new Date(kickoff).getUTCFullYear();if(!Number.isFinite(Date.parse(kickoff)))throw Error('Missing game date');
 const teams=[canon(game.away_team),canon(game.home_team)],schedules=await Promise.all(teams.map(t=>get(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${t.toLowerCase()}/schedule?season=${year}&seasontype=2`)));
 const prior=schedules.map(s=>previousGames(s,kickoff)),ids=[...new Set(prior.flat().map(g=>g.id))];
 const summaries=new Map(await Promise.all(ids.map(async id=>[id,await get(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${id}`)])));
 const target=schedules[0].events?.find(e=>Date.parse(e.date)===Date.parse(kickoff)&&e.competitions?.[0]?.competitors?.some(c=>canon(c.team?.abbreviation)===teams[1]));
 let report=null;if(target){try{let summary=await get(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${target.id}`,true);if(Date.now()<Date.parse(kickoff)){try{summary=mergeInjuryReport(summary,await get('https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries',true));}catch{}}report=currentReport(summary,game);}catch{}}
 return {rest:teams.flatMap((team,i)=>prior[i][0]?[{team,days:Math.round((Date.parse(kickoff)-Date.parse(prior[i][0].date))/86400000)}]:[]),profiles:teams.map((t,i)=>teamProfile(t,prior[i].map(g=>summaries.get(g.id)))),report,home:teams[1],away:teams[0],kickoff,facts:teams.flatMap((t,i)=>teamFacts(t,prior[i].map(g=>summaries.get(g.id)))),history_before:kickoff,observed_at:new Date().toISOString()};
}
