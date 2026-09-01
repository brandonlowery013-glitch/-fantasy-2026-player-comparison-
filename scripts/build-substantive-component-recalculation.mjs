import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const exists=p=>fs.existsSync(path.join(root,p));
const write=(p,x)=>{const full=path.join(root,p);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,JSON.stringify(x,null,2)+'\n');};
const round=(x,d=6)=>Number(Number(x).toFixed(d));
const selfTest=process.argv.includes('--self-test');

const source=read('MODEL_SOURCE_OF_TRUTH.json');
const expected=Number(source.active_player_model);
const shards=Number(source.runtime_player_shards);
let players=[];
for(let i=0;i<shards;i++) players.push(...read(`players${i}.json`));
if(players.length!==expected) throw new Error(`Universe mismatch: expected ${expected}, loaded ${players.length}`);

let review=exists('guardrails/current-football-review.json')?read('guardrails/current-football-review.json'):null;
let context=exists('data/probability/substantive-football-context-inputs-2026.json')?read('data/probability/substantive-football-context-inputs-2026.json'):null;
const weekly=exists('data/probability/weekly-projection-inputs-2026.json')?read('data/probability/weekly-projection-inputs-2026.json'):null;

const componentAliases={production:'pd',ceiling:'ce',role_volume:'r',offensive_environment:'e',availability:'a',weekly_reliability:'rl',sustainability:'su'};
const weights={production:.35,ceiling:.20,role_volume:.15,offensive_environment:.10,availability:.10,weekly_reliability:.05,sustainability:.05};
const componentValue=(p,k)=>Number(p[componentAliases[k]]);
const scoreFrom=components=>Object.entries(weights).reduce((s,[k,w])=>s+Number(components[k])*w,0);
const clamp=(x,a=0,b=10)=>Math.max(a,Math.min(b,x));

if(selfTest){
  const candidates=players.filter(p=>Number.isFinite(Number(p.mp))&&Number.isFinite(Number(p.pd)));
  const numericPlayer=candidates.find(p=>p.p==='WR')||candidates[0];
  const blockedPlayer=candidates.find(p=>p.n!==numericPlayer.n&&p.p===numericPlayer.p)||candidates.find(p=>p.n!==numericPlayer.n);
  if(!numericPlayer||!blockedPlayer)throw new Error('Self-test could not select two canonical players');
  const now=new Date().toISOString();
  review={players:[
    {player:numericPlayer.n,status:'MATERIAL_CHANGE',reason:'Self-test verified role increase',material_news_signals:[]},
    {player:blockedPlayer.n,status:'MATERIAL_CHANGE',reason:'Self-test role change missing quantitative evidence',material_news_signals:[]}
  ]};
  context={status:'SELF_TEST',players:{
    [numericPlayer.n]:{context_status:'PASS',availability_status:'UNRESOLVED',signals:{role:{status:'CURRENT',captured_at:now,source:'SELF_TEST',stat_adjustments:{targets:{mean_pct:.10}}}}},
    [blockedPlayer.n]:{context_status:'PASS',availability_status:'UNRESOLVED',signals:{role:{status:'CURRENT',captured_at:now,source:'SELF_TEST',stat_adjustments:{}}}}
  }};
}

