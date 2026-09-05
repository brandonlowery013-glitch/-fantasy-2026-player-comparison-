import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(x,null,2)+'\n');};
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();

const report=read('guardrails/retroactive-camp-backfill-report.json');
const transition=read('analysis/transition-intelligence-current.json');
const editorial=/\b(fantasy football|fantasy outlook|fantasy draft|fantasy relevant|fantasy impact|fantasy bounce|fantasy stock|draft stock|draft target|must target|must-target|adp|rankings?|top 100|top \d+|mock draft|rookie of the year|oroy|droy|player comps?|trade grades?|prediction|bold prediction|should you draft|start him|start sit|start\/sit|sleepers?|busts?|fade\b|round 1|contract extension|\$\d+\s*million contract)\b/i;
const health=/\b(injur(?:y|ed)|soreness|sprain|strain|tear|fracture|surgery|rehab|recovery|recovering|swollen|return(?:ed|ing)? to practice|cleared|limited (?:in|at) practice|missed practice|did not practice|left practice|exits? practice|pup|nfi|\bir\b|activated|ramping up|setback|recurrence)\b/i;
const strongPhysicalHealth=/\b(injur(?:y|ed)|soreness|sprain|strain|tear|fracture|surgery|rehab|recovery|recovering|swollen|acl|lcl|mcl|meniscus|achilles|hamstring|ankle|knee|shoulder|back|groin|quad|calf|foot|wrist|hand|concussion|illness|sick|pup|nfi|\bir\b|ramping up|setback|recurrence)\b/i;
const nonHealthAbsence=/\b(personal reasons?|personal matter|family matter|family reasons?|excused absence|veteran rest|rest day|maintenance day|load management|not injury related|not injury-related|non injury related|non-injury-related)\b/i;
const role=/\b(first[ -]team|with the ones|reps|routes?|route share|targets?|target share|target distribution|carries|carry share|touches|touch share|workload|depth chart|starter|starting job|named starter|committee|timeshare|split carries|backfield rotation|pass protection|blitz pickup|favorite target|first read|slot role|outside role|x receiver|z receiver|red zone|goal line|third down|two minute|bulk reps|lead back|featured|expanded role|more work)\b/i;
const scheme=/\b(playbook|progressions|protections|chemistry|rapport|timing|personnel|12 personnel|13 personnel|new offense|new system|new coordinator|offensive coordinator|scheme|install|adjusting|learning)\b/i;
const transaction=/\b(traded to|acquired by|signed with|joined the|new team|first camp with|first season with)\b/i;
const coach=/\b(coach|coordinator|play caller|playcaller)\b.{0,60}\b(said|says|expects|plans|wants|noted|praised|believes)\b|\b(said|says|expects|plans|wants|noted|praised|believes)\b.{0,60}\b(coach|coordinator)\b/i;
const media=/\b(beat writer|practice report|camp report|observed in practice|reporter|according to)\b/i;
const development=/\b(rookie|first year|first-year|improv(?:e|ed|ing)|develop(?:ed|ing|ment)|route running|release|separation|vision|patience|reads|blocking)\b/i;
const competition=/\b(ahead of|behind|battle for|competing for|competition for|losing snaps|losing targets|rotation|crowded|unsettled|no clear|role security)\b/i;
const operational=new RegExp([health.source,role.source,scheme.source,transaction.source,coach.source,media.source,development.source,competition.source].join('|'),'i');
const roundupBoundary=/\b(signings?|injuries?|transactions?|roster moves?|roster updates?|waivers?|cuts?|releases?|activations?)\b/i;

