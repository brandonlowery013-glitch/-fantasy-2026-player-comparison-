import fs from 'node:fs';
import path from 'node:path';
import {lineProbabilities} from './lib/distribution-tail-math.mjs';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const contract=read('data/sources/risk-profile-2026.json');
fs.mkdirSync(path.join(root,'data/probability/generated'),{recursive:true});
fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});

const finite=x=>Number.isFinite(Number(x));
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const round=(x,d=6)=>Number(Number(x).toFixed(d));
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;

function synthetic(){
  const projection={schema_version:'self-test',season:2026,week:1,status:'SELF_TEST',sportsbook_inputs_used:false,players:{
    'STABLE_WR':{position:'WR',status:'SHADOW_ONLY',projections:{targets:{status:'SHADOW_ONLY',mean:9,sd:3,performance_sd:2.7,projection_error_sd:1.3077,combined_sd:3,baseline:{source:'player_shrunk_prior'},adjustments:{applied:[]},missing_core_signals:[]},receiving_yards:{status:'SHADOW_ONLY',mean:78,sd:28,performance_sd:25,projection_error_sd:12.6095,combined_sd:28,baseline:{source:'player_shrunk_prior'},adjustments:{applied:[]},missing_core_signals:[]}}},
    'FRAGILE_RB':{position:'RB',status:'SHADOW_ONLY',projections:{rush_yards:{status:'SHADOW_ONLY',mean:54,sd:42,performance_sd:30,projection_error_sd:29.3939,combined_sd:42,baseline:{source:'role_cohort_prior'},adjustments:{applied:[{signal:'injury',mean_pct:-0.08,sd_pct:0.2}]},missing_core_signals:['opponent','team_environment']},targets:{status:'SHADOW_ONLY',mean:3,sd:2.7,performance_sd:2,projection_error_sd:1.8138,combined_sd:2.7,baseline:{source:'role_cohort_prior'},adjustments:{applied:[{signal:'injury',mean_pct:-0.05,sd_pct:0.15}]},missing_core_signals:['opponent','team_environment']}}},
    'ROOKIE_TE':{position:'TE',status:'SHADOW_ONLY',projections:{targets:{status:'SHADOW_ONLY',mean:5,sd:3.5,performance_sd:2.8,projection_error_sd:2.1,combined_sd:3.5,baseline:{source:'rookie_draft_tier_prior'},adjustments:{applied:[]},missing_core_signals:['opponent']},receiving_yards:{status:'SHADOW_ONLY',mean:42,sd:31,performance_sd:25,projection_error_sd:18.3303,combined_sd:31,baseline:{source:'rookie_draft_tier_prior'},adjustments:{applied:[]},missing_core_signals:['opponent']}}}
  }};
  const distributions={schema_version:'self-test',season:2026,week:1,mode:'SHADOW_ONLY',actionable:false,sportsbook_inputs_used:false,distributions:{
    'STABLE_WR':{position:'WR',distributions:{targets:{status:'SHADOW_ONLY',family:'negative_binomial',mean:9,sd:3,parameters:{mean:9,variance:10,r:81,p:.9},market_price_used_in_probability:false},receiving_yards:{status:'SHADOW_ONLY',family:'normal',mean:78,sd:28,parameters:{mu:78,sigma:28},market_price_used_in_probability:false}}},
    'FRAGILE_RB':{position:'RB',distributions:{rush_yards:{status:'SHADOW_ONLY',family:'normal',mean:54,sd:42,parameters:{mu:54,sigma:42},market_price_used_in_probability:false},targets:{status:'SHADOW_ONLY',family:'negative_binomial',mean:3,sd:2.7,parameters:{mean:3,variance:7.29,r:2.0979020979,p:.4117647059},market_price_used_in_probability:false}}},
    'ROOKIE_TE':{position:'TE',distributions:{targets:{status:'SHADOW_ONLY',family:'negative_binomial',mean:5,sd:3.5,parameters:{mean:5,variance:12.25,r:3.4482758621,p:.4081632653},market_price_used_in_probability:false},receiving_yards:{status:'SHADOW_ONLY',family:'student_t',mean:42,sd:31,parameters:{mu:42,df:8,scale:26.846788},market_price_used_in_probability:false}}}
  }};
  return {projection,distributions};
}