function triggerFor(name){
  const r=(review?.players||[]).find(x=>x.player===name);
  const news=Array.isArray(r?.material_news_signals)?r.material_news_signals:[];
  const material=r?.status==='MATERIAL_CHANGE';
  return {triggered:material||news.length>0,review:r||null,material_status:material,material_news_signals:news};
}
function signalComponents(trigger){
  const txt=[trigger.review?.reason,...trigger.material_news_signals.map(x=>`${x.headline||''} ${x.description||''}`)].join(' ').toLowerCase();
  const out=new Set();
  if(/injur|practice|limited|questionable|doubtful|out|ir|pup|suspend|activate|return/.test(txt)){out.add('availability');out.add('weekly_reliability');out.add('production');out.add('ceiling');}
  if(/role|target|carry|touch|starter|start|depth chart|first team|snap|route|red zone|goal line|third down|two minute/.test(txt)){out.add('role_volume');out.add('production');out.add('ceiling');out.add('weekly_reliability');}
  if(/trade|traded|sign|signed|release|waiv|quarterback|qb|offense|offensive line|coach|coordinator/.test(txt)){out.add('offensive_environment');out.add('production');out.add('ceiling');}
  return [...out];
}
function contextReadiness(name){
  const c=context?.players?.[name];
  if(!c)return {ready:false,reason:'NO_STRUCTURED_CONTEXT_RECORD'};
  const current=Object.values(c.signals||{}).filter(s=>s?.status==='CURRENT');
  const adjustments=current.flatMap(s=>Object.values(s.stat_adjustments||{})).filter(a=>Number.isFinite(Number(a?.mean_pct)));
  return {ready:c.context_status==='PASS'&&current.length>0,context_status:c.context_status||null,availability_status:c.availability_status||null,current_signal_count:current.length,quantitative_adjustment_count:adjustments.length};
}
function projectionAdjustment(name){
  const c=context?.players?.[name];
  const direct=[];
  for(const s of Object.values(c?.signals||{})){
    if(s?.status!=='CURRENT')continue;
    for(const [stat,a] of Object.entries(s.stat_adjustments||{}))if(Number.isFinite(Number(a?.mean_pct)))direct.push({stat,pct:Number(a.mean_pct),source:s.source||null});
  }
  if(direct.length){return {ready:true,source:'SUBSTANTIVE_STRUCTURED_CONTEXT',mean_pct:round(direct.reduce((a,b)=>a+b.pct,0)/direct.length,6),stats:direct.map(x=>x.stat)};}
  const wp=weekly?.players?.[name];
  if(!wp)return {ready:false,reason:'NO_QUANTITATIVE_SUBSTANTIVE_ADJUSTMENT'};
  const rows=Object.entries(wp.projections||{});
  const actionable=rows.filter(([,v])=>v?.actionable===true&&Number.isFinite(Number(v?.adjustments?.mean_multiplier)));
  if(!actionable.length)return {ready:false,reason:'NO_QUANTITATIVE_SUBSTANTIVE_ADJUSTMENT'};
  const pct=actionable.map(([,v])=>Number(v.adjustments.mean_multiplier)-1).filter(Number.isFinite);
  if(!pct.length)return {ready:false,reason:'NO_NUMERIC_MEAN_ADJUSTMENT'};
  return {ready:true,source:'WEEKLY_ACTIONABLE_PROJECTION',mean_pct:round(pct.reduce((a,b)=>a+b,0)/pct.length,6),stats:actionable.map(([k])=>k)};
}
function fitProductionScore(position,proposedPpr){
  const pts=players.filter(p=>p.p===position&&Number.isFinite(Number(p.mp))&&Number.isFinite(Number(p.pd))).map(p=>({x:Number(p.mp),y:Number(p.pd)}));
  if(pts.length<5)return null;
  const near=[...pts].sort((a,b)=>Math.abs(a.x-proposedPpr)-Math.abs(b.x-proposedPpr)).slice(0,Math.min(12,pts.length));
  const mx=near.reduce((s,p)=>s+p.x,0)/near.length,my=near.reduce((s,p)=>s+p.y,0)/near.length;
  const den=near.reduce((s,p)=>s+(p.x-mx)**2,0);if(!den)return null;
  const slope=near.reduce((s,p)=>s+(p.x-mx)*(p.y-my),0)/den;
  return clamp(my+slope*(proposedPpr-mx));
}

