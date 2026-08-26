import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const step5=read('data/sources/comparison-decision-2026.json');
const cfg=read('data/sources/comparison-calibration-2026.json');
fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});

const finite=x=>Number.isFinite(Number(x));
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const round=(x,d=6)=>Number(Number(x).toFixed(d));
const weights=step5.head_to_head_weights;
const bands=step5.edge_bands;
const bandFor=gap=>{const a=Math.abs(gap);return (bands.find(b=>a>=Number(b.min_abs_gap)&&a<Number(b.max_abs_gap_exclusive))||bands.at(-1)).label};

const shards=[];
for(let i=0;i<13;i++){
  const p=`players${i}.json`;
  if(!fs.existsSync(path.join(root,p)))throw new Error(`missing runtime shard ${p}`);
  shards.push(...read(p));
}
const names=shards.map(p=>p.n);
const unique=new Set(names);
const blocked=[];
if(shards.length!==cfg.authoritative_player_count)blocked.push(`expected ${cfg.authoritative_player_count} players, found ${shards.length}`);
if(unique.size!==cfg.authoritative_player_count)blocked.push(`expected ${cfg.authoritative_player_count} unique players, found ${unique.size}`);

function riskAdapter(p){
  const a=Number(p.a),rl=Number(p.rl),su=Number(p.su);
  if(![a,rl,su].every(finite))throw new Error(`non-finite calibration risk inputs for ${p.n}`);
  return clamp(1-((a*.45+rl*.35+su*.20)/10));
}
function score(p){
  const c={
    expected_production:clamp(Number(p.pd)/10),
    ceiling:clamp(Number(p.ce)/10),
    role_volume:clamp(Number(p.r)/10),
    offensive_environment:clamp(Number(p.e)/10),
    risk_safety:clamp(1-riskAdapter(p))
  };
  for(const [k,v] of Object.entries(c))if(!finite(v))throw new Error(`non-finite ${k} for ${p.n}`);
  const s=Object.entries(c).reduce((sum,[k,v])=>sum+Number(weights[k])*v,0);
  if(!finite(s)||s<0||s>1)throw new Error(`comparison score outside [0,1] for ${p.n}`);
  return {score:s,components:c};
}

const scored=new Map();
for(const p of shards){
  try{scored.set(p.n,score(p));}catch(e){blocked.push(e.message)}
}
const counts={ALL:{},SAME_POSITION:{},CROSS_POSITION:{}};
for(const scope of Object.keys(counts))for(const b of bands)counts[scope][b.label]=0;
let pairCount=0,sameCount=0,crossCount=0,largeRankGapPairs=0,largeRankGapConflicts=0,clearEdges=0,overstatedClearEdges=0,priceMutationChanges=0;
const conflictExamples=[],overstatedExamples=[];
const largeGap=Number(cfg.diagnostic_limits.large_rank_gap_threshold);
for(let i=0;i<shards.length;i++)for(let j=i+1;j<shards.length;j++){
  const a=shards[i],b=shards[j],A=scored.get(a.n),B=scored.get(b.n);
  if(!A||!B)continue;
  pairCount++;
  const same=a.p===b.p; if(same)sameCount++;else crossCount++;
  const gap=A.score-B.score,band=bandFor(gap),winner=band==='TOSS_UP'?null:(gap>0?a:b),loser=band==='TOSS_UP'?null:(gap>0?b:a);
  counts.ALL[band]++;counts[same?'SAME_POSITION':'CROSS_POSITION'][band]++;
  if(band==='CLEAR_EDGE'){
    clearEdges++;
    const wc=winner===a?A.components:B.components,lc=winner===a?B.components:A.components;
    if(wc.expected_production<lc.expected_production && wc.ceiling<lc.ceiling){
      overstatedClearEdges++;
      if(overstatedExamples.length<20)overstatedExamples.push({winner:winner.n,loser:loser.n,gap:round(Math.abs(gap)),winner_production:round(wc.expected_production),loser_production:round(lc.expected_production),winner_ceiling:round(wc.ceiling),loser_ceiling:round(lc.ceiling)});
    }
  }
  const trA=Number(a.tr),trB=Number(b.tr);
  if(finite(trA)&&finite(trB)&&Math.abs(trA-trB)>=largeGap && band!=='TOSS_UP'){
    largeRankGapPairs++;
    const expectedBetter=trA<trB?a:b;
    if(winner.n!==expectedBetter.n && ['EDGE','CLEAR_EDGE'].includes(band)){
      largeRankGapConflicts++;
      if(conflictExamples.length<20)conflictExamples.push({winner:winner.n,winner_player_quality_rank:Number(winner.tr),loser:loser.n,loser_player_quality_rank:Number(loser.tr),verdict:band,gap:round(Math.abs(gap))});
    }
  }
  const ma={...a,ad:999,px:'FADE',s7:'AVOID',vl:'MUTATED',vo:{markets:[{line:999,over:-999,under:999}]}},mb={...b,ad:1,px:'BUY',s7:'TARGET',vl:'MUTATED',vo:{markets:[{line:1,over:999,under:-999}]}};
  const mA=score(ma),mB=score(mb),mGap=mA.score-mB.score,mBand=bandFor(mGap);
  if(Math.abs(mGap-gap)>1e-12||mBand!==band)priceMutationChanges++;
}

