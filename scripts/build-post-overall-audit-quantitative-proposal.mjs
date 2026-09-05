import fs from 'node:fs';

const R=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const W=(p,x)=>fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n');
const INPUT='analysis/post-overall-audit-quantitative-input-2026-09-05.json';
const OUT='analysis/post-overall-audit-quantitative-proposal-current.json';
const MD='analysis/post-overall-audit-quantitative-proposal-current.md';
const weights={pd:.35,ce:.20,r:.15,e:.10,a:.10,rl:.05,su:.05};
const semantic={pd:'production',ce:'ceiling',r:'role_volume',e:'offensive_environment',a:'availability',rl:'weekly_reliability',su:'sustainability'};
const rd=(x,n=6)=>+Number(x).toFixed(n);
const clamp=x=>Math.max(0,Math.min(10,x));
const inp=R(INPUT),src=R('MODEL_SOURCE_OF_TRUTH.json'),prior=R('analysis/sep3-v31-canonical-apply-input.json'),patch=R(src.current_update_layer);
if(inp.approval!=='USER_APPROVED_QUANTITATIVE_RECALCULATION')throw Error('approval gate');
if(inp.universe!==166||inp.universe!==Number(src.active_player_model))throw Error('universe gate');
if(inp.expected_reopens!==12||inp.rows.length!==12||new Set(inp.rows.map(x=>x.player)).size!==12)throw Error('12-player gate');
let players=[];for(let i=0;i<src.runtime_player_shards;i++)players.push(...R(`players${i}.json`));
if(players.length!==166||new Set(players.map(x=>x.n)).size!==166)throw Error('canonical player coverage');
for(const p of players)Object.assign(p,patch.players?.[p.n]||{});
const by=new Map(players.map(x=>[x.n,x]));
const priorBy=new Map(prior.rows.map(x=>[x.player,x]));
// Every quantitative magnitude must already exist for that exact component in the Sep. 3 governed calibration input.
const precedent={};for(const k of Object.keys(weights))precedent[k]=new Set();
for(const row of prior.rows)for(const[k,v]of Object.entries(row.component_deltas||{}))if(precedent[k])precedent[k].add(rd(Math.abs(+v),6));
const errors=[];
for(const [name,t] of Object.entries(inp.templates||{}))for(const[k,v]of Object.entries(t)){
  if(!(k in weights))errors.push(`unknown template component ${name}:${k}`);
  else if(!precedent[k].has(rd(Math.abs(+v),6)))errors.push(`new ungoverned magnitude ${name}:${k}:${v}`);
}
const rows=[];
for(const x of inp.rows){
  const p=by.get(x.player);if(!p){errors.push(`missing player ${x.player}`);continue}
  const base={score:+p.s,components:Object.fromEntries(Object.keys(weights).map(k=>[k,+p[k]])),overall:p.o,true_value:p.tr,projection:p.mp,market:p.px,adp:p.ad,fair_window:p.fw};
  if(x.resolution==='ACCOUNTED_PRIOR_ZERO_DELTA'){
    const q=priorBy.get(x.player);
    if(!q||q.classification!==x.prior_reference?.classification)errors.push(`prior reference mismatch ${x.player}`);
    rows.push({player:x.player,direction:x.direction,resolution:x.resolution,reason:x.reason,base,component_deltas:{},component_targets:{},score_delta:0,proposed_score:base.score});
    continue;
  }
  if(x.resolution==='ZERO_DELTA_CONFIRMATION'){
    rows.push({player:x.player,direction:x.direction,resolution:x.resolution,reason:x.reason,base,component_deltas:{},component_targets:{},score_delta:0,proposed_score:base.score});
    continue;
  }
  const t=inp.templates?.[x.template];if(!t){errors.push(`missing template ${x.player}:${x.template}`);continue}
  const allowed=new Set(x.allowed_components||[]),deltas={},targets={};let scoreDelta=0;
  for(const[k,v]of Object.entries(t)){
    if(!allowed.has(semantic[k])){errors.push(`component outside adjudicated scope ${x.player}:${k}`);continue}
    if(!Number.isFinite(+p[k])){errors.push(`missing canonical component ${x.player}:${k}`);continue}
    const target=rd(clamp(+p[k]+(+v)),3),actual=rd(target-(+p[k]),6);
    deltas[k]=actual;targets[k]=target;scoreDelta+=actual*weights[k];
  }
  scoreDelta=rd(scoreDelta,6);
  if(x.direction==='UP'&&scoreDelta<=0)errors.push(`direction math ${x.player} expected UP got ${scoreDelta}`);
  if(x.direction==='DOWN'&&scoreDelta>=0)errors.push(`direction math ${x.player} expected DOWN got ${scoreDelta}`);
  rows.push({player:x.player,direction:x.direction,resolution:'PROPOSE_COMPONENT_CHANGE',template:x.template,reason:x.reason,base,component_deltas:deltas,component_targets:targets,score_delta:scoreDelta,proposed_score:rd(base.score+scoreDelta,6)});
}
const changed=rows.filter(x=>x.score_delta!==0),zero=rows.filter(x=>x.score_delta===0);
if(changed.length!==9||zero.length!==3)errors.push(`expected 9 changed / 3 zero, got ${changed.length}/${zero.length}`);
const report={schema_version:'1.0.0',generated_at:new Date().toISOString(),as_of:inp.as_of,source_pr:inp.source_pr,source_audit_run:inp.source_audit_run,source_audit_artifact:inp.source_audit_artifact,universe:166,authority:'READ_ONLY_QUANTITATIVE_PROPOSAL_REQUIRES_SEPARATE_CANONICAL_APPLY',canonical_writes:false,policy:inp.policy,coverage:{reviewed:rows.length,expected:12,complete:rows.length===12},counts:{proposed_component_changes:changed.length,zero_delta_resolutions:zero.length,errors:errors.length},errors,rows};
W(OUT,report);
const md=['# Post-Overall Audit Quantitative Proposal','',`Coverage: ${rows.length}/12.`,`Proposed component changes: ${changed.length}.`,`Zero-delta resolutions: ${zero.length}.`,`Canonical writes: false.`,'', '| Player | Dir | Resolution | Score delta | Proposed score | Components |','|---|---|---|---:|---:|---|'];
for(const r of rows)md.push(`| ${r.player} | ${r.direction} | ${r.resolution} | ${r.score_delta>=0?'+':''}${r.score_delta} | ${r.proposed_score} | ${Object.entries(r.component_targets).map(([k,v])=>`${k} ${r.base.components[k]}→${v}`).join('; ')||'none'} |`);
fs.writeFileSync(MD,md.join('\n')+'\n');
console.log(JSON.stringify({result:errors.length?'FAIL':'PASS',coverage:`${rows.length}/12`,changed:changed.map(x=>({player:x.player,delta:x.score_delta,targets:x.component_targets})),zero:zero.map(x=>x.player),canonical_writes:false,errors},null,2));
if(errors.length)process.exit(1);
