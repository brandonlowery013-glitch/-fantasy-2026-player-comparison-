import fs from 'node:fs';

const DECISION='data/sources/step3b-final-decision-2026.json';
const decision=JSON.parse(fs.readFileSync(DECISION,'utf8'));
if(decision.version!=='STEP3B_FINAL_DECISION_2.1.0') throw new Error(`Expected Step3B 2.1.0; found ${decision.version}`);
if(decision.status!=='STEP3B_FOUNDATION_LOCKED_AWAITING_USER_APPROVAL_FOR_3C') throw new Error(`Step3B not locked: ${decision.status}`);
if(decision.sportsbook_or_adp_used!==false) throw new Error('Step3C refuses a market-contaminated Step3B contract');

const shardFiles=fs.readdirSync('.').filter(f=>/^players\d+\.json$/.test(f)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
const players=shardFiles.flatMap(f=>JSON.parse(fs.readFileSync(f,'utf8')));
if(players.length!==162) throw new Error(`Step3C requires exactly 162 players; found ${players.length}`);
if(new Set(players.map(p=>p.n)).size!==162) throw new Error('Step3C requires 162 unique names');

const histDoc=JSON.parse(fs.readFileSync('historicalStats2026.json','utf8'));
const hist=histDoc.players||{};
const aliasDoc=fs.existsSync('history-alias-reconciliation-audit.json')?JSON.parse(fs.readFileSync('history-alias-reconciliation-audit.json','utf8')):{};
const activeToHistorical=Object.fromEntries((aliasDoc.aliases_in_historical_file||[]).map(x=>[x.active,x.historical]));
const noHistorySet=new Set(decision.rookie_history_integrity.shadow_no_history_players||[]);
const contaminatedSet=new Set(decision.rookie_history_integrity.known_persistent_source_contamination_players||[]);

const num=v=>{if(v==null)return 0;const n=Number(String(v).replace(/,/g,'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
const get=(r,ks)=>{for(const k of ks)if(r?.[k]!=null)return num(r[k]);return 0};
const gp=r=>get(r,['Games','GP','G'])||17;
const med=a=>{const x=a.filter(Number.isFinite).sort((a,b)=>a-b);if(!x.length)return null;const m=(x.length-1)/2,l=Math.floor(m),h=Math.ceil(m);return l===h?x[l]:(x[l]+x[h])/2};

function ppr(row,pos){
  if(pos==='QB') return get(row,['Pass Yards','PassYds'])*.04+get(row,['Pass TD','PassTD'])*4-get(row,['INT'])*2+get(row,['Rush Yards','Rush Yds','RushYds'])*.1+get(row,['Rush TD','RushTD'])*6;
  return get(row,['Receptions','Rec','Rec.'])+get(row,['Receiving Yards','Rec Yds','RecYds','Rec. Yards'])*.1+get(row,['TD','Rec TD','RecTD','Rec. TD'])*6+get(row,['Rush Yards','Rush Yds','RushYds'])*.1+get(row,['Rush TD','RushTD'])*6;
}
function historyKey(p){
  if(noHistorySet.has(p.n)) return null;
  if(hist[p.n]) return p.n;
  const a=activeToHistorical[p.n];
  return a&&hist[a]?a:null;
}
function rowsFor(p){
  const k=historyKey(p); if(!k)return [];
  return (hist[k]||[]).slice().sort((a,b)=>Number(a.Season||a.Year||0)-Number(b.Season||b.Year||0)).slice(-3);
}
function seasonPpg(row,pos){const pts=ppr(row,pos);return pts>0?pts/Math.max(1,gp(row)):null;}
function recencyHistoryPpg(p){
  const rows=rowsFor(p); if(!rows.length)return null;
  const weights=rows.length===1?[1]:rows.length===2?[.35,.65]:[.2,.3,.5];
  let s=0,w=0;
  rows.forEach((r,i)=>{const x=seasonPpg(r,p.p);if(Number.isFinite(x)){s+=x*weights[i];w+=weights[i];}});
  return w?s/w:null;
}

function parseCsv(t){const rs=[];let row=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'&&t[i+1]==='"'){f+='"';i++;}else if(c==='"')q=false;else f+=c;}else{if(c==='"')q=true;else if(c===','){row.push(f);f='';}else if(c==='\n'){row.push(f.replace(/\r$/,''));rs.push(row);row=[];f='';}else f+=c;}}if(f.length||row.length){row.push(f);rs.push(row)}const h=rs.shift()||[];return rs.filter(r=>r.length>1).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])))}
async function qbTrailing2Correction(){
  const seasonRows=[];
  for(const season of [2023,2024,2025]){
    const u=`https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`;
    const r=await fetch(u,{headers:{'user-agent':'fantasy-2026-step3c-shadow'}});
    if(!r.ok)throw new Error(`QB residual source failed ${r.status}: ${u}`);
    const rows=parseCsv(await r.text()).filter(x=>String(x.season_type||'REG').toUpperCase()==='REG'&&String(x.position||'').toUpperCase()==='QB');
    const by=new Map();
    for(const x of rows){const id=x.player_id||x.gsis_id;if(!id)continue;const fp=num(x.passing_yards)*.04+num(x.passing_tds)*4-num(x.interceptions)*2+num(x.rushing_yards)*.1+num(x.rushing_tds)*6;const k=String(id);if(!by.has(k))by.set(k,[]);by.get(k).push(fp);}
    for(const [id,fp] of by)if(fp.length>=4)seasonRows.push({id,season,games:fp.length,ppg:fp.reduce((a,b)=>a+b,0)/fp.length});
  }
  const map=new Map(seasonRows.map(x=>[`${x.id}|${x.season}`,x]));
  const residuals=[];
  for(const cur of seasonRows.filter(x=>x.season===2024||x.season===2025)){
    if(cur.games<6)continue;const pr=map.get(`${cur.id}|${cur.season-1}`);if(!pr||pr.games<4)continue;residuals.push(cur.ppg-pr.ppg);
  }
  if(residuals.length<20) throw new Error(`TRAILING_2 residual pool unexpectedly small: ${residuals.length}`);
  return {median:med(residuals),n:residuals.length};
}

const qbCorrection=await qbTrailing2Correction();
const anchors={QB:[[170,6],[200,7],[230,7.7],[260,8.3],[290,8.8],[320,9.3],[380,10]],RB:[[130,6],[160,7],[190,7.7],[220,8.3],[250,8.8],[280,9.3],[340,10]],WR:[[135,6],[165,7],[195,7.7],[225,8.3],[255,8.8],[290,9.3],[350,10]],TE:[[100,6],[125,7],[150,7.7],[175,8.3],[205,8.8],[235,9.3],[290,10]]};
function interp(pos,x){const a=anchors[pos]||anchors.WR;if(x<=a[0][0])return a[0][1];if(x>=a.at(-1)[0])return a.at(-1)[1];for(let i=0;i<a.length-1;i++){const [x0,y0]=a[i],[x1,y1]=a[i+1];if(x>=x0&&x<=x1)return Math.round((y0+(x-x0)*(y1-y0)/(x1-x0))*1000)/1000;}return 7;}
const tv=(p,pd)=>Math.round((pd*.35+Number(p.ce)*.20+Number(p.r)*.15+Number(p.e)*.10+Number(p.a)*.10+Number(p.rl)*.05+Number(p.su)*.05)*1000)/1000;
const threshold=Number(decision.extreme_disagreement.threshold_ppg);
const rows=[];

for(const p of players){
  const live=Number(p.mp);
  if(!Number.isFinite(live))throw new Error(`Missing live projection for ${p.n}`);
  const hRows=rowsFor(p);
  const histPpg=recencyHistoryPpg(p);
  const latestPpg=hRows.length?seasonPpg(hRows.at(-1),p.p):null;
  let shadowPpg=live/17,method='NO_HISTORY_COHORT_PRIOR_RETAIN_LIVE_SHADOW_INPUT';
  if(!noHistorySet.has(p.n)&&Number.isFinite(histPpg)){
    if(p.p==='QB'&&Number.isFinite(latestPpg)){
      shadowPpg=latestPpg+qbCorrection.median;
      method='QB_TRAILING_2_VALIDATED_Q50';
    }else{
      shadowPpg=histPpg;
      method='LOCKED_MAX3_RECENCY_HISTORY_CENTER';
    }
  }
  const shadow=Math.round(shadowPpg*17*4)/4;
  const delta=Math.round((shadow-live)*100)/100;
  const ppgDelta=Math.round((shadowPpg-live/17)*1000)/1000;
  const shadowPd=interp(p.p,shadow);
  const shadowTv=tv(p,shadowPd);
  rows.push({name:p.n,pos:p.p,team:p.t,live_overall_rank:p.o,live_true_value_rank:p.tr,live_projection_ppr:live,live_projection_ppg:Math.round(live/17*1000)/1000,shadow_projection_ppr:shadow,shadow_projection_ppg:Math.round(shadowPpg*1000)/1000,projection_delta_ppr:delta,projection_delta_ppg:ppgDelta,shadow_method:method,history_key:historyKey(p),history_seasons_used:hRows.length,history_recency_ppg:Number.isFinite(histPpg)?Math.round(histPpg*1000)/1000:null,qb_trailing2_correction_ppg:p.p==='QB'?Math.round(qbCorrection.median*1000)/1000:null,rookie_no_history_sanitized:noHistorySet.has(p.n),known_persistent_contamination_excluded:contaminatedSet.has(p.n),extreme_disagreement_review:Math.abs(ppgDelta)>=threshold,live_expected_production:p.pd,shadow_expected_production:shadowPd,live_true_value_score:p.s,shadow_true_value_score:shadowTv});
}

const sorted=[...rows].sort((a,b)=>b.shadow_true_value_score-a.shadow_true_value_score||a.live_overall_rank-b.live_overall_rank||a.name.localeCompare(b.name));
sorted.forEach((r,i)=>r.shadow_true_value_rank=i+1);
for(const r of rows){r.shadow_true_value_rank=sorted.find(x=>x.name===r.name).shadow_true_value_rank;r.true_value_rank_move=(r.live_true_value_rank??r.shadow_true_value_rank)-r.shadow_true_value_rank;r.review_required=r.extreme_disagreement_review||Math.abs(r.projection_delta_ppg)>=2||Math.abs(r.true_value_rank_move)>=5;}
rows.sort((a,b)=>a.live_overall_rank-b.live_overall_rank);
const review=rows.filter(x=>x.review_required).sort((a,b)=>Math.abs(b.projection_delta_ppg)-Math.abs(a.projection_delta_ppg)||a.live_overall_rank-b.live_overall_rank);
const extreme=rows.filter(x=>x.extreme_disagreement_review);
const rookies=rows.filter(x=>x.rookie_no_history_sanitized);
const byPos=Object.fromEntries(['QB','RB','WR','TE'].map(pos=>{const a=rows.filter(x=>x.pos===pos);return[pos,{n:a.length,mean_delta_ppg:Math.round(a.reduce((s,x)=>s+x.projection_delta_ppg,0)/Math.max(1,a.length)*1000)/1000,review_count:a.filter(x=>x.review_required).length}]}));

fs.mkdirSync('guardrails',{recursive:true});
const report={generated_at:new Date().toISOString(),step:'STEP_3C_FULL_162_SHADOW_RECALCULATION',status:'COMPLETE_AWAITING_STEP_3D_USER_REVIEW',shadow_only:true,live_player_files_modified:false,live_projection_movement:0,live_rank_movement:0,players_checked:rows.length,unique_players:new Set(rows.map(x=>x.name)).size,step3b_contract_version:decision.version,market_inputs_used:false,sportsbook_used:false,adp_used:false,current_weeks_1_4_numeric_weight:0,same_role_cohort_preseason_numeric_weight:0,coach_numeric_weight:0,coordinator_numeric_weight:0,play_caller_numeric_weight:0,injury_severity_numeric_penalty:0,automatic_role_upshift_modifier:false,rb_blanket_q50_offset:false,qb_method:'TRAILING_2',qb_trailing2_residual_pool_n:qbCorrection.n,qb_trailing2_median_correction_ppg:Math.round(qbCorrection.median*1000)/1000,historical_max_seasons:3,historical_recency_weights:{one:[1],two:[.35,.65],three:[.2,.3,.5]},rookie_sanitized_count:rookies.length,rookie_sanitized_players:rookies.map(x=>x.name),persistent_contamination_excluded:rows.filter(x=>x.known_persistent_contamination_excluded).map(x=>x.name),extreme_disagreement_threshold_ppg:threshold,extreme_disagreement_count:extreme.length,review_queue_count:review.length,position_summary:byPos,changes:rows};
fs.writeFileSync('guardrails/step3c-shadow-recalculation-162.json',JSON.stringify(report,null,2)+'\n');
fs.writeFileSync('guardrails/step3c-user-review-queue-162.json',JSON.stringify({generated_at:new Date().toISOString(),step:'STEP_3D_INPUT_FROM_STEP_3C',published:false,automatic_apply:false,note:'User-review queue only. No live projection or rank writes are permitted in Step 3C.',review_queue:review},null,2)+'\n');
console.log(`Step 3C COMPLETE — players ${rows.length}; review ${review.length}; extreme ${extreme.length}; sanitized rookies ${rookies.length}; QB correction ${qbCorrection.median.toFixed(3)} PPG (n=${qbCorrection.n})`);