let projection,distInput;
if(process.argv.includes('--self-test'))({projection,distributions:distInput}=synthetic());
else {
  projection=read('data/probability/weekly-projection-inputs-2026.json');
  distInput=read('data/probability/generated/weekly-probability-distributions-2026.json');
}

const blocked=[];
if(contract.mode!=='SHADOW_ONLY'||contract.actionable!==false)blocked.push('Risk contract is not SHADOW_ONLY/non-actionable');
if(contract.sportsbook_inputs_allowed!==false||contract.feedback_into_projection_math_allowed!==false||contract.feedback_into_probability_math_allowed!==false||contract.feedback_into_ev_math_allowed!==false)blocked.push('Risk contract permits forbidden feedback or market inputs');
if(projection.sportsbook_inputs_used!==false)blocked.push('Projection inputs indicate sportsbook contamination');
if(distInput.sportsbook_inputs_used!==false)blocked.push('Probability distributions indicate sportsbook contamination');

const weights=Object.fromEntries(Object.entries(contract.components||{}).map(([k,v])=>[k,Number(v.weight)]));
const sourceScores=contract.components?.role_baseline_fragility?.source_scores||{};
const downsideFraction=Number(contract.components?.distribution_downside?.threshold_fraction_of_mean||.6);
const bands=contract.risk_bands||[];
const bandFor=score=>(bands.find(b=>score>=Number(b.min)&&score<Number(b.max_exclusive))||bands.at(-1)||{label:'UNKNOWN'}).label;

function contextFragility(p){
  const missing=new Set(),injury=[];
  for(const x of Object.values(p.projections||{})){
    for(const k of x.missing_core_signals||[])missing.add(k);
    for(const a of x.adjustments?.applied||[])if(a.signal==='injury')injury.push(a);
  }
  const missingScore=clamp(missing.size/4);
  const injuryFlag=injury.length?1:0;
  return {score:clamp(.6*missingScore+.4*injuryFlag),missing_core_signals:[...missing].sort(),current_injury_adjustment_present:Boolean(injury.length),injury_adjustments:injury};
}

const profiles={};let playerCount=0,statCount=0,exactTailChecks=0;
for(const [name,p] of Object.entries(projection.players||{})){
  const dPlayer=distInput.distributions?.[name];
  if(!dPlayer){profiles[name]={position:p.position||null,status:'REVIEW_REQUIRED',reason:'Missing probability distribution record'};continue;}
  const ctx=contextFragility(p),stats={};
  const aggregate=[];
  for(const [stat,proj] of Object.entries(p.projections||{})){
    const dist=dPlayer.distributions?.[stat];
    if(proj.status!=='SHADOW_ONLY'||dist?.status!=='SHADOW_ONLY')continue;
    const mean=Number(dist.mean),sd=Number(dist.sd);
    if(!finite(mean)||!finite(sd)||sd<=0){blocked.push(`${name} ${stat} invalid distribution mean/sd`);continue;}
    if(dist.market_price_used_in_probability===true)blocked.push(`${name} ${stat} market contamination`);
    let downside;
    try {
      const line=mean*downsideFraction,q=lineProbabilities(dist,line);
      downside=Number(q.under);exactTailChecks++;
      if(!finite(downside)||downside<0||downside>1)throw new Error('downside tail outside [0,1]');
    } catch(e){blocked.push(`${name} ${stat} exact downside tail failed: ${e.message}`);continue;}
    const cv=sd/Math.max(Math.abs(mean),1);
    const relativeUncertainty=clamp(cv/1.25);
    const combined=Number(proj.combined_sd??proj.sd),pe=Number(proj.projection_error_sd||0);
    const projectionErrorShare=finite(combined)&&combined>0&&finite(pe)?clamp((pe*pe)/(combined*combined)):0;
    const source=proj.baseline?.source||'position_prior';
    const roleFragility=finite(sourceScores[source])?Number(sourceScores[source]):1;
    const components={distribution_downside:downside,relative_uncertainty:relativeUncertainty,projection_error_share:projectionErrorShare,role_baseline_fragility:roleFragility,context_fragility:ctx.score};
    const score=clamp(Object.entries(components).reduce((s,[k,v])=>s+Number(weights[k]||0)*v,0));
    stats[stat]={status:'SHADOW_ONLY',actionable:false,score:round(score),risk_band:bandFor(score),components:Object.fromEntries(Object.entries(components).map(([k,v])=>[k,round(v)])),diagnostics:{downside_threshold:round(mean*downsideFraction),distribution_mean:round(mean),distribution_sd:round(sd),coefficient_of_variation:round(cv),projection_error_sd:finite(pe)?round(pe):null,combined_sd:finite(combined)?round(combined):null,baseline_source:source},sportsbook_inputs_used:false,projection_feedback_applied:false,probability_feedback_applied:false,ev_feedback_applied:false};
    aggregate.push(score);statCount++;
  }
  if(!aggregate.length){profiles[name]={position:p.position||null,status:'REVIEW_REQUIRED',reason:'No shared SHADOW_ONLY projection/distribution stats',context_fragility:ctx};continue;}
  const overall=avg(aggregate);
  profiles[name]={position:p.position||dPlayer.position||null,status:'SHADOW_ONLY',actionable:false,risk_score:round(overall),risk_band:bandFor(overall),stat_profiles:stats,context_fragility:{...ctx,score:round(ctx.score)},sportsbook_inputs_used:false,projection_feedback_applied:false,probability_feedback_applied:false,ev_feedback_applied:false};playerCount++;
}

