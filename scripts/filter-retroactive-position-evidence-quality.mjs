import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(x,null,2)+'\n');};

const report=read('guardrails/retroactive-camp-backfill-report.json');
const transition=read('analysis/transition-intelligence-current.json');

const editorial=/\b(fantasy football|fantasy outlook|fantasy draft|draft stock|draft target|must target|must-target|adp|rankings?|top 100|top \d+|mock draft|rookie of the year|oroy|droy|player comps?|trade grades?|prediction|bold prediction|should you draft|start him|start sit|start\/sit|sleepers?|busts?|fade\b|round 1|contract extension|\$\d+\s*million contract)\b/i;
const health=/\b(injur(?:y|ed)|soreness|sprain|strain|tear|fracture|surgery|rehab|recovery|recovering|return(?:ed|ing)? to practice|cleared|limited (?:in|at) practice|missed practice|did not practice|left practice|exits? practice|pup|nfi|\bir\b|activated|ramping up|setback|recurrence)\b/i;
const operational=/\b(practice|first[ -]team|with the ones|reps|routes?|route share|targets?|target share|target distribution|carries|carry share|touches|touch share|workload|depth chart|starter|starting job|named starter|committee|timeshare|split carries|backfield rotation|pass protection|blitz pickup|playbook|progressions|protections|chemistry|rapport|timing|favorite target|first read|personnel|12 personnel|13 personnel|slot role|outside role|x receiver|z receiver|red zone|goal line|third down|two minute|coach (?:said|says|expects|plans|wants|noted)|coordinator (?:said|says|expects|plans|wants|noted)|beat writer|practice report|camp report|observed in practice|new offense|new system|new coordinator|traded to|acquired by|signed with|joined the|pup|nfi|\bir\b|activated|returned to practice|cleared to play)\b/i;

const topicMap={
  RB:{committee:['competition','role_usage'],touch_volume:['role_usage'],backfield_injury_impact:['readiness','role_usage'],rookie_adjustment:['development','adaptation'],role_security:['competition','role_usage'],scheme_touch_impact:['scheme_install','role_usage']},
  QB:{playbook_adaptation:['adaptation'],receiver_chemistry:['chemistry'],practice_preference:['chemistry','role_usage'],new_team_qb:['adaptation','chemistry'],role_security:['competition']},
  WR:{rookie_adjustment:['development','adaptation'],target_hierarchy:['role_usage'],role_security:['competition','role_usage'],qb_chemistry:['chemistry'],unstable_room:['competition','role_usage']},
  TE:{rookie_adjustment:['development','adaptation'],target_hierarchy:['role_usage'],role_security:['competition','role_usage'],qb_chemistry:['chemistry']}
};
const canonical=new Set(['scheme_install','adaptation','role_usage','chemistry','competition','readiness','prior_season_injury_recovery','development','teammate_environment']);
const eventKey=e=>e.url||`${e.source}|${e.published}|${e.headline}`;

function qualify(e,pos){
  const text=`${e.headline||''} ${e.description||''} ${e.matched_context||''}`;
  const topics=e.position_topics||[];
  const cats=e.categories||[];
  const hasHealth=health.test(text)&&(cats.includes('readiness')||cats.includes('prior_season_injury_recovery')||topics.includes('backfield_injury_impact'));
  const hasOperational=operational.test(text);
  const isEditorial=editorial.test(e.headline||'');
  if(isEditorial&&!hasHealth) return {keep:false,reason:'EDITORIAL_WITHOUT_CONCRETE_EVENT'};
  if(!hasHealth&&!hasOperational) return {keep:false,reason:'NO_OPERATIONAL_FOOTBALL_ANCHOR'};

  const outCats=new Set(cats.filter(c=>canonical.has(c)));
  for(const t of topics) for(const c of topicMap[pos]?.[t]||[]) outCats.add(c);
  if(isEditorial&&hasHealth){
    // Editorial/fantasy framing may be retained only as corroboration of a concrete health event.
    for(const c of ['role_usage','competition','development','adaptation','chemistry','scheme_install']) outCats.delete(c);
    if(cats.includes('prior_season_injury_recovery')) outCats.add('prior_season_injury_recovery');
    else outCats.add('readiness');
  }
  if(!outCats.size) return {keep:false,reason:'NO_CANONICAL_MATERIAL_CATEGORY'};
  return {keep:true,categories:[...outCats],editorial_health_only:isEditorial&&hasHealth};
}