const rows=[];
for(const p of players){
  const trigger=triggerFor(p.n);if(!trigger.triggered)continue;
  const implicated=signalComponents(trigger),ctx=contextReadiness(p.n),adj=projectionAdjustment(p.n);
  const currentComponents=Object.fromEntries(Object.keys(weights).map(k=>[k,componentValue(p,k)]));
  const base={player:p.n,pos:p.p,current_true_value_rank:p.tr,current_overall_rank:p.o,current_score:Number(p.s),current_projected_ppr:Number.isFinite(Number(p.mp))?Number(p.mp):null,implicated_components:implicated,trigger_types:[...(trigger.material_status?['VERIFIED_MATERIAL_STATUS']:[]),...(trigger.material_news_signals.length?['MATERIAL_NEWS_SIGNAL']:[])],context_readiness:ctx,projection_readiness:adj,material_news_signals:trigger.material_news_signals,reason:trigger.review?.reason||null};
  if(!ctx.ready||!adj.ready||base.current_projected_ppr==null){rows.push({...base,status:'BLOCKED_MISSING_QUANTITATIVE_EVIDENCE',proposed_projected_ppr:null,proposed_components:null,proposed_score:null,proposed_true_value_rank:null,proposed_overall_rank:null,approval_required:false});continue;}
  if(Math.abs(adj.mean_pct)<0.005){rows.push({...base,status:'REVIEW_NO_CHANGE',proposed_projected_ppr:base.current_projected_ppr,proposed_components:currentComponents,proposed_score:round(scoreFrom(currentComponents)),proposed_true_value_rank:p.tr,proposed_overall_rank:p.o,approval_required:false});continue;}
  const proposedPpr=round(base.current_projected_ppr*(1+adj.mean_pct),3),proposedProduction=fitProductionScore(p.p,proposedPpr);
  if(proposedProduction==null){rows.push({...base,status:'BLOCKED_MISSING_QUANTITATIVE_EVIDENCE',block_reason:'CANNOT_FIT_PRODUCTION_COMPONENT_FROM_CANONICAL_PEERS',proposed_projected_ppr:proposedPpr,proposed_components:null,proposed_score:null,proposed_true_value_rank:null,proposed_overall_rank:null,approval_required:false});continue;}
  const proposedComponents={...currentComponents,production:round(proposedProduction,3)},proposedScore=round(scoreFrom(proposedComponents),6);
  rows.push({...base,status:'NUMERIC_TV_PROPOSAL',proposed_projected_ppr:proposedPpr,proposed_components:proposedComponents,proposed_score:proposedScore,proposed_true_value_rank:null,proposed_overall_rank:null,approval_required:true});
}
const numeric=rows.filter(x=>x.status==='NUMERIC_TV_PROPOSAL');
if(numeric.length){const scoreBy=new Map(players.map(p=>[p.n,Number(p.s)]));for(const x of numeric)scoreBy.set(x.player,x.proposed_score);const order=[...players].sort((a,b)=>scoreBy.get(b.n)-scoreBy.get(a.n)||a.tr-b.tr),rankBy=new Map(order.map((p,i)=>[p.n,i+1]));for(const x of numeric)x.proposed_true_value_rank=rankBy.get(x.player);}
const counts={triggered:rows.length,numeric_proposals:numeric.length,review_no_change:rows.filter(x=>x.status==='REVIEW_NO_CHANGE').length,blocked_missing_evidence:rows.filter(x=>x.status==='BLOCKED_MISSING_QUANTITATIVE_EVIDENCE').length};
if(selfTest){if(counts.triggered!==2)throw new Error(`Self-test expected 2 triggers, got ${counts.triggered}`);if(counts.numeric_proposals!==1)throw new Error(`Self-test expected 1 numeric proposal, got ${counts.numeric_proposals}`);if(counts.blocked_missing_evidence!==1)throw new Error(`Self-test expected 1 blocked trigger, got ${counts.blocked_missing_evidence}`);console.log(JSON.stringify({result:'PASS',...counts},null,2));process.exit(0);}
const report={schema_version:'1.1.0',generated_at:new Date().toISOString(),authoritative:false,mutation_policy:'PROPOSAL_ONLY_NO_CANONICAL_WRITES',universe:{players:expected,shards},inputs:{live_review_present:Boolean(review),structured_context_present:Boolean(context),weekly_projection_present:Boolean(weekly),context_status:context?.status||null,weekly_projection_status:weekly?.status||null},rules:['Triggered players cannot be labeled HOLD when required structured/quantitative evidence is missing.','Season-long role/QB/injury evidence remains usable even when weekly availability is unresolved.','Market data is not consumed by this recalculation layer.','Numeric production changes require explicit quantitative adjustments; missing adjustment weights produce BLOCKED, never invented deltas.','Non-production components are never numerically invented from headline text.','Overall rank remains pending unless an approved strategy-overlay rule produces a target.'],rows,counts};
write('analysis/substantive-component-recalculation-current.json',report);
const md=['# Substantive Component Recalculation','',`Generated: ${report.generated_at}`,`Triggered: ${counts.triggered}`,`Numeric TV proposals: ${counts.numeric_proposals}`,`Reviewed no-change: ${counts.review_no_change}`,`Blocked missing quantitative evidence: ${counts.blocked_missing_evidence}`,'','| Player | Status | Current TV | Proposed TV | Current PPR | Proposed PPR | Implicated components |','|---|---|---:|---:|---:|---:|---|'];
for(const x of rows)md.push(`| ${x.player} | ${x.status} | ${x.current_true_value_rank} | ${x.proposed_true_value_rank??'PENDING'} | ${x.current_projected_ppr??''} | ${x.proposed_projected_ppr??'PENDING'} | ${x.implicated_components.join(', ')} |`);
fs.writeFileSync(path.join(root,'analysis/substantive-component-recalculation-current.md'),md.join('\n')+'\n');
console.log(JSON.stringify(counts,null,2));