const canonical=new Set(['scheme_install','adaptation','role_usage','chemistry','competition','readiness','prior_season_injury_recovery','development','teammate_environment']);
const eventKey=e=>e.url||`${e.source}|${e.published}|${e.headline}`;
function playerSections(e,player){
  const p=norm(player);if(!p)return[];
  const fields=[e.headline,e.description,e.matched_context,e.body_text].filter(Boolean);
  const out=[];
  for(const raw of fields){
    const normalized=norm(raw);
    if(!normalized.includes(p))continue;
    const pieces=String(raw).split(roundupBoundary);
    for(const piece of pieces){const n=norm(piece);if(n.includes(p))out.push(n);}
    if(!pieces.some(piece=>norm(piece).includes(p)))out.push(normalized);
  }
  return [...new Set(out)];
}
function playerWindows(e,player,radius=96){
  const p=norm(player);if(!p)return'';
  const windows=[];
  for(const t of playerSections(e,player)){let from=0;while(windows.length<16){const i=t.indexOf(p,from);if(i<0)break;windows.push(t.slice(Math.max(0,i-radius),Math.min(t.length,i+p.length+radius)));from=i+p.length;}}
  return norm(windows.join(' '));
}
function nearPlayer(e,player,re,radius=64){return re.test(playerWindows(e,player,radius));}
function canonicalCategories(e,pos,player){
  const local=playerWindows(e,player,96);
  const out=new Set();
  if(!local)return out;
  const ownHealth=nearPlayer(e,player,health,64);
  const explicitNonHealth=nonHealthAbsence.test(local);
  const physicalHealth=strongPhysicalHealth.test(local);
  const healthQualified=ownHealth&&(!explicitNonHealth||physicalHealth);
  const hasRole=role.test(local),hasScheme=scheme.test(local),hasTransaction=transaction.test(local),hasCoach=coach.test(local),hasMedia=media.test(local),hasDevelopment=development.test(local),hasCompetition=competition.test(local);
  if(healthQualified){out.add('readiness');if(/\b(rehab|recovery|recovering|returning from|coming back from|months removed|year removed|surgery last|acl|achilles|meniscus|lcl|mcl)\b/i.test(local))out.add('prior_season_injury_recovery');}
  if(hasRole)out.add('role_usage');
  if(hasCompetition)out.add('competition');
  if(hasScheme){if(/\b(new offense|new system|new coordinator|offensive coordinator|scheme|install)\b/i.test(local))out.add('scheme_install');if(/\b(learning|adjusting|comfortable|command|grasp|playbook|progressions|protections)\b/i.test(local))out.add('adaptation');if(/\b(chemistry|rapport|timing)\b/i.test(local))out.add('chemistry');}
  if(hasTransaction&&/(QB|WR|TE|RB)/.test(pos))out.add('teammate_environment');
  if(hasDevelopment)out.add('development');
  if(hasCoach&&hasRole)out.add('role_usage');
  if(hasMedia&&hasRole)out.add('role_usage');
  return out;
}
function qualify(e,pos,player){
  if(editorial.test(e.headline||''))return{keep:false,reason:'EDITORIAL_OR_FANTASY_HEADLINE'};
  const local=playerWindows(e,player,96);
  if(!local||!operational.test(local))return{keep:false,reason:'NO_PLAYER_PROXIMATE_OPERATIONAL_ANCHOR'};
  const out=canonicalCategories(e,pos,player);
  for(const c of [...out])if(!canonical.has(c))out.delete(c);
  if(!out.size)return{keep:false,reason:'NO_CANONICAL_MATERIAL_CATEGORY'};
  return{keep:true,categories:[...out],local};
}

// Cross-player roundup contamination and non-health absence regressions.
if(qualify({headline:'NFL roundup',matched_context:'wr michael wilson agreed to a three year contract extension team later announced injuries wr zay flowers left practice with an injury',categories:['readiness']},'WR','Michael Wilson').keep)throw new Error('Regression: Zay Flowers injury contaminated Michael Wilson');
if(qualify({headline:'NFL roundup',matched_context:'rb d andre swift missed practice with injury signings te jake ferguson restructured his contract',categories:['readiness']},'TE','Jake Ferguson').keep)throw new Error('Regression: nearby injury contaminated Jake Ferguson restructure');
if(qualify({headline:'NFL roundup',matched_context:'backup qb to baker mayfield will play injuries wr david sills placed on ir',categories:['readiness']},'QB','Baker Mayfield').keep)throw new Error('Regression: nearby roster injury contaminated Baker Mayfield');
if(qualify({headline:'NFL roundup',matched_context:'te brock bowers missed practice for personal reasons signings p jack bouwmeester signed with the rams',categories:['new_team','coach_signal']},'TE','Brock Bowers').keep)throw new Error('Regression: non-health Brock Bowers absence or unrelated signing survived');
if(qualify({headline:'Practice report',matched_context:'te brock bowers did not practice due to veteran rest and was not injury related',categories:['readiness']},'TE','Brock Bowers').keep)throw new Error('Regression: veteran-rest absence classified as readiness');
const walker=qualify({headline:'NFL roundup',matched_context:'rb kenneth walker is dealing with a swollen ankle and missed practice',categories:['readiness']},'RB','Kenneth Walker III');if(!walker.keep||!walker.categories.includes('readiness'))throw new Error('Regression: Kenneth Walker direct ankle evidence lost');
const mahomes=qualify({headline:'Patrick Mahomes returns to full practice after ACL and LCL rehab',matched_context:'patrick mahomes returns to full practice after acl and lcl rehab and is cleared for week one',categories:['readiness','prior_season_injury_recovery']},'QB','Patrick Mahomes II');if(!mahomes.keep||!mahomes.categories.includes('readiness')||!mahomes.categories.includes('prior_season_injury_recovery'))throw new Error('Regression: Mahomes direct recovery evidence lost');
const btj=qualify({headline:'Brian Thomas Jr. limited by shoulder injury',matched_context:'brian thomas jr was limited in practice by a shoulder injury',categories:['readiness']},'WR','Brian Thomas Jr.');if(!btj.keep||!btj.categories.includes('readiness'))throw new Error('Regression: BTJ direct injury evidence lost');

