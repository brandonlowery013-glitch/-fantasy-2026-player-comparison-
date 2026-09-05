import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const file=path.join(root,'analysis/transition-intelligence-current.json');
const report=JSON.parse(fs.readFileSync(file,'utf8'));
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const clean=s=>norm(s).replace(/\btarget blank\b/g,' ').replace(/\bfont color\b/g,' ').replace(/\bnbsp\b/g,' ').replace(/\boc \d+\b/g,' ').replace(/\s+/g,' ').trim();
const boundary=/\b(signings?|injuries?|transactions?|roster moves?|roster updates?|waivers?|cuts?|releases?|activations?)\b/i;
const editorial=/\b(fantasy football|fantasy outlook|fantasy draft|fantasy relevant|fantasy impact|fantasy value|fantasy update|adp|rankings?|mock draft|sleepers?|busts?|fade\b|player comps?|trade grades?|bold prediction|contract restructure|restructured .* contract|contract extension|jersey number|landing no \d+)\b/i;
const physical=/\b(injur(?:y|ed)|soreness|sprain|strain|tear|fracture|surgery|rehab|recovery|recovering|swollen|acl|lcl|mcl|meniscus|achilles|hamstring|ankle|knee|shoulder|back|groin|quad|calf|foot|wrist|hand|concussion|illness|sick|pup|nfi|\bir\b|setback|recurrence)\b/i;
const practiceHealth=/\b(limited (?:in|at) practice|missed practice|did not practice|left practice|exits? practice|return(?:ed|ing)? to practice|full practice|full participant|cleared|activated|ramping up)\b/i;
const nonHealth=/\b(personal reasons?|personal matter|family matter|family reasons?|excused absence|veteran rest|rest day|maintenance day|load management|not injury related|non injury related)\b/i;
const role=/\b(first team|with the ones|bulk reps|expanded role|more work|more reps|named starter|starting job|lead back|featured|route share|target share|carry share|touch share|workload|depth chart|committee|timeshare|split carries|backfield rotation|third down|two minute|goal line|red zone|slot role|outside role|x receiver|z receiver|pass protection|blitz pickup|first read)\b/i;
const competition=/\b(battle for|competing for|competition for|losing snaps|losing targets|role security|crowded|unsettled|no clear|committee|timeshare|rotation)\b/i;
const scheme=/\b(new offense|new system|new coordinator|offensive coordinator|scheme|install|playbook|progressions|protections|adjusting|learning)\b/i;
const chemistry=/\b(chemistry|rapport|timing|connection with|trust with)\b/i;
const development=/\b(rookie|first year|first-year|improv(?:e|ed|ing)|develop(?:ed|ing|ment)|route running|release package|separation|vision|patience|reads|blocking)\b/i;
const transaction=/\b(traded to|acquired by|signed with|joined the|new team|first season with)\b/i;

function bound(e,player){
  const p=norm(player);if(!p)return'';
  const preferred=[e.matched_context,e.description,e.body_text,e.headline].filter(Boolean);
  for(const raw of preferred){
    if(!norm(raw).includes(p))continue;
    const pieces=String(raw).split(boundary).map(clean).filter(x=>x.includes(p));
    if(pieces.length){const windows=[];for(const t of pieces){let from=0;while(windows.length<8){const i=t.indexOf(p,from);if(i<0)break;windows.push(t.slice(Math.max(0,i-110),Math.min(t.length,i+p.length+110)));from=i+p.length;}}return clean(windows.join(' '));}
  }
  return'';
}
function cats(local,player){
  const out=[];if(!local||editorial.test(local))return out;
  const p=norm(player);
  let healthBasis=local.replace(/\b(?:not|non)\s+injury\s+related\b/g,' ');
  const backupAfter=new RegExp(`\\bback up ${p.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')} after\\b.{0,45}\\binjur(?:y|ed)\\b`,'i');
  const explicitPhysical=physical.test(healthBasis)&&!backupAfter.test(healthBasis);
  const healthQualified=explicitPhysical||(!nonHealth.test(local)&&practiceHealth.test(local)&&physical.test(healthBasis));
  if(healthQualified)out.push('readiness');
  if(healthQualified&&/\b(rehab|recovery|recovering|returning from|coming back from|acl|lcl|mcl|meniscus|achilles|surgery)\b/i.test(healthBasis))out.push('prior_season_injury_recovery');
  if(role.test(local))out.push('role_usage');
  if(competition.test(local))out.push('competition');
  if(scheme.test(local)){if(/\b(new offense|new system|new coordinator|offensive coordinator|scheme|install)\b/i.test(local))out.push('scheme_install');if(/\b(learning|adjusting|playbook|progressions|protections)\b/i.test(local))out.push('adaptation');}
  if(chemistry.test(local))out.push('chemistry');
  if(development.test(local))out.push('development');
  if(transaction.test(local))out.push('teammate_environment');
  return [...new Set(out)];
}

// Whole-pipeline locality regressions.
const tests=[
  {player:'Baker Mayfield',event:{headline:'NFL roundup: unrelated injury',matched_context:'backup qb jalon daniels will be the backup qb to baker mayfield injuries wr david sills placed on ir'},mustDrop:true},
  {player:'C.J. Stroud',event:{headline:'Texans land emergency QB to back up C.J. Stroud after season-ending injury',matched_context:'texans land emergency qb to back up c j stroud after season ending injury'},mustDrop:true},
  {player:'Tank Dell',event:{headline:'Why did Texans restructure Tank Dell contract?',matched_context:'why did texans restructure tank dell contract ahead of the season target blank font color'},mustDrop:true},
  {player:'Bijan Robinson',event:{headline:'Bijan Robinson lands No. 7 from Drake London',matched_context:'bijan robinson landing no 7 from drake london target blank'},mustDrop:true},
  {player:'Kenneth Walker III',event:{matched_context:'kenneth walker is dealing with a swollen ankle and missed practice'},must:['readiness']},
  {player:'Patrick Mahomes II',event:{matched_context:'patrick mahomes returned to full practice after acl lcl rehab and is on track for week one'},must:['readiness','prior_season_injury_recovery']},
  {player:'Brian Thomas Jr.',event:{matched_context:'brian thomas jr was limited in practice by a shoulder injury'},must:['readiness']}
];
for(const t of tests){const local=bound(t.event,t.player),c=cats(local,t.player);if(t.mustDrop&&c.length)throw new Error(`Regression: ${t.player} non-material/cross-player evidence survived: ${c}`);for(const m of t.must||[])if(!c.includes(m))throw new Error(`Regression: ${t.player} lost ${m}`);}

let before=0,after=0,dropped=0,rewritten=0;
for(const row of report.rows||[]){
  const next=[];
  for(const e of row.development_evidence||[]){before++;const local=bound(e,row.player),categories=cats(local,row.player);if(!categories.length){dropped++;continue;}const sourceHeadline=e.source_headline||e.headline||'';next.push({...e,source_headline:sourceHeadline,headline:local,description:'',body_text:'',matched_context:local,categories,locality_gate:'ALL_TRANSITION_EVIDENCE_PLAYER_BOUND_V2'});after++;rewritten++;}
  row.development_evidence=next;
}
report.transition_evidence_locality={result:'PASS',before,after,dropped,rewritten,policy:'ALL chronology input is recategorized from sanitized player-bound text after hard roundup-section boundaries. HTML boilerplate and editorial/administrative pseudo-signals are removed before football classification.'};
fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.transition_evidence_locality,null,2));
