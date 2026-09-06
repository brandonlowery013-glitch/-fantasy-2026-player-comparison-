import fs from 'node:fs';
import zlib from 'node:zlib';

const R=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const W=(p,x)=>{fs.mkdirSync(p.split('/').slice(0,-1).join('/'),{recursive:true});fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n')};
const source=R('MODEL_SOURCE_OF_TRUTH.json');
const report=R('analysis/transition-intelligence-current.json');
const patch=R(source.current_update_layer);
const scoutingManifest=R('analysis/player-scouting-context-recovered-2026-09-05.json');
const scoutingEncoded=scoutingManifest.payload.ordered_files.map(f=>fs.readFileSync(`analysis/scouting-context-payload/${f}`,'utf8').trim()).join('');
let scouting;
try{scouting=JSON.parse(zlib.gunzipSync(Buffer.from(scoutingEncoded,'base64')).toString('utf8'))}catch(err){throw new Error(`scouting context decode failed: ${err.message}`)}
if((scouting.players||[]).length!==166||new Set(scouting.players.map(x=>x.n)).size!==166)throw new Error(`scouting context coverage ${(scouting.players||[]).length}/166`);
const scoutingByPlayer=new Map(scouting.players.map(x=>[x.n,x]));

let players=[];
for(let i=0;i<source.runtime_player_shards;i++)players.push(...R(`players${i}.json`));
players=players.map(p=>({...p,...(patch.players?.[p.n]||{})}));
if(players.length!==166||new Set(players.map(p=>p.n)).size!==166)throw new Error(`canonical universe ${players.length}/166`);
if((report.rows||[]).length!==166)throw new Error(`transition universe ${(report.rows||[]).length}/166`);
const canonicalNames=new Set(players.map(p=>p.n));
for(const n of scoutingByPlayer.keys())if(!canonicalNames.has(n))throw new Error(`noncanonical scouting player ${n}`);
for(const n of canonicalNames)if(!scoutingByPlayer.has(n))throw new Error(`missing scouting context ${n}`);
const byPlayer=new Map(players.map(p=>[p.n,p]));

const applied=new Map();
for(const f of ['analysis/sep3-v31-canonical-apply-input.json','analysis/material-hold-canonical-apply-input-2026-09-05.json','analysis/post-overall-audit-canonical-apply-input-2026-09-05.json']){
  if(!fs.existsSync(f))continue;
  const x=R(f);
  for(const row of x.rows||[]){const n=row.player;if(!n)continue;const arr=applied.get(n)||[];arr.push({file:f,reason:row.reason||null,classification:row.classification||row.template||null});applied.set(n,arr)}
}

const materialDims=new Set(['role_usage','role_volume','production','ceiling','weekly_reliability','availability_recovery','scheme_adaptation','chemistry','offensive_environment']);
const phaseOrder={PRE_CAMP_OFFSEASON:1,OFFSEASON:2,MINICAMP_OTAS:3,TRAINING_CAMP_EARLY:4,TRAINING_CAMP_MID:5,PRESEASON_LATE_CAMP:6,ROSTER_CUTS_FINAL_CAMP:7,CURRENT_SEASON_STATE:8};
const eventText=e=>`${e.headline||''} ${e.description||''} ${e.matched_context||''}`.replace(/\s+/g,' ').trim();
const playerBound=(player,e)=>eventText(e).toLowerCase().includes(player.toLowerCase());
const NOISE=[/\binitial 53[- ]man roster\b/i,/\b53[- ]man roster\b/i,/\bcontract extension\b/i,/\brestructured\b/i,/\bjersey\b/i,/\blanding no\.?\s*\d+\b/i,/\bnumber change\b/i,/\brest day\b/i,/\bwill not play\b.{0,45}\bpreseason\b/i,/\bwon['’]?t play\b.{0,45}\bpreseason\b/i];
const ROLE_CUE=/\b(workload|touches?|carries|targets?|routes?|snaps?|first[- ]team|starter|starting|depth chart|role|reps?|committee|split|lead back|wr1|wr2|rb1|rb2|featured|volume|bulk|first[- ]read|target share)\b/i;
const AVAIL_CUE=/\b(injur|ankle|knee|hamstring|shoulder|foot|acl|pup|injured reserve|\bir\b|limited|practice|full[- ]go|cleared|return|back in action|off injury report|questionable|doubtful|out\b|miss|50-50|surgery|recovery|checkpoints?|fine|healthy|progressing|week 1)\b/i;
const OTHER_CUE=/\b(chemistry|connection|timing|scheme|offense|production|breakout|ceiling|reliab|environment)\b/i;
const POS_RECOVERY=/\b(hit all (?:of )?his checkpoints?|full[- ]go|no issues|cleared|back in action|off injury report|returned? to practice|expected to play|will play|going to be fine|minor|progressing|healthy)\b/i;
const NEG_RECOVERY=/\b(doesn['’]?t practice|did not practice|miss(?:ed|ing)? practice|out\b|pup\b|injured reserve|\bir\b|50-50|questionable|doubtful|limited|high ankle sprain|torn acl|surgery)\b/i;
const POS_ROLE=/\b(heavy workload|bigger workload|more (?:work|touches|carries|targets|snaps|routes)|first[- ]team|named (?:the )?starter|starting role|lead back|featured|bulk (?:of )?(?:the )?(?:work|reps|touches)|breakout|camp surge|showing no rust|strong camp|chemistry|connection|expanded role|increased role|target share up|first[- ]read)\b/i;
const NEG_ROLE=/\b(decrease .*workload|reduce .*workload|take .*workload off|less workload|behind\b|backup\b|lack of targets|quiet\b|limited role|committee|split (?:work|carries|touches)|demoted|losing (?:work|role|snaps|targets)|fewer (?:touches|snaps|targets|routes)|target share down)\b/i;
const isNoise=e=>NOISE.some(r=>r.test(eventText(e)));
const material=e=>{const dims=(e.dimensions||[]).filter(d=>materialDims.has(d));if(!playerBound(e.__player,e)||dims.length===0||Number(e.significance||0)<3||isNoise(e))return false;const t=eventText(e);if(dims.length===1&&dims[0]==='role_usage'&&!ROLE_CUE.test(t)&&!AVAIL_CUE.test(t))return false;if(dims.includes('availability_recovery')&&!AVAIL_CUE.test(t))return false;return ROLE_CUE.test(t)||AVAIL_CUE.test(t)||OTHER_CUE.test(t)};
const semanticDirection=e=>{const t=eventText(e),dims=new Set(e.dimensions||[]);if(dims.has('availability_recovery')||AVAIL_CUE.test(t)){const pos=POS_RECOVERY.test(t),neg=NEG_RECOVERY.test(t);if(pos&&!neg)return'POSITIVE';if(neg&&!pos)return'NEGATIVE'}if([...dims].some(d=>['role_usage','role_volume','production','ceiling','weekly_reliability','scheme_adaptation','chemistry','offensive_environment'].includes(d))){const pos=POS_ROLE.test(t),neg=NEG_ROLE.test(t);if(pos&&!neg)return'POSITIVE';if(neg&&!pos)return'NEGATIVE'}return'CONTEXT'};
const compact=e=>({published:e.published||null,phase:e.phase||null,source_direction:e.direction||'CONTEXT',semantic_direction:semanticDirection(e),headline:e.headline||null,dimensions:e.dimensions||[],significance:Number(e.significance||0),direct_player_evidence:Boolean(e.direct_player_evidence),source_url:e.url||e.source_url||null});
const storyFocus=sc=>`${sc?.c||''} ${sc?.s||''} ${sc?.r||''}`.replace(/\s+/g,' ').trim();
const relationToStory=(e,sc)=>{const t=eventText(e).toLowerCase(),story=storyFocus(sc).toLowerCase();if(!story)return'NO_STORED_THESIS';const lanes=[['target','targets','target share','first-read','route','routes'],['role','workload','touches','carries','snaps','committee'],['health','injury','injured','acl','ankle','knee','shoulder','availability','recovery'],['quarterback','chemistry','connection','timing'],['offense','scheme','environment'],['ceiling','production','touchdown']];for(const lane of lanes){if(lane.some(k=>story.includes(k))&&lane.some(k=>t.includes(k)))return semanticDirection(e)==='CONTEXT'?'THESIS_CONTEXT':'THESIS_RELEVANT_CHANGE'}return'ADJACENT_NEW_CONTEXT'};

const rows=[];let rejected_unbound=0,rejected_noise=0,rejected_nonmaterial=0;
for(const tr of report.rows||[]){
  const p=byPlayer.get(tr.player);if(!p)throw new Error(`missing canonical ${tr.player}`);
  const sc=scoutingByPlayer.get(tr.player);if(!sc)throw new Error(`missing scouting thesis ${tr.player}`);
  const raw=(tr.chronological_development?.events||tr.development_evidence||[]).map(e=>({...e,__player:tr.player}));
  for(const e of raw){const dims=(e.dimensions||[]).filter(d=>materialDims.has(d));if(dims.length===0||Number(e.significance||0)<3){rejected_nonmaterial++;continue}if(!playerBound(tr.player,e)){rejected_unbound++;continue}if(isNoise(e)){rejected_noise++;continue}}
  const accepted=raw.filter(material).sort((a,b)=>Date.parse(a.published||0)-Date.parse(b.published||0));
  const current=accepted.filter(e=>e.phase==='CURRENT_SEASON_STATE'),historical=accepted.filter(e=>e.phase!=='CURRENT_SEASON_STATE'),latest=accepted.at(-1)||null;
  const phases=[...new Set(accepted.map(e=>e.phase).filter(Boolean))],directional=accepted.filter(e=>['POSITIVE','NEGATIVE','MIXED'].includes(semanticDirection(e))),pos=directional.filter(e=>semanticDirection(e)==='POSITIVE').length,neg=directional.filter(e=>semanticDirection(e)==='NEGATIVE').length;
  const repeatedDirection=Math.max(pos,neg)>=2&&phases.length>=2;
  const currentStoryMaterial=current.some(e=>relationToStory(e,sc)==='THESIS_RELEVANT_CHANGE'&&Number(e.significance||0)>=6);
  const strongLateHistorical=historical.some(e=>(phaseOrder[e.phase]||0)>=6&&Number(e.significance||0)>=7&&relationToStory(e,sc)==='THESIS_RELEVANT_CHANGE');
  let disposition='NO_MATERIAL_RECALIBRATION_SIGNAL',priority='NONE';
  if(currentStoryMaterial){disposition='REVIEW_RECALIBRATION';priority='HIGH'}
  else if(repeatedDirection&&accepted.some(e=>relationToStory(e,sc)==='THESIS_RELEVANT_CHANGE')){disposition='REVIEW_RECALIBRATION';priority='MEDIUM'}
  else if(strongLateHistorical){disposition='REVIEW_RECALIBRATION';priority='MEDIUM'}
  else if(accepted.length){disposition='CONTEXT_CONFIRMATION_ONLY';priority='LOW'}
  const beats=accepted.slice(-5).map(e=>({...compact(e),story_relation:relationToStory(e,sc)}));
  rows.push({player:tr.player,position:p.p,team:p.t,overall_rank:p.o,true_value_rank:p.tr,true_value_score:p.s,canonical_components:{production:p.pd,ceiling:p.ce,role:p.r,environment:p.e,availability:p.a,reliability:p.rl,sustainability:p.su},canonical_note:{source:p.ns||null,summary:p.nm||null,action:p.na||null},scouting_context:{historical_classification:sc.c||null,current_thesis:sc.s||null,primary_risk:sc.r||null},prior_canonical_applies:applied.get(tr.player)||[],accumulated_context:{accepted_material_events:accepted.length,current_material_events:current.length,historical_material_events:historical.length,phases,positive_events:pos,negative_events:neg,mixed_direction:pos>0&&neg>0,latest_material:latest?{...compact(latest),story_relation:relationToStory(latest,sc)}:null,material_beats:beats},progressive_story:tr.chronological_development?.progressive_story||null,disposition,priority,audit_reason:disposition==='REVIEW_RECALIBRATION'?(currentStoryMaterial?'current evidence materially challenges or advances the stored player thesis':'persistent/late evidence is materially relevant to the stored player thesis'):accepted.length?'new evidence exists but does not independently change the stored scouting thesis':'no accepted player-bound material evidence'});
}
const priorityOrder={HIGH:0,MEDIUM:1};
const candidates=rows.filter(r=>r.disposition==='REVIEW_RECALIBRATION').sort((a,b)=>(priorityOrder[a.priority]??2)-(priorityOrder[b.priority]??2)||a.overall_rank-b.overall_rank),confirmations=rows.filter(r=>r.disposition==='CONTEXT_CONFIRMATION_ONLY');
const out={schema_version:'2.0.0',as_of:new Date().toISOString(),source_status:source.status,scope:'FULL_166_SCOUTING_CONTEXT_AWARE_RECALIBRATION_AUDIT',policy:'Read-only full-universe audit. Each player now carries a persistent recovered scouting thesis. Fresh evidence is evaluated against that thesis before promotion. News presentation remains separate from scouting/ranking logic. No numeric or ranking changes are auto-applied.',players:rows.length,scouting_context_coverage:scoutingByPlayer.size,candidate_count:candidates.length,confirmation_only_count:confirmations.length,no_signal_count:rows.length-candidates.length-confirmations.length,gate_diagnostics:{rejected_unbound,rejected_noise,rejected_nonmaterial},candidates,rows};
W('analysis/full-universe-accumulated-context-audit-current.json',out);
const md=['# Full 166-player scouting-context-aware audit','',`Players: ${rows.length}`,`Scouting context: ${scoutingByPlayer.size}/166`,`Fresh recalibration candidates: ${candidates.length}`,`Context/confirmation only: ${confirmations.length}`,`No accepted material signal: ${out.no_signal_count}`,'','## Recalibration candidates','', '| Player | Pos | OVR | TV | Priority | Stored thesis | Latest material |','|---|---:|---:|---:|---|---|---|',...candidates.map(r=>`| ${r.player} | ${r.position} | ${r.overall_rank} | ${r.true_value_rank} | ${r.priority} | ${(r.scouting_context.current_thesis||'').replaceAll('|','/')} | ${(r.accumulated_context.latest_material?.headline||'').replaceAll('|','/')} |`)];
fs.writeFileSync('analysis/full-universe-accumulated-context-audit-current.md',md.join('\n')+'\n');
if(rows.length!==166||scoutingByPlayer.size!==166)throw new Error('coverage');
if(rows.some(r=>!r.player||!r.disposition||!r.scouting_context?.current_thesis))throw new Error('row/scouting completeness');
for(const bad of ['French accounts for 4 TDs as Cincinnati extends home opener streak with 34-15 victory'])if(candidates.some(r=>r.accumulated_context.material_beats.some(e=>e.headline===bad)))throw new Error('unbound contamination survived');
if(candidates.find(r=>r.player==='Jalen Hurts')?.accumulated_context.material_beats.some(e=>/53[- ]man roster/i.test(e.headline||'')))throw new Error('roster noise survived');
console.log(JSON.stringify({result:'PASS',players:166,scouting_context:166,candidates:candidates.length,confirmation_only:confirmations.length,no_signal:out.no_signal_count,high:candidates.filter(x=>x.priority==='HIGH').length,medium:candidates.filter(x=>x.priority==='MEDIUM').length,gate_diagnostics:out.gate_diagnostics,top_candidates:candidates.slice(0,30).map(x=>x.player)},null,2));
