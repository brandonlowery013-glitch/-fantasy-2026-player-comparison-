import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const file=path.join(root,'analysis/transition-intelligence-current.json');
const report=JSON.parse(fs.readFileSync(file,'utf8'));
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const health=/\b(injur(?:y|ed)|soreness|sprain|strain|tear|torn|fracture|surgery|rehab|recovery|recovering|swollen|acl|lcl|mcl|meniscus|achilles|hamstring|ankle|knee|shoulder|back|groin|quad|calf|foot|wrist|hand|concussion|illness|sick|pup|nfi|\bir\b|setback|recurrence|limited|missed practice|did not practice)\b/i;
const recovery=/\b(full practice|full participant|cleared|activated|healthy|ready|returned to practice|returns to practice|back in action|back at practice|off (?:the )?injury report|totally fine|no limitations?|on track|expected to be ready|good to go|progressing|rehab|recovery|recovering|checkpoints?)\b/i;
const adverse=/\b(dealing with|new injury|injured|swollen|soreness|sprain|strain|tear|torn|fracture|surgery|out\b|ruled out|will miss|expected to miss|missed practice|did not practice|limited (?:in|at) practice|left practice|placed on (?:ir|pup|nfi)|setback|recurrence|not ready|week[- ]to[- ]week|day[- ]to[- ]day)\b/i;
const unavailable=/\b(commissioner(?:'s)? exempt|commissioner exempt|suspended|suspension|inactive|unavailable|will not play|won't play|not expected to play)\b/i;
const role=/\b(first[ -]team|with the ones|reps|routes?|targets?|target share|carries|touches|workload|depth chart|starter|committee|rotation|lead back|featured|goal line|red zone|third down|two minute|losing targets|losing snaps|expanded role|more work)\b/i;
const scheme=/\b(playbook|new offense|new system|new coordinator|scheme|install|learning|adjusting|chemistry|rapport|timing|progressions|protections)\b/i;
const boundaries=/[;|•\n]+|\b(?:signings?|injuries?|transactions?|roster moves?|roster updates?|waivers?|cuts?|releases?|activations?|preseason news)\b/gi;
const healthCats=new Set(['readiness','prior_season_injury_recovery']);
const meaningfulCats=new Set(['role_usage','competition','readiness','prior_season_injury_recovery','development','scheme_install','adaptation','chemistry','teammate_environment']);

function playerClauses(raw,player){const p=norm(player),out=[];if(!raw||!p)return out;for(const piece of String(raw).split(boundaries)){const n=norm(piece);if(n&&n.includes(p))out.push(n);}return out;}
function clauses(e,player){
  // Prefer the raw source headline when it cleanly identifies the tracked player's clause.
  // This prevents a normalized matched_context from rejoining neighboring semicolon-separated subjects.
  const headlineOwned=playerClauses(e.source_headline,player);
  if(headlineOwned.length)return [...new Set(headlineOwned)];
  const directHeadline=playerClauses(e.headline,player);
  if(directHeadline.length&&/[;|•\n]/.test(String(e.headline||'')))return [...new Set(directHeadline)];
  const out=[];
  for(const raw of [e.headline,e.description,e.matched_context,e.body_text,e.chronology_context_text].filter(Boolean))out.push(...playerClauses(raw,player));
  return [...new Set(out)];
}
function ownedText(e,player){return norm(clauses(e,player).join(' '));}
function refineEvent(e,player){
  const own=ownedText(e,player);if(!own)return e;
  const before=[...(e.categories||[])],cats=new Set(before),hasHealth=health.test(own),hasRecovery=recovery.test(own),hasAdverse=adverse.test(own),hasUnavailable=unavailable.test(own),hasRole=role.test(own),hasScheme=scheme.test(own);
  if(!hasHealth&&!hasUnavailable){cats.delete('readiness');cats.delete('prior_season_injury_recovery');}
  if(!hasHealth)cats.delete('prior_season_injury_recovery');
  let direction=e.direction;
  if(hasUnavailable){cats.add('readiness');direction='NEGATIVE';}
  else if(hasRecovery&&!hasAdverse)direction='POSITIVE';
  else if(hasAdverse)direction='NEGATIVE';
  else if((before.some(c=>healthCats.has(c)))&&!hasHealth)direction=(hasRole||hasScheme)?(e.direction==='POSITIVE'?'POSITIVE':'CONTEXT'):'CONTEXT';
  const filtered=[...cats].filter(c=>meaningfulCats.has(c));
  return {...e,categories:filtered,direction,subject_binding_text:own,subject_binding:'PLAYER_OWNED_CLAUSE'};
}
function significance(e){return Number(e.significance||0);}
function latestBasis(events,filter){const xs=events.filter(filter);if(!xs.length)return null;const chosen=[...xs].sort((a,b)=>(b.timestamp||0)-(a.timestamp||0)||significance(b)-significance(a))[0];return {published:chosen.published,phase:chosen.phase,direction:chosen.direction,headline:chosen.headline,dimensions:chosen.dimensions||[],categories:chosen.categories||[]};}
function trajectory(events){const xs=events.filter(e=>e.timestamp!==null&&e.timestamp!==undefined);if(!xs.length)return'UNKNOWN';const meaningful=xs.filter(e=>significance(e)>=3),seq=meaningful.length?meaningful:xs,first=seq[0],last=seq.at(-1);if(first.direction!==last.direction){if(last.direction==='POSITIVE')return'IMPROVING_OR_ROLE_GAIN';if(last.direction==='NEGATIVE')return'DECLINING_OR_ROLE_LOSS';return'EVOLVING_MIXED';}if(last.direction==='POSITIVE')return'POSITIVE_CONFIRMED';if(last.direction==='NEGATIVE')return'NEGATIVE_CONFIRMED';return'STABLE_OR_CONTEXT_ONLY';}

let eventsRefined=0,categoriesRemoved=0,directionOverrides=0;
for(const row of report.rows||[]){
  const chrono=row.chronological_development;if(!chrono)continue;
  chrono.events=(chrono.events||[]).map(e=>{const beforeCats=(e.categories||[]).length,beforeDir=e.direction,next=refineEvent(e,row.player);categoriesRemoved+=Math.max(0,beforeCats-(next.categories||[]).length);if(next.direction!==beforeDir)directionOverrides++;if(next.subject_binding)eventsRefined++;return next;});
  const currentStart=Date.parse(chrono.current_season_state?.window?.start||'2026-09-05T00:00:00Z');
  const campStart=Date.parse(chrono.camp_retroactive_audit?.window?.start||'2026-04-01T00:00:00Z'),campEnd=Date.parse(chrono.camp_retroactive_audit?.window?.end||'2026-09-04T23:59:59Z');
  chrono.camp_retroactive_audit.latest_camp_basis=latestBasis(chrono.events,e=>Number(e.timestamp)>=campStart&&Number(e.timestamp)<=campEnd);
  chrono.camp_retroactive_audit.trajectory=trajectory(chrono.events.filter(e=>Number(e.timestamp)>=campStart&&Number(e.timestamp)<=campEnd));
  chrono.current_season_state.current_state_basis=latestBasis(chrono.events,e=>Number(e.timestamp)>=currentStart);
  chrono.overall_trajectory=trajectory(chrono.events);
  chrono.subject_binding='PLAYER_OWNED_CLAUSE_FINAL_PASS';
}

function regression(player,event,expected){const x=refineEvent(event,player);if(expected.direction&&x.direction!==expected.direction)throw new Error(`Regression ${player}: ${x.direction} != ${expected.direction}`);for(const c of expected.absent||[])if((x.categories||[]).includes(c))throw new Error(`Regression ${player}: retained ${c}`);for(const c of expected.present||[])if(!(x.categories||[]).includes(c))throw new Error(`Regression ${player}: lost ${c}`);}
regression('Hunter Henry',{source_headline:'Commanders LT Laremy Tunsil to undergo surgery on torn triceps; Patriots extend Hunter Henry',headline:'NFL roundup',matched_context:'laremy tunsil surgery torn triceps patriots extend hunter henry',categories:['readiness','prior_season_injury_recovery'],direction:'NEGATIVE'}, {direction:'CONTEXT',absent:['readiness','prior_season_injury_recovery']});
regression('Kenneth Walker III',{headline:'Kenneth Walker III dealing with swollen ankle and missed practice',categories:['readiness'],direction:'CONTEXT'}, {direction:'NEGATIVE',present:['readiness']});
regression('Patrick Mahomes II',{headline:'Patrick Mahomes II returns to full practice after ACL and LCL rehab and is on track for Week 1',categories:['readiness','prior_season_injury_recovery'],direction:'CONTEXT'}, {direction:'POSITIVE',present:['readiness','prior_season_injury_recovery']});
regression('Rome Odunze',{headline:'Rome Odunze injured at practice',categories:['readiness'],direction:'CONTEXT'}, {direction:'NEGATIVE',present:['readiness']});
regression('Josh Jacobs',{headline:'Josh Jacobs placed on commissioner exempt list',categories:['role_usage'],direction:'POSITIVE'}, {direction:'NEGATIVE',present:['readiness']});

report.subject_binding_refinement={generated_at:new Date().toISOString(),events_refined:eventsRefined,categories_removed:categoriesRemoved,direction_overrides:directionOverrides,policy:'FINAL PLAYER-OWNED CLAUSE ATTRIBUTION; RAW SOURCE HEADLINE PLAYER CLAUSE HAS PRECEDENCE; SEMICOLON/PIPE/BULLET/NEWLINE/ROUNDUP HEADERS ARE HARD SUBJECT BOUNDARIES'};
fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({result:'PASS',events_refined:eventsRefined,categories_removed:categoriesRemoved,direction_overrides:directionOverrides},null,2));
