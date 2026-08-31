import fs from 'node:fs';

const config=JSON.parse(fs.readFileSync('guardrails/guardrails-config.json','utf8'));
const activeCount=Number(config.authoritative_player_count);
if(!Number.isInteger(activeCount)||activeCount<=0) throw new Error('Invalid authoritative_player_count');
const shardFiles=fs.readdirSync('.').filter(f=>/^players\d+\.json$/.test(f)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
const players=shardFiles.flatMap(f=>JSON.parse(fs.readFileSync(f,'utf8')));
if(players.length!==activeCount) throw new Error(`Shadow recalculation requires exactly ${activeCount} players; found ${players.length}`);
const names=players.map(p=>p.n);
if(new Set(names).size!==activeCount) throw new Error(`Shadow recalculation requires ${activeCount} unique player names`);

const histDoc=JSON.parse(fs.readFileSync('historicalStats2026.json','utf8'));
const hist=histDoc.players||{};
const aliasDoc=JSON.parse(fs.readFileSync('history-alias-reconciliation-audit.json','utf8'));
const activeToHistorical=Object.fromEntries((aliasDoc.aliases_in_historical_file||[]).map(x=>[x.active,x.historical]));
const historyKey=p=>hist[p.n]?p.n:(activeToHistorical[p.n]&&hist[activeToHistorical[p.n]]?activeToHistorical[p.n]:p.n);
const historyRowsFor=p=>hist[historyKey(p)]||[];
const num=v=>{if(v==null)return 0;const n=Number(String(v).replace(/,/g,'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
const get=(r,ks)=>{for(const k of ks)if(r?.[k]!=null)return num(r[k]);return 0};
const gp=r=>get(r,['Games','GP','G'])||17;
function ppr(row,pos){
  if(pos==='QB') return get(row,['Pass Yards','PassYds'])*.04+get(row,['Pass TD','PassTD'])*4-get(row,['INT'])*2+get(row,['Rush Yards','Rush Yds','RushYds'])*.1+get(row,['Rush TD','RushTD'])*6;
  return get(row,['Receptions','Rec','Rec.'])+get(row,['Receiving Yards','Rec Yds','RecYds','Rec. Yards'])*.1+get(row,['TD','Rec TD','RecTD','Rec. TD'])*6+get(row,['Rush Yards','Rush Yds','RushYds'])*.1+get(row,['Rush TD','RushTD'])*6;
}
function histBaseline(p){
  const rows=historyRowsFor(p).slice(-3); if(!rows.length)return null;
  const weights=rows.length===1?[1]:rows.length===2?[.35,.65]:[.2,.3,.5];
  let ppg=0,sw=0;
  rows.forEach((r,i)=>{const pts=ppr(r,p.p);if(pts>0){ppg+=(pts/Math.max(1,gp(r)))*weights[i];sw+=weights[i]}});
  return sw?ppg/sw*17:null;
}
function contextFactor(p){
  const role=1+((Number(p.r??8.5)-8.5)*.018);
  const env=1+((Number(p.e??8.5)-8.5)*.012);
  const rel=1+((Number(p.rl??8.5)-8.5)*.006);
  const sust=1+((Number(p.su??8.5)-8.5)*.006);
  let avail=1; const a=Number(p.a??8.5);
  if(a<8.5)avail-=Math.min(.08,(8.5-a)*.018);
  const st=String(p.st||'PASS').toUpperCase();
  if(st!=='PASS'&&!st.includes('ACTIVE')&&!st.includes('HEALTHY'))avail-=.015;
  return Math.max(.88,Math.min(1.12,role*env*rel*sust*avail));
}
const anchors={
  QB:[[170,6.0],[200,7.0],[230,7.7],[260,8.3],[290,8.8],[320,9.3],[380,10.0]],
  RB:[[130,6.0],[160,7.0],[190,7.7],[220,8.3],[250,8.8],[280,9.3],[340,10.0]],
  WR:[[135,6.0],[165,7.0],[195,7.7],[225,8.3],[255,8.8],[290,9.3],[350,10.0]],
  TE:[[100,6.0],[125,7.0],[150,7.7],[175,8.3],[205,8.8],[235,9.3],[290,10.0]]
};
function interp(pos,x){
  const a=anchors[pos]||anchors.WR;
  if(x<=a[0][0])return a[0][1];if(x>=a.at(-1)[0])return a.at(-1)[1];
  for(let i=0;i<a.length-1;i++){const [x0,y0]=a[i],[x1,y1]=a[i+1];if(x>=x0&&x<=x1)return Math.round((y0+(x-x0)*(y1-y0)/(x1-x0))*1000)/1000;}
  return 7;
}
const tvScore=(p,pd)=>Math.round((pd*.35+Number(p.ce)*.20+Number(p.r)*.15+Number(p.e)*.10+Number(p.a)*.10+Number(p.rl)*.05+Number(p.su)*.05)*1000)/1000;
const prodTier=(p,x)=>{
  const bands={QB:[[320,'Elite'],[290,'Very strong'],[260,'Strong'],[230,'Solid'],[200,'Moderate']],RB:[[280,'Elite'],[250,'Very strong'],[220,'Strong'],[190,'Solid'],[160,'Moderate']],WR:[[290,'Elite'],[255,'Very strong'],[225,'Strong'],[195,'Solid'],[165,'Moderate']],TE:[[235,'Elite'],[205,'Very strong'],[175,'Strong'],[150,'Solid'],[125,'Moderate']]};
  for(const [cut,label] of (bands[p.p]||[]))if(x>=cut)return label;return 'Concern';
};
const rows=[];
for(const p of players){
  const current=Number(p.mp);
  const prior=Number(p.projection_context?.prior_projected_ppr);
  const base=Number.isFinite(prior)?prior:current;
  const hKey=historyKey(p), historyRows=historyRowsFor(p), hb=histBaseline(p), years=historyRows.length;
  const histWeight=years>=3?.28:years===2?.20:years===1?.12:0;
  const cf=contextFactor(p), contextual=hb==null?base:hb*cf;
  let proposed=base*(1-histWeight)+contextual*histWeight;
  const clamp=base*.075;
  proposed=Math.max(base-clamp,Math.min(base+clamp,proposed));
  if(Number(p.a??8.5)<7.5)proposed*=.985;
  proposed=Math.round(proposed*4)/4;
  const baselinePD=interp(p.p,base), proposedPD=interp(p.p,proposed);
  const baselineS=tvScore(p,baselinePD), proposedS=tvScore(p,proposedPD);
  const oldTier=prodTier(p,base),newTier=prodTier(p,proposed),delta=Math.round((proposed-base)*100)/100;
  rows.push({name:p.n,pos:p.p,team:p.t,live_overall_rank:p.o,live_true_value_rank:p.tr,live_projection:current,shadow_base_projection:base,direct_history_seasons:years,history_key:hKey,history_alias_used:hKey!==p.n,history_status:years?'DIRECT_HISTORY_AVAILABLE':'NO_DIRECT_HISTORY_REQUIRES_ROOKIE_OR_COHORT_PRIOR',history_baseline_ppr:hb==null?null:Math.round(hb*10)/10,legacy_history_weight:histWeight,context_factor:Math.round(cf*1000)/1000,shadow_proposed_projection:proposed,shadow_projection_delta:delta,live_expected_production:p.pd,baseline_formula_expected_production:baselinePD,shadow_expected_production:proposedPD,live_true_value_score:p.s,baseline_formula_true_value_score:baselineS,shadow_true_value_score:proposedS,old_production_tier:oldTier,new_production_tier:newTier,material_legacy_history_change:Math.abs(delta)>=8||oldTier!==newTier});
}
const rankSort=scoreKey=>(a,b)=>b[scoreKey]-a[scoreKey]||a.live_overall_rank-b.live_overall_rank||a.name.localeCompare(b.name);
[...rows].sort(rankSort('baseline_formula_true_value_score')).forEach((r,i)=>r.baseline_formula_true_value_rank=i+1);
[...rows].sort(rankSort('shadow_true_value_score')).forEach((r,i)=>r.shadow_true_value_rank=i+1);
for(const r of rows){r.incremental_shadow_true_value_rank_move=r.baseline_formula_true_value_rank-r.shadow_true_value_rank;r.live_true_value_rank_gap_vs_baseline_formula=(r.live_true_value_rank??r.baseline_formula_true_value_rank)-r.baseline_formula_true_value_rank;r.shadow_overall_review=r.material_legacy_history_change&&(Math.abs(r.incremental_shadow_true_value_rank_move)>=3||Math.abs(r.shadow_projection_delta)>=12||r.old_production_tier!==r.new_production_tier);}
rows.sort((a,b)=>a.live_overall_rank-b.live_overall_rank);
const noHistory=rows.filter(r=>r.direct_history_seasons===0).map(r=>r.name);
const aliasesUsed=rows.filter(r=>r.history_alias_used).map(r=>({name:r.name,history_key:r.history_key}));
const material=rows.filter(r=>r.material_legacy_history_change).sort((a,b)=>Math.abs(b.shadow_projection_delta)-Math.abs(a.shadow_projection_delta));
const review=rows.filter(r=>r.shadow_overall_review).sort((a,b)=>a.live_overall_rank-b.live_overall_rank);
const suffix=String(activeCount);
fs.mkdirSync('guardrails',{recursive:true});
fs.writeFileSync(`guardrails/step3b-shadow-projection-context-${suffix}.json`,JSON.stringify({generated_at:new Date().toISOString(),step:`STEP_3B_2_${activeCount}_SHADOW_RECALCULATION`,shadow_only:true,live_player_files_modified:false,overall_rank_published:false,players_checked:activeCount,players_with_direct_history:activeCount-noHistory.length,players_without_direct_history:noHistory.length,no_direct_history_players:noHistory,history_aliases_used:aliasesUsed,method:`Read-only reproduction of the existing historical-context projection recalibration across the current ${activeCount}-player universe. Rank impact is isolated by comparing baseline-formula rank with shadow-formula rank; live rank differences are diagnostic only. This is a reconciliation baseline, not the final Bayesian model.`,changes:rows},null,2)+'\n');
fs.writeFileSync(`guardrails/step3b-shadow-projection-downstream-${suffix}.json`,JSON.stringify({generated_at:new Date().toISOString(),shadow_only:true,live_player_files_modified:false,players_checked:activeCount,material_changes:material.length,overall_rank_review_count:review.length,rank_comparison_basis:'baseline formula rank vs shadow formula rank only; existing live rank gap is diagnostic and cannot trigger review',true_value_formula:'0.35 Expected Production + 0.20 Ceiling + 0.15 Role + 0.10 Environment + 0.10 Availability + 0.05 Reliability + 0.05 Sustainability',changes:material},null,2)+'\n');
fs.writeFileSync(`guardrails/step3b-shadow-overall-review-queue-${suffix}.json`,JSON.stringify({generated_at:new Date().toISOString(),shadow_only:true,published:false,players_checked:activeCount,note:'Proposal queue only. Overall ranks remain unchanged until the user review gate and explicit approval. Rank flags measure only incremental shadow recalibration impact.',review_queue:review},null,2)+'\n');
console.log(`${activeCount} shadow recalculation PASS — direct history ${activeCount-noHistory.length}, no direct history ${noHistory.length}, aliases ${aliasesUsed.length}, material ${material.length}, Overall review ${review.length}`);