let kept=0,rejected=0,editorialRejected=0,noProximityRejected=0,noCanonicalRejected=0;const keepKeys=new Set();
for(const row of report.rows||[]){
  const next=[];
  for(const e of row.evidence||[]){const q=qualify(e,row.position,row.player);if(!q.keep){rejected++;if(q.reason==='EDITORIAL_OR_FANTASY_HEADLINE')editorialRejected++;if(q.reason==='NO_PLAYER_PROXIMATE_OPERATIONAL_ANCHOR')noProximityRejected++;if(q.reason==='NO_CANONICAL_MATERIAL_CATEGORY')noCanonicalRejected++;continue;}e.categories=q.categories;e.matched_context=q.local;e.quality_gate='PLAYER_SECTION_LOCAL_CATEGORY_BINDING';next.push(e);keepKeys.add(eventKey(e));kept++;}
  row.evidence=next;row.evidence_count=next.length;row.status=next.length?'EVIDENCE_FOUND':((row.player_rss==='CHECKED'||row.official_team_sitemap==='CHECKED')?'SOURCE_CHECKED_NO_MATERIAL_EVIDENCE':'SOURCE_COVERAGE_GAP');
}
let evidenceFound=0,checkedNo=0,gaps=0;const positionCounts={RB:{players:0,evidence_found:0,evidence:0},QB:{players:0,evidence_found:0,evidence:0},WR:{players:0,evidence_found:0,evidence:0},TE:{players:0,evidence_found:0,evidence:0},OTHER:{players:0,evidence_found:0,evidence:0}};
for(const row of report.rows||[]){const b=positionCounts[row.position]||positionCounts.OTHER;b.players++;b.evidence+=row.evidence_count;if(row.evidence_count)b.evidence_found++;if(row.status==='EVIDENCE_FOUND')evidenceFound++;else if(row.status==='SOURCE_CHECKED_NO_MATERIAL_EVIDENCE')checkedNo++;else gaps++;}
for(const tr of transition.rows||[]){tr.development_evidence=(tr.development_evidence||[]).filter(e=>e.retroactive_camp_evidence!==true||keepKeys.has(eventKey(e))).map(e=>{if(e.retroactive_camp_evidence===true){const rr=(report.rows||[]).find(x=>x.player===tr.player);const keptEvent=rr?.evidence?.find(x=>eventKey(x)===eventKey(e));if(keptEvent)return{...e,categories:keptEvent.categories,matched_context:keptEvent.matched_context,quality_gate:keptEvent.quality_gate};}return e;});const rr=(report.rows||[]).find(x=>x.player===tr.player);if(rr)tr.retroactive_camp_audit={...(tr.retroactive_camp_audit||{}),status:rr.status,evidence_count:rr.evidence_count,quality_gate:'PLAYER_SECTION_LOCAL_CATEGORY_BINDING'};}
report.counts={...(report.counts||{}),evidence_found:evidenceFound,source_checked_no_material_evidence:checkedNo,source_coverage_gap:gaps,evidence_added:kept,quality_rejected:rejected,editorial_or_fantasy_rejected:editorialRejected,no_player_proximate_anchor_rejected:noProximityRejected,no_canonical_material_category_rejected:noCanonicalRejected};report.position_counts=positionCounts;report.quality_policy='PLAYER-SECTION LOCAL CATEGORY BINDING; ROUNDUP SECTION HEADERS ARE HARD BOUNDARIES; PRACTICE ABSENCES EXPLICITLY ATTRIBUTED TO PERSONAL/FAMILY/REST/MAINTENANCE/NON-INJURY REASONS DO NOT CREATE READINESS EVIDENCE WITHOUT AN INDEPENDENT PHYSICAL-HEALTH TRIGGER';transition.retroactive_camp_backfill={...(transition.retroactive_camp_backfill||{}),counts:report.counts,position_counts:positionCounts,quality_policy:report.quality_policy};
write('guardrails/retroactive-camp-backfill-report.json',report);write('analysis/transition-intelligence-current.json',transition);console.log(JSON.stringify({result:gaps?'PARTIAL_SOURCE_GAPS':'PASS',kept,rejected,editorialRejected,noProximityRejected,noCanonicalRejected,evidenceFound,checkedNo,gaps,positionCounts},null,2));
