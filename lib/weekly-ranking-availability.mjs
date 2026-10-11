// Fantasy rankings carry the latest reported designation separately from rank.
// No report is not a game-day active confirmation and is not a ranking penalty.
const labels={O:['OUT','Out'],Q:['QUESTIONABLE','Questionable'],D:['DOUBTFUL','Doubtful'],IR:['INJURED_RESERVE','Injured reserve'],PUP:['PUP','Physically unable to perform'],NFI:['NFI','Non-football injury'],S:['SUSPENDED','Suspended'],INACTIVE:['INACTIVE','Inactive']};
const aliases={out:'O',o:'O',questionable:'Q',q:'Q',doubtful:'D',d:'D','injured reserve':'IR',ir:'IR','physically unable to perform':'PUP',pup:'PUP',nfi:'NFI','nfi-r':'NFI','nfi-a':'NFI','non-football injury':'NFI',suspended:'S',suspension:'S',s:'S',inactive:'INACTIVE'};
const absent=new Set(['O','IR','PUP','NFI','S','INACTIVE']);
export function fantasyInjuryStatus(context,now=Date.now()){
  const report=context?.signals?.injury?.evidence;
  if(!report)return {designation:null,tag:null,label:null,expected_absence:false,source_updated_at:null,needs_source_review:false};
  const date=Date.parse(report.source_updated_at),future=Number.isFinite(date)&&date>now;
  if(report.conflicting_reports||future)return {designation:'REVIEW_REQUIRED',tag:null,label:'Status update pending',expected_absence:false,source_updated_at:report.source_updated_at||null,needs_source_review:true};
  const reported=String(report.status||'').trim().toLowerCase(),reference=String(report.display_status||'').trim().toLowerCase();
  const status=absent.has(aliases[reported])?reported:(reference||reported),tag=aliases[status]||null;
  return {designation:tag?labels[tag][0]:null,tag,label:tag?labels[tag][1]:null,expected_absence:absent.has(tag),source_updated_at:reference&&status===reference?null:report.source_updated_at||null,display_source:reference&&status===reference?report.display_source||null:null,display_observed_at:report.display_observed_at||null,provider_designation:report.status||null,provider_reported_at:report.source_updated_at||null,needs_source_review:!tag&&!['active','healthy','available',''].includes(status)};
}
export function weeklyRankStatus(context,game,now=Date.now()){
  if(!game)return 'NO_CURRENT_WEEK_GAME';
  const injury=fantasyInjuryStatus(context,now);
  if(injury.expected_absence||(!context?.signals?.injury&&context?.expected_active===false))return 'NOT_EXPECTED_TO_PLAY';
  if(Date.parse(game.event_start)<=now)return 'GAME_STARTED_NO_ORIGINAL_WEEKLY_RANK';
  if(!context||injury.needs_source_review||['TEAM_MISMATCH','NOT_FOUND','AMBIGUOUS'].includes(context.ranking_identity_status))return 'PROVISIONAL_AVAILABILITY_REVIEW';
  // Q/D is a warning alongside the model rank, not automatic exclusion.
  // A current role source also supports ranking a player with no adverse report.
  if(injury.tag==='Q'||injury.tag==='D'||context.expected_active===true||context.ranking_roster_observed===true||context.signals?.role?.status==='CURRENT')return 'MODEL_RANK';
  return 'PROVISIONAL_AVAILABILITY_REVIEW';
}