for(const [name,p] of Object.entries(profiles)){
  if(p.status!=='SHADOW_ONLY')continue;
  if(!finite(p.risk_score)||p.risk_score<0||p.risk_score>1)blocked.push(`${name} invalid player risk score`);
  if(p.sportsbook_inputs_used!==false||p.projection_feedback_applied!==false||p.probability_feedback_applied!==false||p.ev_feedback_applied!==false)blocked.push(`${name} forbidden feedback/market flag`);
  for(const [stat,x] of Object.entries(p.stat_profiles||{}))if(!finite(x.score)||x.score<0||x.score>1)blocked.push(`${name} ${stat} invalid stat risk score`);
}
if(process.argv.includes('--self-test')){
  if(playerCount!==3)blocked.push(`self-test expected 3 scored players, got ${playerCount}`);
  if(statCount<6)blocked.push(`self-test expected at least 6 scored stats, got ${statCount}`);
  if(exactTailChecks!==statCount)blocked.push('self-test exact-tail count does not equal scored stat count');
  const stable=profiles.STABLE_WR?.risk_score,fragile=profiles.FRAGILE_RB?.risk_score;
  if(!finite(stable)||!finite(fragile)||Number(fragile)<=Number(stable))blocked.push('self-test failed to rank fragile profile above stable profile');
}

const generatedAt=new Date().toISOString();
const output={schema_version:'1.0.0',season:2026,week:projection.week,generated_at:generatedAt,status:projection.status==='SELF_TEST'?'SELF_TEST':'SHADOW_ONLY',mode:'SHADOW_ONLY',actionable:false,contract:'risk-profile-2026.json',sportsbook_inputs_used:false,projection_feedback_applied:false,probability_feedback_applied:false,ev_feedback_applied:false,profiles};
const report={generated_at:generatedAt,result:blocked.length?'BLOCKED':'PASS',mode:'SHADOW_ONLY',actionable:false,input_status:projection.status,players_scored:playerCount,stats_scored:statCount,exact_downside_tail_checks:exactTailChecks,sportsbook_inputs_used:false,projection_feedback_applied:false,probability_feedback_applied:false,ev_feedback_applied:false,blocked,notes:['Step 4 is a descriptive downside/fragility layer downstream of the locked Step 3B exact-tail math.','Risk does not alter projection means, uncertainty, football probabilities, or EV.','Current injury/role context is exposed as fragility only; upstream adjustments are not applied a second time.','Missing or non-current core context increases fragility rather than being treated as zero risk.']};
fs.writeFileSync(path.join(root,'data/probability/generated/weekly-risk-profiles-2026.json'),JSON.stringify(output,null,2)+'\n');
fs.writeFileSync(path.join(root,'guardrails/weekly-risk-profile-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);
