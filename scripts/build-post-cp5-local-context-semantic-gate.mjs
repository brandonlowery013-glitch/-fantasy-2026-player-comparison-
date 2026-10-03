import fs from 'node:fs';

const R=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const W=(p,x)=>{fs.mkdirSync(p.split('/').slice(0,-1).join('/'),{recursive:true});fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n')};
const audit=R('analysis/full-universe-accumulated-context-audit-current.json');
const transition=R('analysis/transition-intelligence-current.json');
if((audit.candidates||[]).length!==38)throw new Error(`expected checkpoint-5 38 candidates, got ${(audit.candidates||[]).length}`);
if((transition.rows||[]).length!==166)throw new Error(`transition coverage ${(transition.rows||[]).length}/166`);
const byTransition=new Map(transition.rows.map(r=>[r.player,r]));
const norm=s=>String(s||'').replace(/\s+/g,' ').trim();
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const aliases=player=>[player,player.replace(/\s+(?:Jr\.|Sr\.|II|III|IV)$/i,'')].filter((x,i,a)=>x&&a.indexOf(x)===i);
const HARD_NOISE=/\b(personal reasons?|rest day|contract extension|restructured|jersey|number change|initial 53[- ]man roster)\b/i;
const POS_AVAIL=/(returned? to practice|returns? to (?:team )?drills|full[- ]go|no issues|cleared|off injury report|expected to play|will play|expected to practice|resume practicing|return to practice|good to go|progressing|healthy|activated|won['’]?t go on injured reserve|will not go on injured reserve|chance to play|feels best|feel really good|knee woes? (?:are|is) behind him|positive fantasy update)/i;
const NEG_AVAIL=/(did not practice|doesn['’]?t practice|miss(?:ed|ing) practice|will miss|expected to miss|placed on (?:the )?(?:pup|physically unable to perform|injured reserve|ir)|high ankle sprain|torn acl|week[- ]to[- ]week|questionable|doubtful|limited in practice|soreness|injured ankle|injured knee|injured hamstring|injured shoulder|hamstring injury|knee injury|ankle injury|shoulder injury)/i;
const POS_ROLE=/(connection|chemistry|heavy workload|bigger workload|more (?:work|touches|carries|targets|snaps|routes)|first[- ]team|named (?:the )?starter|starting role|lead back|featured|bulk|breakout|strong camp|expanded role|increased role|target share up|first[- ]read|primary target|favorite target)/i;
const NEG_ROLE=/(decrease [^.!]{0,50}workload|reduce [^.!]{0,50}workload|take [^.!]{0,50}workload off|less workload|lack of targets|still quiet|limited role|committee|split (?:work|carries|touches)|demoted|losing (?:work|role|snaps|targets)|fewer (?:touches|snaps|targets|routes)|target share down)/i;

function localEvent(player,beat){
  const row=byTransition.get(player);
  const events=row?.chronological_development?.events||row?.development_evidence||[];
  const url=beat.source_url||beat.url;
  return events.find(e=>(e.url||e.source_url)===url&&(!beat.published||!e.published||e.published===beat.published))||events.find(e=>(e.url||e.source_url)===url)||null;
}
function mentions(player,text){
  const low=text.toLowerCase(),out=[];
  for(const alias of aliases(player)){
    const re=new RegExp(`\\b${esc(alias.toLowerCase())}\\b`,'g');
    let m;while((m=re.exec(low)))out.push({start:m.index,len:m[0].length,alias});
  }
  return out.sort((a,b)=>a.start-b.start).filter((x,i,a)=>i===0||x.start!==a[i-1].start);
}
function directCue(player,text,start,len){
  const low=text.toLowerCase();
  const before=low.slice(Math.max(0,start-55),start);
  const after=low.slice(start+len,Math.min(low.length,start+len+145));
  const local=low.slice(Math.max(0,start-55),Math.min(low.length,start+len+145));
  if(/\bbrother of (?:the )?(?:[a-z]+ )?(?:qb )?$/.test(before)||/\bbackup(?: qb)? to $/.test(before))return {direction:'CONTEXT',material:false,reason:'RELATIONAL_REFERENCE',subject_window:local};
  if(HARD_NOISE.test(local)&&!POS_AVAIL.test(after)&&!NEG_AVAIL.test(after)&&!POS_ROLE.test(after)&&!NEG_ROLE.test(after))return {direction:'CONTEXT',material:false,reason:'LOCAL_NON_FANTASY_NOISE',subject_window:local};

  const posA=POS_AVAIL.exec(after),negA=NEG_AVAIL.exec(after),posR=POS_ROLE.exec(after),negR=NEG_ROLE.exec(after);
  const beforeNegRole=/(take|decrease|reduce).{0,40}workload.{0,20}$/.test(before);
  const beforeNegAvail=/(injury to|injury for)\s*$/.test(before);
  const withoutSubject=/\bwithout\s+$/.test(before);

  if(posA&&negA){
    const explicitNegation=/won['’]?t go on injured reserve|will not go on injured reserve/i.test(after);
    const recovered=/returned? to practice|returns? to (?:team )?drills|off injury report|cleared|full[- ]go|feels best|feel really good|knee woes? (?:are|is) behind him/i.test(after);
    if(explicitNegation||recovered&&posA.index>=negA.index)return {direction:'POSITIVE',material:true,lane:'availability',reason:'SUBJECT_RECOVERY_SUPERSEDES_PRIOR_SYMPTOM',subject_window:local};
    return {direction:'CONTEXT',material:false,reason:'MIXED_AVAILABILITY_WITHIN_EVENT',subject_window:local};
  }
  if(posA&&!negA)return {direction:'POSITIVE',material:true,lane:'availability',reason:'DIRECT_SUBJECT_AVAILABILITY',subject_window:local};
  if((negA||beforeNegAvail)&&!posA)return {direction:'NEGATIVE',material:true,lane:'availability',reason:'DIRECT_SUBJECT_AVAILABILITY',subject_window:local};

  if(withoutSubject)return {direction:'CONTEXT',material:false,reason:'OTHER_PLAYER_BENEFIT_FROM_SUBJECT_ABSENCE',subject_window:local};
  if(posR&&!negR)return {direction:'POSITIVE',material:true,lane:'role',reason:'DIRECT_SUBJECT_ROLE',subject_window:local};
  if((negR||beforeNegRole)&&!posR)return {direction:'NEGATIVE',material:true,lane:'role',reason:'DIRECT_SUBJECT_ROLE',subject_window:local};
  return {direction:'CONTEXT',material:false,reason:'NO_UNAMBIGUOUS_SUBJECT_SIGNAL',subject_window:local};
}
function classifyLocal(player,e){
  const text=norm(e?.matched_context)||norm(`${e?.headline||''} ${e?.description||''}`);
  if(!text)return {direction:'CONTEXT',material:false,reason:'NO_LOCAL_CONTEXT'};
  const ms=mentions(player,text);
  if(!ms.length)return {direction:'CONTEXT',material:false,reason:'SUBJECT_NOT_LOCALLY_BOUND',local_text:text};
  const evaluations=ms.map(m=>directCue(player,text,m.start,m.len));
  const material=evaluations.filter(x=>x.material&&x.direction!=='CONTEXT');
  if(!material.length)return {...evaluations[0],local_text:text,mention_evaluations:evaluations};
  const directions=new Set(material.map(x=>x.direction));
  if(directions.size>1)return {direction:'CONTEXT',material:false,reason:'CONFLICTING_SUBJECT_SIGNALS_WITHIN_EVENT',local_text:text,mention_evaluations:evaluations};
  const chosen=material.at(-1);
  return {...chosen,local_text:text,mention_evaluations:evaluations};
}

const rows=[];
for(const row of audit.candidates){
  const beatEvaluations=(row.accumulated_context?.material_beats||[]).map(beat=>{
    const event=localEvent(row.player,beat);
    return {published:beat.published||null,headline:beat.headline||null,source_url:beat.source_url||null,matched_context:event?.matched_context||null,...classifyLocal(row.player,event)};
  });
  const directional=beatEvaluations.filter(x=>x.material&&x.direction!=='CONTEXT');
  const positive=directional.filter(x=>x.direction==='POSITIVE').length;
  const negative=directional.filter(x=>x.direction==='NEGATIVE').length;
  const resolution=directional.length?'QUANT_REVIEW':'CONTEXT_ONLY_AFTER_LOCAL_SEMANTIC_GATE';
  rows.push({player:row.player,position:row.position,overall_rank:row.overall_rank,true_value_rank:row.true_value_rank,prior_canonical_applies:row.prior_canonical_applies||[],resolution,local_direction:positive&&negative?'MIXED':positive?'POSITIVE':negative?'NEGATIVE':'CONTEXT',directional_events:directional.length,positive_events:positive,negative_events:negative,beat_evaluations:beatEvaluations});
}
const quantitativeReview=rows.filter(r=>r.resolution==='QUANT_REVIEW');
const contextOnly=rows.filter(r=>r.resolution!=='QUANT_REVIEW');
const out={schema_version:'1.1.0',as_of:new Date().toISOString(),source_checkpoint:5,source_run:34047466708,source_artifact:9993533527,source_digest:'sha256:40d6f54519978dc84271b69bf8f41a46ecfa24fc06cf21ea7be7ff34a68efa21',universe:166,input_candidates:38,quant_review_count:quantitativeReview.length,context_only_count:contextOnly.length,policy:'Read-only post-Checkpoint-5 subject-local semantic gate. Direction must be attached to the candidate player inside a tight subject window; related-person, backup, teammate-benefit, roundup-neighbor and administrative language cannot transfer direction. Explicit recovery/negation supersedes stale symptom wording inside the same event. No numeric or ranking writes are authorized.',quantitative_review:quantitativeReview,context_only:contextOnly,rows};
W('analysis/post-cp5-local-context-semantic-gate-current.json',out);
const md=['# Post-Checkpoint-5 subject-local semantic gate','',`Input candidates: ${out.input_candidates}`,`Advance to quantitative review: ${out.quant_review_count}`,`Context-only after subject-local semantic check: ${out.context_only_count}`,'','## Context-only removals','',...contextOnly.map(r=>`- ${r.player}: no player-owned directional fantasy signal survived.`),'','## Quantitative review pool','',...quantitativeReview.map(r=>`- ${r.player}: ${r.local_direction}; ${r.directional_events} subject-local directional event(s); prior canonical applies: ${r.prior_canonical_applies.length}.`)];
fs.writeFileSync('analysis/post-cp5-local-context-semantic-gate-current.md',md.join('\n')+'\n');
if(rows.length!==38||out.quant_review_count+out.context_only_count!==38)throw new Error('resolution coverage');
if(contextOnly.some(r=>r.directional_events!==0))throw new Error('context-only directional leakage');
for(const p of ['Justin Herbert','Baker Mayfield'])if(rows.find(r=>r.player===p)?.resolution==='QUANT_REVIEW')throw new Error(`${p} inherited another subject's signal`);
if(rows.find(r=>r.player==='Keaton Mitchell')?.local_direction==='NEGATIVE')throw new Error('Keaton Mitchell negated-IR sentence inverted');
if(rows.find(r=>r.player==='Dalton Kincaid')?.local_direction==='NEGATIVE')throw new Error('Dalton Kincaid recovery language inverted');
console.log(JSON.stringify({result:'PASS',input_candidates:38,quant_review:out.quant_review_count,context_only:out.context_only_count,removed:contextOnly.map(x=>x.player)},null,2));