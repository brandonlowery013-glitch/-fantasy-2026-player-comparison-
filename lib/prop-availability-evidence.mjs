import {resolveAvailability} from './injury-evidence.mjs';
import {projectionAvailability,playerKey} from './player-prop-availability.mjs';
export function propAvailabilityEvidence({name,context,game,feed,now=Date.now()}={}){
 const team=context?.signals?.role?.evidence?.team;
 const fresh=feed?.week===Number(game?.week)&&Date.parse(feed?.observed_at)<=now+300000&&now-Date.parse(feed?.observed_at)<=30*60000;
 const rosters=fresh?Object.values(feed.rosters||{}).flatMap(t=>(t.players||[]).map(p=>({...p,captured_at:t.captured_at}))):[];
 const matches=rosters.filter(p=>playerKey(p.name)===playerKey(name)&&[game?.home_team,game?.away_team].includes(p.team));
 const roster=matches.length===1?matches[0]:null,code=roster?.team||team;
 const official=fresh?(feed.games||[]).find(g=>g.team===code&&String(g.event_id)===String(game?.provider_event_id||game?.event_id)&&Date.parse(g.kickoff)===Date.parse(game?.event_start||game?.kickoff)):null;
 const injuries=fresh?(feed.injuries||[]).filter(i=>i.team===code&&playerKey(i.name)===playerKey(name)):[];
 const injury=injuries.sort((a,b)=>(Date.parse(b.source_updated_at)||0)-(Date.parse(a.source_updated_at)||0))[0];
 const projection=projectionAvailability({name,context,game,roster,official,injury,now});
 if(projection.confirmed_for_game)return {projection,availability:{expected_active:projection.state==='AVAILABLE',availability_status:projection.state==='AVAILABLE'?'CONFIRMED_ACTIVE':'CONFIRMED_INACTIVE',basis:'OFFICIAL_GAME_DAY_REPORT',source_url:projection.source_url,observed_at:projection.observed_at}};
 const signals={...(context?.signals||{})};
 const prior=signals.injury?.evidence||signals.injury;
 if(injury&&(!prior||Date.parse(injury.source_updated_at)>=Date.parse(prior.source_updated_at)||!Number.isFinite(Date.parse(prior.source_updated_at))))signals.injury={evidence:injury};
 const availability=resolveAvailability(signals,now);
 if(projection.state==='UNAVAILABLE')return {projection,availability:{...availability,expected_active:false,availability_status:'EXPECTED_INACTIVE',basis:projection.reason}};
 return {projection,availability};
}