// Regression controls from the audited artifact.
if(qualify({headline:'2026 Fantasy Football WR1 Battle: Picking Between A.J. Brown And Nico Collins',categories:['role_security'],position_topics:['role_security']},'WR').keep) throw new Error('Regression: fantasy WR1 ranking admitted as role evidence');
if(qualify({headline:'NFL Top 100 Players of 2026',matched_context:'Bucky Irving ranks ahead of other backs',categories:['touch_volume'],position_topics:['touch_volume']},'RB').keep) throw new Error('Regression: Top 100 editorial admitted as touch evidence');
const factual=qualify({headline:'Jayden Reed takes first-team reps in 12 personnel',categories:['target_hierarchy'],position_topics:['target_hierarchy']},'WR');
if(!factual.keep||!factual.categories.includes('role_usage')) throw new Error('Regression: factual WR first-team usage not mapped to role_usage');
const committee=qualify({headline:'Coach says rookie back is splitting carries in committee and improving pass protection',categories:['committee','rookie_adjustment','coach_signal'],position_topics:['committee','rookie_adjustment']},'RB');
if(!committee.keep||!committee.categories.includes('competition')||!committee.categories.includes('role_usage')||!committee.categories.includes('development')) throw new Error('Regression: RB committee/development mapping failed');
const healthEditorial=qualify({headline:'Tucker Kraft fantasy outlook after return from injury',categories:['readiness'],position_topics:[]},'TE');
if(!healthEditorial.keep||healthEditorial.categories.some(c=>c!=='readiness')) throw new Error('Regression: concrete health update in editorial framing handled incorrectly');

let kept=0,rejected=0,editorialRejected=0,noAnchorRejected=0,editorialHealthOnly=0;
const keepKeys=new Set();
for(const row of report.rows||[]){
  const next=[];
  for(const e of row.evidence||[]){
    const q=qualify(e,row.position);
    if(!q.keep){rejected++;if(q.reason==='EDITORIAL_WITHOUT_CONCRETE_EVENT')editorialRejected++;if(q.reason==='NO_OPERATIONAL_FOOTBALL_ANCHOR')noAnchorRejected++;continue;}
    e.categories=q.categories;
    e.quality_gate='POSITION_SPECIFIC_OPERATIONAL_EVENT';
    if(q.editorial_health_only){e.editorial_health_only=true;editorialHealthOnly++;}
    next.push(e);keepKeys.add(eventKey(e));kept++;
  }
  row.evidence=next;row.evidence_count=next.length;
  row.status=next.length?'EVIDENCE_FOUND':((row.player_rss==='CHECKED'||row.official_team_sitemap==='CHECKED')?'SOURCE_CHECKED_NO_MATERIAL_EVIDENCE':'SOURCE_COVERAGE_GAP');
}

let evidenceFound=0,checkedNo=0,gaps=0;
const positionCounts={RB:{players:0,evidence_found:0,evidence:0},QB:{players:0,evidence_found:0,evidence:0},WR:{players:0,evidence_found:0,evidence:0},TE:{players:0,evidence_found:0,evidence:0},OTHER:{players:0,evidence_found:0,evidence:0}};
for(const row of report.rows||[]){const b=positionCounts[row.position]||positionCounts.OTHER;b.players++;b.evidence+=row.evidence_count;if(row.evidence_count)b.evidence_found++;if(row.status==='EVIDENCE_FOUND')evidenceFound++;else if(row.status==='SOURCE_CHECKED_NO_MATERIAL_EVIDENCE')checkedNo++;else gaps++;}

for(const tr of transition.rows||[]){
  tr.development_evidence=(tr.development_evidence||[]).filter(e=>e.retroactive_camp_evidence!==true||keepKeys.has(eventKey(e)));
  const rr=(report.rows||[]).find(x=>x.player===tr.player);
  if(rr) tr.retroactive_camp_audit={...(tr.retroactive_camp_audit||{}),status:rr.status,evidence_count:rr.evidence_count,quality_gate:'POSITION_SPECIFIC_OPERATIONAL_EVENT'};
}

report.counts={...(report.counts||{}),evidence_found:evidenceFound,source_checked_no_material_evidence:checkedNo,source_coverage_gap:gaps,evidence_added:kept,quality_rejected:rejected,editorial_without_event_rejected:editorialRejected,no_operational_anchor_rejected:noAnchorRejected,editorial_health_only_retained:editorialHealthOnly};
report.position_counts=positionCounts;
report.quality_policy='ROLE/TOUCH/TARGET/CHEMISTRY EVIDENCE REQUIRES AN OPERATIONAL FOOTBALL ANCHOR; FANTASY/DRAFT/RANKING/CONTRACT EDITORIALS CANNOT CREATE ROLE EVIDENCE; CONCRETE HEALTH FACTS MAY BE RETAINED AS HEALTH-ONLY CORROBORATION';
transition.retroactive_camp_backfill={...(transition.retroactive_camp_backfill||{}),counts:report.counts,position_counts:positionCounts,quality_policy:report.quality_policy};
write('guardrails/retroactive-camp-backfill-report.json',report);
write('analysis/transition-intelligence-current.json',transition);
console.log(JSON.stringify({result:gaps?'PARTIAL_SOURCE_GAPS':'PASS',kept,rejected,editorialRejected,noAnchorRejected,editorialHealthOnly,evidenceFound,checkedNo,gaps,positionCounts},null,2));
