import fs from 'node:fs';

const R=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const W=(p,x)=>{fs.mkdirSync(p.split('/').slice(0,-1).join('/'),{recursive:true});fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n')};
const audit=R('analysis/full-universe-accumulated-context-audit-current.json');
const transition=R('analysis/transition-intelligence-current.json');
if((audit.candidates||[]).length!==38)throw new Error(`expected checkpoint-5 38 candidates, got ${(audit.candidates||[]).length}`);
if((transition.rows||[]).length!==166)throw new Error(`transition coverage ${(transition.rows||[]).length}/166`);
const byTransition=new Map(transition.rows.map(r=>[r.player,r]));
const norm=s=>String(s||'').replace(/\s+/g,' ').trim();
const ROLE=/\b(workload|touches?|carries|targets?|routes?|snaps?|first[- ]team|starter|starting|depth chart|role|reps?|committee|split|lead back|wr1|wr2|rb1|rb2|featured|volume|bulk|first[- ]read|target share|goal[- ]line|red[- ]zone|chemistry|connection|timing)\b/i;
const AVAIL=/\b(injur|ankle|knee|hamstring|shoulder|foot|acl|pup|injured reserve|\bir\b|limited|practice|full[- ]go|cleared|return|back in action|off injury report|questionable|doubtful|out\b|miss|surgery|recovery|healthy|week 1|soreness)\b/i;
const POS_AVAIL=/\b(full[- ]go|no issues|cleared|back in action|off injury report|returned? to practice|expected to play|will play|minor|progressing|healthy|activated|good to go)\b/i;
const NEG_AVAIL=/\b(did not practice|doesn['’]?t practice|miss(?:ed|ing)? (?:practice|time)|out\b|pup\b|injured reserve|\bir\b|questionable|doubtful|limited|sprain|torn acl|surgery|soreness|week[- ]to[- ]week)\b/i;
const POS_ROLE=/\b(heavy workload|bigger workload|more (?:work|touches|carries|targets|snaps|routes)|first[- ]team|named (?:the )?starter|starting role|lead back|featured|bulk|breakout|strong camp|chemistry|connection|expanded role|increased role|target share up|first[- ]read|primary target)\b/i;
const NEG_ROLE=/\b(decrease .*workload|reduce .*workload|take .*workload off|less workload|behind\b|backup\b|lack of targets|quiet\b|limited role|committee|split (?:work|carries|touches)|demoted|losing (?:work|role|snaps|targets)|fewer (?:touches|snaps|targets|routes)|target share down)\b/i;
const HARD_NOISE=/\b(personal reasons?|rest day|contract extension|restructured|jersey|number change|initial 53[- ]man roster)\b/i;

function localEvent(player,beat){
  const row=byTransition.get(player);
  const events=row?.chronological_development?.events||row?.development_evidence||[];
  const url=beat.source_url||beat.url;
  return events.find(e=>(e.url||e.source_url)===url&&(!beat.published||!e.published||e.published===beat.published))||events.find(e=>(e.url||e.source_url)===url)||null;
}
function classifyLocal(e){
  const text=norm(e?.matched_context)||norm(`${e?.headline||''} ${e?.description||''}`);
  if(!text)return {direction:'CONTEXT',material:false,reason:'NO_LOCAL_CONTEXT'};
  if(HARD_NOISE.test(text)&&!/injur|acl|ankle|knee|hamstring|shoulder|foot|surgery/i.test(text))return {direction:'CONTEXT',material:false,reason:'LOCAL_NON_FANTASY_NOISE',local_text:text};
  const pa=POS_AVAIL.test(text),na=NEG_AVAIL.test(text),pr=POS_ROLE.test(text),nr=NEG_ROLE.test(text);
  if(na&&!pa)return {direction:'NEGATIVE',material:true,lane:'availability',local_text:text};
  if(pa&&!na)return {direction:'POSITIVE',material:true,lane:'availability',local_text:text};
  if(nr&&!pr)return {direction:'NEGATIVE',material:true,lane:'role',local_text:text};
  if(pr&&!nr)return {direction:'POSITIVE',material:true,lane:'role',local_text:text};
  if(ROLE.test(text)||AVAIL.test(text))return {direction:'CONTEXT',material:false,reason:'LOCAL_CONTEXT_WITHOUT_DIRECTION',local_text:text};
  return {direction:'CONTEXT',material:false,reason:'NO_LOCAL_FANTASY_SIGNAL',local_text:text};
}

const rows=[];
for(const row of audit.candidates){
  const beatEvaluations=(row.accumulated_context?.material_beats||[]).map(beat=>{
    const event=localEvent(row.player,beat);
    return {published:beat.published||null,headline:beat.headline||null,source_url:beat.source_url||null,matched_context:event?.matched_context||null,...classifyLocal(event)};
  });
  const directional=beatEvaluations.filter(x=>x.material&&x.direction!=='CONTEXT');
  const positive=directional.filter(x=>x.direction==='POSITIVE').length;
  const negative=directional.filter(x=>x.direction==='NEGATIVE').length;
  const resolution=directional.length?'QUANT_REVIEW':'CONTEXT_ONLY_AFTER_LOCAL_SEMANTIC_GATE';
  rows.push({player:row.player,position:row.position,overall_rank:row.overall_rank,true_value_rank:row.true_value_rank,prior_canonical_applies:row.prior_canonical_applies||[],resolution,local_direction:positive&&negative?'MIXED':positive?'POSITIVE':negative?'NEGATIVE':'CONTEXT',directional_events:directional.length,positive_events:positive,negative_events:negative,beat_evaluations:beatEvaluations});
}
const quantitativeReview=rows.filter(r=>r.resolution==='QUANT_REVIEW');
const contextOnly=rows.filter(r=>r.resolution!=='QUANT_REVIEW');
const out={schema_version:'1.0.0',as_of:new Date().toISOString(),source_checkpoint:5,source_run:34047466708,source_artifact:9993533527,source_digest:'sha256:40d6f54519978dc84271b69bf8f41a46ecfa24fc06cf21ea7be7ff34a68efa21',universe:166,input_candidates:38,quant_review_count:quantitativeReview.length,context_only_count:contextOnly.length,policy:'Read-only post-Checkpoint-5 semantic gate. Multi-item roundup direction and materiality must be derived from the player-local matched_context, not another player named in the article headline or global article text. This gate does not apply scores, component changes, ranks, boards, projections, market labels, ADP/ECR, or fair-value changes. Prior canonical applies are carried forward for de-duplication at the quantitative gate.',quantitative_review:quantitativeReview,context_only:contextOnly,rows};
W('analysis/post-cp5-local-context-semantic-gate-current.json',out);
const md=['# Post-Checkpoint-5 player-local semantic gate','',`Input candidates: ${out.input_candidates}`,`Advance to quantitative review: ${out.quant_review_count}`,`Context-only after local semantic check: ${out.context_only_count}`,'','## Context-only removals','',...contextOnly.map(r=>`- ${r.player}: no player-local directional fantasy signal survived the matched-context check.`),'','## Quantitative review pool','',...quantitativeReview.map(r=>`- ${r.player}: ${r.local_direction}; ${r.directional_events} local directional event(s); prior canonical applies: ${r.prior_canonical_applies.length}.`)];
fs.writeFileSync('analysis/post-cp5-local-context-semantic-gate-current.md',md.join('\n')+'\n');
if(rows.length!==38||out.quant_review_count+out.context_only_count!==38)throw new Error('resolution coverage');
if(contextOnly.some(r=>r.directional_events!==0))throw new Error('context-only directional leakage');
console.log(JSON.stringify({result:'PASS',input_candidates:38,quant_review:out.quant_review_count,context_only:out.context_only_count,removed:contextOnly.map(x=>x.player)},null,2));