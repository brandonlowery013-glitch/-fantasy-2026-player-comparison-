const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const time=s=>{const n=Date.parse(String(s||''));return Number.isFinite(n)?n:null;};
export function injuryFreshness(report,now=Date.now(),maxHours=12) {
  const updated=time(report?.source_updated_at),at=typeof now==='number'?now:time(now);
  const valid=updated!==null&&at!==null&&updated<=at;
  return {status:valid&&at-updated<=maxHours*3600000?'CURRENT':'REVIEW_REQUIRED',
    source_updated_at:report?.source_updated_at||null,age_hours:valid?(at-updated)/3600000:null};
}
function athleteId(a) {
  if(a?.id&&/^\d+$/.test(String(a.id)))return String(a.id);
  const ids=new Set();
  for(const link of a?.links||[]) {
    try {const u=new URL(link.href);if(!['www.espn.com','espn.com'].includes(u.hostname))continue;
      const m=u.pathname.match(/^\/nfl\/player\/(?:[^/]+\/)?_\/id\/(\d+)(?:\/|$)/);if(m)ids.add(m[1]);
    }catch{}
  }
  return ids.size===1?[...ids][0]:null;
}
export function parseInjuryReports(payload) {
  const rows=Array.isArray(payload)?payload:payload?.injuries||[];
  const by=new Map();
  for(const x of rows) {
    const a=x.athlete||x.player,name=a?.displayName||a?.fullName;
    // Only report records; do not interpret nested athlete/roster status objects.
    if(!name||typeof x.status!=='string')continue;
    const id=athleteId(a),date=time(x.date||x.updated||x.lastUpdated);
    const r={name,athlete_id:id,report_id:x.id?String(x.id):null,position:a.position?.abbreviation||null,
      status:x.status,body_part:x.details?.type||x.injury?.type||x.bodyPart||null,
      practice_status:x.practiceStatus||x.details?.practiceStatus||null,
      source_updated_at:date===null?null:new Date(date).toISOString(),identity_method:id?'ESPN_ATHLETE_ID':'NAME_ONLY'};
    const key=id||`${norm(name)}:${r.position||''}`,old=by.get(key);
    if(!old||(date!==null&&(time(old.source_updated_at)===null||date>time(old.source_updated_at))))by.set(key,r);
    else if(date===time(old.source_updated_at)&&(r.status!==old.status||r.practice_status!==old.practice_status)) {
      by.set(key,{...old,status:'UNKNOWN',conflicting_reports:true});
    }
  }
  return [...by.values()];
}
export function assessInjury(report,now=Date.now()) {
  const freshness=injuryFreshness(report,now);
  const result={expected_active:null,availability_status:'UNKNOWN',basis:'NO_CURRENT_EXPLICIT_AVAILABILITY',reported_designation:report?.status||null,designation_confirmed_for_game:false,...freshness};
  if(!report||freshness.age_hours===null||report.conflicting_reports)return result;
  const status=String(report.status||'').trim().toLowerCase();
  const practice=String(report.practice_status||'').trim().toLowerCase();
  if(['injured reserve','ir','physically unable to perform','pup','suspended'].includes(status))
    return {...result,expected_active:false,availability_status:'EXPECTED_INACTIVE',basis:'LAST_REPORTED_LONG_TERM_ABSENCE'};
  if(freshness.status!=='CURRENT')return {...result,basis:'LAST_REPORTED_DESIGNATION_NEEDS_GAME_CONFIRMATION'};
  if(['out','inactive'].includes(status))
    return {...result,expected_active:false,availability_status:'EXPECTED_INACTIVE',basis:'CURRENT_EXPLICIT_INJURY_STATUS'};
  if(['questionable','doubtful','unknown'].includes(status)||/limited|did not|dnp/.test(practice))return {...result,basis:'UNRESOLVED_INJURY_STATUS'};
  if(status==='active'||/^(full participant|full participation|full practice)$/.test(practice))
    return {...result,expected_active:true,availability_status:'EXPECTED_ACTIVE',basis:'CURRENT_EXPLICIT_POSITIVE_REPORT'};
  return result;
}
export function resolveAvailability(signals,now=Date.now()) {
  const injury=signals.injury;
  // An injury report, including stale or uncertain evidence, cannot be defeated
  // by an ordinary depth-chart active flag or an older boolean snapshot.
  if(injury) return assessInjury(injury.evidence||injury,now);
  const role=signals.role,at=time(role?.captured_at),n=typeof now==='number'?now:time(now);
  if(at!==null&&n!==null&&at<=n&&n-at<=48*3600000&&typeof role?.evidence?.espn_active_flag==='boolean') {
    return {expected_active:role.evidence.espn_active_flag,availability_status:role.evidence.espn_active_flag?'EXPECTED_ACTIVE':'EXPECTED_INACTIVE',basis:'CURRENT_EXPLICIT_DEPTH_FLAG'};
  }
  return {expected_active:null,availability_status:'UNKNOWN',basis:'NO_CURRENT_EXPLICIT_AVAILABILITY'};
}
