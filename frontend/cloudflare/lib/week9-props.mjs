import {lineProbabilities} from './distribution-tail-math.mjs';
import {projectionAvailability,playerKey} from './player-prop-availability.mjs';
const implied=o=>o<0?-o/(100-o):100/(100+o);
const payout=o=>o>0?o/100:100/-o;
export function propCandidates(history,quotes,availability,rosters,now=Date.now()){
 if(history.week!==9||quotes.week!==9||availability.week!==9||availability.status!=='CURRENT'||now-Date.parse(availability.observed_at)>30*60000)return [];
 const byName=new Map(Object.entries(history.players).map(([n,p])=>[playerKey(n),{name:n,...p}]));
 const candidates=[],seen=new Set();
 for(const q of [...(quotes.snapshots||[])].sort((a,b)=>Date.parse(b.captured_at)-Date.parse(a.captured_at))){
  const p=byName.get(playerKey(q.player)),x=p?.stats[q.stat];
  const age=now-Date.parse(q.captured_at),kickoff=Date.parse(p?.kickoff);
  if(!x||q.book!=='draftkings'||q.week!==9||q.snapshot_kind!=='CURRENT'||q.game_id!==p.game_id||!Number.isFinite(age)||age<0||age>60*60000||kickoff<=now)continue;
  const identity=p.name+'|'+q.stat+'|'+q.book;if(seen.has(identity))continue;seen.add(identity);
  const team=rosters[p.team],roster=team?.players.find(r=>playerKey(r.name)===playerKey(p.name));
  const official=availability.games.find(g=>g.team===p.team&&String(g.event_id)===String(p.event_id));
  const injury=availability.injuries.find(i=>i.team===p.team&&playerKey(i.name)===playerKey(p.name));
  const game={event_id:p.event_id,kickoff:p.kickoff,home_team:p.team,away_team:p.opponent};
  const active=projectionAvailability({name:p.name,roster,game,official,injury,now});
  if(active.state!=='AVAILABLE'||!active.confirmed_for_game)continue;
  if(![q.line,q.over_price,q.under_price].every(v=>typeof v==='number'&&Number.isFinite(v))||!q.over_price||!q.under_price)continue;
  const model=lineProbabilities(x.distribution,q.line),observed=x.observed_values||[];
  if(observed.length<4)continue;
  const probability=Object.fromEntries(['over','under','push'].map(side=>[side,(observed.filter(v=>side==='over'?v>q.line:side==='under'?v<q.line:v===q.line).length+4*model[side])/(observed.length+4)])),sum=implied(q.over_price)+implied(q.under_price);
  for(const [side,win,loss,odds,fair] of [['Over',probability.over,probability.under,q.over_price,implied(q.over_price)/sum],['Under',probability.under,probability.over,q.under_price,implied(q.under_price)/sum]]){
   const conditional=win/(win+loss),ev=win*payout(odds)-loss,edge=conditional-fair;
   if(conditional<.55||edge<.03||ev<.02)continue;
   candidates.push({selection:p.name+' '+side+' '+q.line+' '+q.stat.replaceAll('_',' '),player:p.name,game_id:p.game_id,kickoff:p.kickoff,odds,probability:conditional,expected_value:ev,edge,book:q.book,captured_at:q.captured_at,model_status:history.validation_status,
    rationale:`Weeks 1–8 average ${x.season_average.toFixed(1)} (${x.season_games} games); historical prior ${x.historical_mean.toFixed(1)}; ${p.opponent} allows ${x.opponent_position_allowed?.toFixed(1)??'unavailable'} to ${p.position}s per game, league ${x.league_position_allowed.toFixed(1)}. Shrunk matchup projection ${x.projected_mean.toFixed(1)}. Historical ${side.toLowerCase()} hit ${observed.filter(v=>side==='Over'?v>q.line:v<q.line).length}/${observed.length} at this line; final estimate blends those outcomes with the matchup distribution.`,availability:active.label,availability_source:active.source_url});
  }
 }
 const selected=[],players=new Set(),gameCounts=new Map();
 for(const c of candidates.sort((a,b)=>b.probability-a.probability)){
  if(players.has(c.player)||(gameCounts.get(c.game_id)||0)>=1)continue;
  selected.push(c);players.add(c.player);gameCounts.set(c.game_id,(gameCounts.get(c.game_id)||0)+1);if(selected.length===3)break;
 }
 return selected;
}
async function json(url){const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Prop input unavailable');return r.json();}
export async function currentProps(){
 const [history,published,availability,relay]=await Promise.all([json(new URL('../data/week9-prop-history.json',import.meta.url)),json('/cloudflare/api/published/frontend/ctd-cloudflare-work/data/market/player-prop-board-quotes-2026.json').catch(()=>({week:9,snapshots:[]})),json('/api/live/availability'),json('/api/live/prop-quotes').catch(()=>null)]);
 const now=Date.now(),teams=[...new Set(Object.values(history.players).filter(p=>Date.parse(p.kickoff)>now&&Date.parse(p.kickoff)-now<=2*3600000).map(p=>p.team))];
 const rosters=Object.fromEntries(await Promise.all(teams.map(async team=>{try{
  const payload=await json(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${team==='LA'?'lar':team.toLowerCase()}/roster`),players=[];
  for(const group of payload.athletes||[])for(const a of group.items||[])players.push({name:a.displayName||a.fullName,team,captured_at:new Date().toISOString(),roster_status:a.status?.type||a.status?.abbreviation||a.status?.name,injury_reports:[]});
  return [team,{players,team_name:payload.team?.displayName}];
 }catch{return [team,{players:[]}];}})));
 const statMap={player_pass_yds:'passing_yards',player_rush_yds:'rushing_yards',player_reception_yds:'receiving_yards'};
 const live=[];
 if(relay?.week===9)for(const q of relay.quotes||[]){
  const entry=Object.entries(history.players).find(([name,p])=>playerKey(name)===playerKey(q.player)&&Date.parse(p.kickoff)===Date.parse(q.kickoff));if(!entry)continue;const [name,p]=entry;
  const own=rosters[p.team]?.team_name,opp=rosters[p.opponent]?.team_name;
  if(!own||!opp||!([q.home_team,q.away_team].includes(own)&&[q.home_team,q.away_team].includes(opp)))continue;
  if(!statMap[q.market])continue;
  live.push({player:name,week:9,game_id:p.game_id,book:q.book,stat:statMap[q.market],line:q.line,over_price:q.over,under_price:q.under,captured_at:q.provider_updated_at||q.observed_at,snapshot_kind:'CURRENT'});
 }
 const quotes={week:9,generated_at:live.length?relay.last_success_at:published.generated_at,snapshots:[...live,...(published.week===9?published.snapshots||[]:[])]};
 const props=propCandidates(history,quotes,availability,rosters,now);
 return {props,props_status:props.length?'CURRENT':'NO_VERIFIED_PROP_PICK',prop_quote_as_of:quotes.generated_at,prop_model:history.model_version,prop_method:history.method};
}
