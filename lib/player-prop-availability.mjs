// Projection assumptions are distinct from a confirmed game-day active status.
export const playerKey=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
const absent=/^(out|inactive|injured reserve|ir|pup|physically unable to perform|nfi|non-football injury|suspended)$/i;
const concern=/^(questionable|doubtful|unknown)$/i;
const current=(time,now,hours)=>{const at=Date.parse(time);return Number.isFinite(at)&&at<=now+300000&&now-at<=hours*3600000;};
export function projectionAvailability({name,context,roster,game,official,injury,now=Date.now()}={}){
 const kickoff=Date.parse(game?.event_start||game?.kickoff),team=roster?.team||context?.signals?.role?.evidence?.team;
 const role=context?.signals?.role,identity=roster||role?.evidence;
 const result=(state,label,reason,extra={})=>({state,label,reason,can_project:!['UNAVAILABLE','REVIEW'].includes(state),confirmed_for_game:false,...extra});
 if(!identity||!Number.isFinite(kickoff)||!team||![game.home_team,game.away_team].includes(team))return result('REVIEW','Availability needs review','A matching player, team and game are required.');
 const reports=[context?.signals?.injury?.evidence,...(roster?.injury_reports||[]),injury].filter(Boolean).sort((a,b)=>(Date.parse(b.source_updated_at)||0)-(Date.parse(a.source_updated_at)||0));
 const report=reports[0],status=String(report?.display_status||report?.status||'').trim();
 if(report?.conflicting_reports||Date.parse(report?.source_updated_at)>now+300000)return result('REVIEW','Status update needs review','Conflicting or future-dated injury evidence.');
 if(/^(injured reserve|ir|pup|physically unable to perform|nfi|non-football injury|suspended)$/i.test(status))return result('UNAVAILABLE','Reported '+(status||'unavailable'),'The latest report rules this player out; no current projection.',{designation:status,source_updated_at:report?.source_updated_at});
 const matched=official&&official.team===team&&Date.parse(official.kickoff)===kickoff&&String(official.event_id)===String(game.provider_event_id||game.event_id||'')&&official.complete===true;
 if(matched){
  if(official.inactive_names?.some(n=>playerKey(n)===playerKey(name)))return result('UNAVAILABLE','Officially inactive','Listed on the official game-day inactive report.',{confirmed_for_game:true,source_url:official.source_url,observed_at:official.observed_at});
  // Only a current roster can establish that omission from an inactive list means available.
  if(roster&&current(roster.captured_at,now,48)&&current(official.observed_at,now,2)&&kickoff-now<=2*3600000&&kickoff>now&&/^(active|act)$/i.test(roster.roster_status||''))return result('AVAILABLE','Available · game-day list checked','On the roster and not listed on the official inactive report; starting role is not guaranteed.',{confirmed_for_game:true,source_url:official.source_url,observed_at:official.observed_at});
 }
 if(absent.test(status)||context?.expected_active===false&&!report)return result('UNAVAILABLE','Reported '+(status||'unavailable'),'The latest report rules this player out; no current projection.',{designation:status,source_updated_at:report?.source_updated_at});
 if(concern.test(status)||/limited|did not|dnp/i.test(report?.practice_status||''))return result('INJURY_CONCERN','Assumes player starts · '+(status||'practice concern'),'Conditional projection. Injury or practice concerns remain until a newer clearance or official game-day report.',{designation:status,source_updated_at:report?.source_updated_at});
 const rank=Number(role?.evidence?.depth_rank??Math.min(...(roster?.depth_roles||[]).map(x=>x.rank)));
 const roleCurrent=current(role?.captured_at||roster?.captured_at,now,7*24);
 if(!roleCurrent)return result('REVIEW','Role update needed','The expected role has not been verified in the last seven days.');
 if(Number.isFinite(rank)&&rank>=1)return result(rank===1?'ASSUMED_STARTER':'ASSUMED_ROLE',rank===1?'Assumes player starts':'Assumes player plays',rank===1?'Uses the expected starter; game-day availability is not yet confirmed.':'Uses the published player role if he plays; a starting role is not confirmed.',{depth_rank:rank});
 return result('REVIEW','Role update needed','No verified expected role is available.');
}
