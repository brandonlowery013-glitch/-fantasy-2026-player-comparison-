import fs from 'node:fs';

const R=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const W=(p,x)=>{fs.mkdirSync(p.split('/').slice(0,-1).join('/'),{recursive:true});fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n')};
const source=R('MODEL_SOURCE_OF_TRUTH.json');
const report=R('analysis/transition-intelligence-current.json');
const patch=R(source.current_update_layer);
let players=[];
for(let i=0;i<source.runtime_player_shards;i++)players.push(...R(`players${i}.json`));
players=players.map(p=>({...p,...(patch.players?.[p.n]||{})}));
if(players.length!==166||new Set(players.map(p=>p.n)).size!==166)throw new Error(`canonical universe ${players.length}/166`);
if((report.rows||[]).length!==166)throw new Error(`transition universe ${(report.rows||[]).length}/166`);
const byPlayer=new Map(players.map(p=>[p.n,p]));

const applied=new Map();
for(const f of ['analysis/sep3-v31-canonical-apply-input.json','analysis/material-hold-canonical-apply-input-2026-09-05.json','analysis/post-overall-audit-canonical-apply-input-2026-09-05.json']){
  if(!fs.existsSync(f))continue;
  const x=R(f);
  for(const row of x.rows||[]){const n=row.player;if(!n)continue;const arr=applied.get(n)||[];arr.push({file:f,reason:row.reason||null,classification:row.classification||row.template||null});applied.set(n,arr)}
}

const materialDims=new Set(['role_usage','role_volume','production','ceiling','weekly_reliability','availability_recovery','scheme_adaptation','chemistry','offensive_environment']);
const directionOf=e=>e.direction||'CONTEXT';
const eventText=e=>`${e.headline||''} ${e.description||''} ${e.matched_context||''}`.replace(/\s+/g,' ').trim();
const nameBound=(player,e)=>Boolean(e.direct_player_evidence)||eventText(e).toLowerCase().includes(player.toLowerCase());
const material=e=>{
  const dims=(e.dimensions||[]).filter(d=>materialDims.has(d));
  return nameBound(e.__player,e)&&dims.length>0&&Number(e.significance||0)>=3;
};
const phaseOrder={PRE_CAMP_OFFSEASON:1,OFFSEASON:2,MINICAMP_OTAS:3,TRAINING_CAMP_EARLY:4,TRAINING_CAMP_MID:5,PRESEASON_LATE_CAMP:6,ROSTER_CUTS_FINAL_CAMP:7,CURRENT_SEASON_STATE:8};
const compact=e=>({published:e.published||null,phase:e.phase||null,direction:directionOf(e),headline:e.headline||null,dimensions:e.dimensions||[],significance:Number(e.significance||0),direct_player_evidence:Boolean(e.direct_player_evidence),source_url:e.url||e.source_url||null});

const rows=[];
for(const tr of report.rows||[]){
  const p=byPlayer.get(tr.player);if(!p)throw new Error(`missing canonical ${tr.player}`);
  const raw=(tr.chronological_development?.events||tr.development_evidence||[]).map(e=>({...e,__player:tr.player}));
  const accepted=raw.filter(material).sort((a,b)=>Date.parse(a.published||0)-Date.parse(b.published||0));
  const current=accepted.filter(e=>e.phase==='CURRENT_SEASON_STATE');
  const historical=accepted.filter(e=>e.phase!=='CURRENT_SEASON_STATE');
  const latest=accepted.at(-1)||null;
  const latestDir=latest?directionOf(latest):'NONE';
  const phases=[...new Set(accepted.map(e=>e.phase).filter(Boolean))];
  const directional=accepted.filter(e=>['POSITIVE','NEGATIVE','MIXED'].includes(directionOf(e)));
  const pos=directional.filter(e=>directionOf(e)==='POSITIVE').length;
  const neg=directional.filter(e=>directionOf(e)==='NEGATIVE').length;
  const repeatedDirection=Math.max(pos,neg)>=2&&phases.length>=2;
  const currentMaterial=current.some(e=>['POSITIVE','NEGATIVE','MIXED'].includes(directionOf(e))||Number(e.significance||0)>=6);
  const strongLateHistorical=historical.some(e=>(phaseOrder[e.phase]||0)>=6&&Number(e.significance||0)>=7&&['POSITIVE','NEGATIVE','MIXED'].includes(directionOf(e)));
  const mixed=pos>0&&neg>0;
  let disposition='NO_MATERIAL_RECALIBRATION_SIGNAL';
  let priority='NONE';
  if(currentMaterial){disposition='REVIEW_RECALIBRATION';priority='HIGH'}
  else if(repeatedDirection){disposition='REVIEW_RECALIBRATION';priority='MEDIUM'}
  else if(strongLateHistorical){disposition='REVIEW_RECALIBRATION';priority='MEDIUM'}
  else if(accepted.length){disposition='CONTEXT_CONFIRMATION_ONLY';priority='LOW'}
  const beats=accepted.slice(-5).map(compact);
  rows.push({
    player:tr.player,position:p.p,team:p.t,overall_rank:p.o,true_value_rank:p.tr,true_value_score:p.s,
    canonical_components:{production:p.pd,ceiling:p.ce,role:p.r,environment:p.e,availability:p.a,reliability:p.rl,sustainability:p.su},
    canonical_note:{source:p.ns||null,summary:p.nm||null,action:p.na||null},
    prior_canonical_applies:applied.get(tr.player)||[],
    accumulated_context:{accepted_material_events:accepted.length,current_material_events:current.length,historical_material_events:historical.length,phases,positive_events:pos,negative_events:neg,mixed_direction:mixed,latest_material:latest?compact(latest):null,material_beats:beats},
    progressive_story:tr.chronological_development?.progressive_story||null,
    disposition,priority,
    audit_reason:disposition==='REVIEW_RECALIBRATION'?(currentMaterial?'current material evidence requires fresh full-score comparison':repeatedDirection?'same-direction material evidence persists across multiple phases':'strong late-camp/preseason evidence requires fresh full-score comparison'):accepted.length?'material context exists but does not independently clear recalibration gate':'no accepted direct material evidence in accumulated timeline'
  });
}

const candidates=rows.filter(r=>r.disposition==='REVIEW_RECALIBRATION').sort((a,b)=>({HIGH:0,MEDIUM:1}[a.priority]-({HIGH:0,MEDIUM:1}[b.priority])||a.overall_rank-b.overall_rank);
const confirmations=rows.filter(r=>r.disposition==='CONTEXT_CONFIRMATION_ONLY');
const out={schema_version:'1.0.0',as_of:new Date().toISOString(),source_status:source.status,scope:'FULL_166_ACCUMULATED_CONTEXT_RECALIBRATION_AUDIT',policy:'Read-only full-universe audit. Every player is reconsidered from accumulated offseason/camp/preseason/current evidence without requiring a prior reopen flag. This stage identifies candidates for fresh component re-grading; it does not auto-apply numeric deltas or rankings.',players:rows.length,candidate_count:candidates.length,confirmation_only_count:confirmations.length,no_signal_count:rows.length-candidates.length-confirmations.length,candidates,rows};
W('analysis/full-universe-accumulated-context-audit-current.json',out);
const md=['# Full 166-player accumulated-context audit','',`Players: ${rows.length}`,`Fresh recalibration candidates: ${candidates.length}`,`Context/confirmation only: ${confirmations.length}`,`No accepted material signal: ${out.no_signal_count}`,'','## Recalibration candidates','', '| Player | Pos | OVR | TV | Priority | Accepted events | Latest material |','|---|---:|---:|---:|---|---:|---|',...candidates.map(r=>`| ${r.player} | ${r.position} | ${r.overall_rank} | ${r.true_value_rank} | ${r.priority} | ${r.accumulated_context.accepted_material_events} | ${(r.accumulated_context.latest_material?.headline||'').replaceAll('|','/')} |`)];
fs.writeFileSync('analysis/full-universe-accumulated-context-audit-current.md',md.join('\n')+'\n');
if(rows.length!==166)throw new Error('coverage');
if(rows.some(r=>!r.player||!r.disposition))throw new Error('row completeness');
console.log(JSON.stringify({result:'PASS',players:166,candidates:candidates.length,confirmation_only:confirmations.length,no_signal:out.no_signal_count,high:candidates.filter(x=>x.priority==='HIGH').length,medium:candidates.filter(x=>x.priority==='MEDIUM').length,top_candidates:candidates.slice(0,30).map(x=>x.player)},null,2));