if(pairCount!==cfg.expected_pair_count)blocked.push(`expected ${cfg.expected_pair_count} unordered pairs, tested ${pairCount}`);
if(priceMutationChanges)blocked.push(`${priceMutationChanges} comparisons changed after price/sportsbook mutation`);
const share=(n,d)=>d? n/d : 0;
const allShares=Object.fromEntries(Object.entries(counts.ALL).map(([k,v])=>[k,round(share(v,pairCount))]));
const sameShares=Object.fromEntries(Object.entries(counts.SAME_POSITION).map(([k,v])=>[k,round(share(v,sameCount))]));
const crossShares=Object.fromEntries(Object.entries(counts.CROSS_POSITION).map(([k,v])=>[k,round(share(v,crossCount))]));
const lim=cfg.diagnostic_limits;
if(allShares.TOSS_UP<lim.toss_up_share_min||allShares.TOSS_UP>lim.toss_up_share_max)blocked.push(`TOSS_UP share ${allShares.TOSS_UP} outside [${lim.toss_up_share_min},${lim.toss_up_share_max}]`);
if(allShares.CLEAR_EDGE>lim.clear_edge_share_max)blocked.push(`CLEAR_EDGE share ${allShares.CLEAR_EDGE} exceeds ${lim.clear_edge_share_max}`);
if(sameShares.CLEAR_EDGE>lim.same_position_clear_edge_share_max)blocked.push(`same-position CLEAR_EDGE share ${sameShares.CLEAR_EDGE} exceeds ${lim.same_position_clear_edge_share_max}`);
const conflictRate=share(largeRankGapConflicts,largeRankGapPairs);
if(conflictRate>lim.large_rank_gap_conflict_rate_max)blocked.push(`large-rank-gap conflict rate ${round(conflictRate)} exceeds ${lim.large_rank_gap_conflict_rate_max}`);
const overstatedRate=share(overstatedClearEdges,clearEdges);
if(overstatedRate>lim.overstated_clear_edge_rate_max)blocked.push(`overstated CLEAR_EDGE rate ${round(overstatedRate)} exceeds ${lim.overstated_clear_edge_rate_max}`);

const report={generated_at:new Date().toISOString(),result:blocked.length?'BLOCKED':'PASS',mode:'SHADOW_ONLY',actionable:false,player_count:shards.length,unique_player_count:unique.size,unordered_pairs_tested:pairCount,same_position_pairs:sameCount,cross_position_pairs:crossCount,verdict_counts:counts,verdict_shares:{all:allShares,same_position:sameShares,cross_position:crossShares},large_rank_gap_pairs:largeRankGapPairs,large_rank_gap_conflicts:largeRankGapConflicts,large_rank_gap_conflict_rate:round(conflictRate),clear_edges:clearEdges,overstated_clear_edges:overstatedClearEdges,overstated_clear_edge_rate:round(overstatedRate),price_sportsbook_mutation_changes:priceMutationChanges,calibration_risk_adapter_used:true,calibration_risk_adapter_production_allowed:false,threshold_recommendation:blocked.length?'REVIEW_BEFORE_LOCK':'KEEP_STEP_5_BANDS',conflict_examples:conflictExamples,overstated_clear_edge_examples:overstatedExamples,blocked};
fs.writeFileSync(path.join(root,'guardrails/comparison-verdict-calibration-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);
