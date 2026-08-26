import fs from 'node:fs';
import path from 'node:path';
import {compoundReceptionPmf,lineProbabilities} from './lib/distribution-tail-math.mjs';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const calibration=read('data/probability/generated/distribution-family-calibration-2021-2025.json');
const catchPriors=read('data/probability/generated/catch-rate-priors-2021-2025.json');
const input=read('data/probability/weekly-projection-inputs-2026.json');
const tailContract=read('data/sources/exact-tail-math-2026.json');
const outDir=path.join(root,'data/probability/generated');
fs.mkdirSync(outDir,{recursive:true});
fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});

const statMap={passing_attempts:'pass_attempts',passing_yards:'pass_yards',passing_tds:'pass_tds',rushing_attempts:'rush_attempts',rushing_yards:'rush_yards',rushing_tds:'rush_tds',targets:'targets',receptions:'receptions',receiving_yards:'receiving_yards',receiving_tds:'receiving_tds'};
const finite=x=>Number.isFinite(Number(x));
const normalize=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const playerCatch=new Map((catchPriors.player_priors||[]).map(p=>[`${p.position}|${p.player_key||normalize(p.player)}`,p]));

function baseSpec(position,stat,projection){
  const canonical=statMap[stat]||stat,selected=calibration.selected_families?.[position]?.[canonical];
  if(!selected)return {status:'INSUFFICIENT_DATA',reason:`No calibrated family for ${position} ${canonical}`};
  const mean=Number(projection.mean),sd=Number(projection.sd);
  if(!finite(mean)||!finite(sd)||sd<=0)return {status:'INSUFFICIENT_DATA',reason:'Weekly football projection requires finite mean and positive sd'};
  const family=selected.family;
  const spec={status:'SHADOW_ONLY',actionable:false,position,stat:canonical,family,mean,sd,market_price_used_in_probability:false,source:'2021-2025 football-only distribution-family calibration',tail_math:'EXACT_SELECTED_FAMILY_CDF_PMF'};
  if(family==='normal')spec.parameters={mu:mean,sigma:sd};
  else if(family==='student_t'){const df=Number(selected.df||8);spec.parameters={mu:mean,df,scale:sd*Math.sqrt((df-2)/df)};}
  else if(family==='lognormal_shifted'){
    const shift=Number.isFinite(Number(projection.shift))?Number(projection.shift):0;
    if(mean<=shift)return {status:'INSUFFICIENT_DATA',reason:'Shifted-lognormal mean must exceed shift'};
    const mx=mean-shift,v=sd*sd,sig2=Math.log(1+v/(mx*mx));spec.parameters={shift,log_mu:Math.log(mx)-sig2/2,log_sigma:Math.sqrt(sig2)};
  } else if(family==='poisson')spec.parameters={lambda:Math.max(1e-6,mean)};
  else if(family==='negative_binomial'){
    const variance=Math.max(sd*sd,mean+1e-6),r=mean*mean/Math.max(1e-6,variance-mean),p=r/(r+Math.max(1e-6,mean));spec.parameters={mean,variance,r,p};
  } else if(family==='zero_inflated_negative_binomial')return {status:'REVIEW_REQUIRED',reason:'Zero-inflation parameter requires a current football-side zero-rate estimate before deployment',family};
  else if(family==='beta_binomial'||family==='binomial_conditional_on_targets')return {status:'REVIEW_REQUIRED',reason:'Conditional reception family must be marginalized over a forecast target distribution',family};
  else return {status:'INSUFFICIENT_DATA',reason:`Unsupported calibrated family ${family}`};
  return spec;
}

function catchPriorFor(name,p,position){
  const priorName=p.projections?.receptions?.baseline?.prior_player||p.projections?.targets?.baseline?.prior_player||name;
  const player=playerCatch.get(`${position}|${normalize(priorName)}`);
  if(player&&finite(player.shrunk_catch_rate)&&finite(player.rho))return {catch_rate:Number(player.shrunk_catch_rate),rho:Number(player.rho),source:'player_shrunk_catch_rate',prior_player:player.player,games:Number(player.games||0)};
  const pos=catchPriors.position_priors?.[position];
  if(pos&&finite(pos.catch_rate)&&finite(pos.rho))return {catch_rate:Number(pos.catch_rate),rho:Number(pos.rho),source:'position_catch_rate_prior',prior_player:null,games:Number(pos.games||0)};
  return null;
}

function receptionSpec(name,p,position,targetSpec){
  const projection=p.projections?.receptions,targetProjection=p.projections?.targets,selected=calibration.selected_families?.[position]?.receptions;
  if(!projection||!selected)return {status:'INSUFFICIENT_DATA',reason:'Missing reception projection or calibrated reception family'};
  if(!targetProjection||targetSpec?.status!=='SHADOW_ONLY')return {status:'REVIEW_REQUIRED',reason:'Pregame target distribution is required before receptions can be marginalized',family:selected.family};
  if(!['beta_binomial','binomial_conditional_on_targets'].includes(selected.family))return baseSpec(position,'receptions',projection);
  const prior=catchPriorFor(name,p,position);if(!prior)return {status:'REVIEW_REQUIRED',reason:'No historical player or position catch-rate prior available',family:selected.family};
  if(!['poisson','negative_binomial'].includes(targetSpec.family))return {status:'REVIEW_REQUIRED',reason:`Exact compound reception PMF requires a discrete target distribution; got ${targetSpec.family}`,family:selected.family};
  const cp=Math.max(1e-5,Math.min(1-1e-5,prior.catch_rate)),rho=selected.family==='beta_binomial'?Math.max(.001,Math.min(.5,prior.rho)):0;
  const compound=compoundReceptionPmf(targetSpec,{catch_rate:cp,rho,conditional_family:selected.family,tailTolerance:Number(tailContract.compound_reception_contract.pmf_truncation_tail_tolerance),maxSupport:Number(tailContract.compound_reception_contract.maximum_target_support)});
  const standaloneMean=Number(projection.mean),meanGapPct=finite(standaloneMean)&&standaloneMean>0?(compound.mean-standaloneMean)/standaloneMean:null;
  return {status:'SHADOW_ONLY',actionable:false,position,stat:'receptions',family:'compound_receptions',conditional_family:selected.family,mean:compound.mean,sd:compound.sd,market_price_used_in_probability:false,source:'pregame target distribution + 2021-2025 football-only catch-rate prior',tail_math:'EXACT_COMPOUND_TARGET_CATCH_PMF',parameters:{catch_rate:cp,rho,target_distribution:targetSpec,pmf:compound.pmf,support_max:compound.support_max,target_truncated_tail:compound.target_truncated_tail,normalized_mass:compound.normalized_mass,marginal_mean:compound.mean,marginal_variance:compound.variance,marginal_sd:compound.sd},catch_rate_prior:prior,standalone_reception_projection:{mean:finite(standaloneMean)?standaloneMean:null,sd:finite(projection.sd)?Number(projection.sd):null,mean_gap_pct:meanGapPct},note:'Exact reception PMF marginalizes the pregame target distribution over the calibrated conditional catch process; observed same-game targets are not used.'};
}

function syntheticInput(){
  const players={};for(const [pos,stats] of Object.entries(calibration.selected_families||{})){const projections={};for(const stat of Object.keys(stats))projections[stat]={mean:stat.includes('td')?1.2:stat.includes('attempt')||stat==='targets'?8:stat==='receptions'?5:55,sd:stat.includes('td')?1.0:stat.includes('attempt')||stat==='targets'?4:stat==='receptions'?2.5:35,baseline:{prior_player:null}};players[`SELF_TEST_${pos}`]={position:pos,projections};}return {schema_version:'self-test',season:2026,status:'SELF_TEST',week:1,sportsbook_inputs_used:false,players};
}

const src=process.argv.includes('--self-test')?syntheticInput():input;
const distributions={},blocked=[];let built=0,review=0,insufficient=0,receptionBuilt=0,tailChecks=0;
if(src.sportsbook_inputs_used!==false)blocked.push('sportsbook_inputs_used must be false');
for(const [name,p] of Object.entries(src.players||{})){
  const position=String(p.position||'').toUpperCase(),rec={position,distributions:{}},targetProjection=p.projections?.targets,targetSpec=targetProjection?baseSpec(position,'targets',targetProjection):null;
  if(targetProjection)rec.distributions.targets=targetSpec;
  for(const [stat,projection] of Object.entries(p.projections||{})){if(stat==='targets')continue;rec.distributions[stat]=stat==='receptions'?receptionSpec(name,p,position,targetSpec):baseSpec(position,stat,projection);}
  for(const [stat,spec] of Object.entries(rec.distributions)){
    if(spec.status==='SHADOW_ONLY'){
      built++;if(stat==='receptions')receptionBuilt++;
      const testLine=['poisson','negative_binomial','compound_receptions'].includes(spec.family)?Math.max(0,Math.floor(spec.mean)+.5):spec.mean;
      try{const q=lineProbabilities(spec,testLine),sum=q.over+q.under+q.push;tailChecks++;if(![q.over,q.under,q.push].every(x=>finite(x)&&x>=0&&x<=1)||Math.abs(sum-1)>1e-8)blocked.push(`${name} ${stat} exact tail probability invariant failed`);}catch(e){blocked.push(`${name} ${stat} exact tail math failed: ${e.message}`);}
    } else if(spec.status==='REVIEW_REQUIRED')review++;else insufficient++;
    if(spec.market_price_used_in_probability===true)blocked.push(`${name} ${stat} market contamination`);
    if(spec.status==='SHADOW_ONLY'&&(!finite(spec.mean)||!finite(spec.sd)||spec.sd<=0))blocked.push(`${name} ${stat} invalid distribution parameters`);
    if(stat==='receptions'&&spec.status==='SHADOW_ONLY'){
      if(spec.family!=='compound_receptions'||!Array.isArray(spec.parameters?.pmf))blocked.push(`${name} receptions missing exact compound PMF`);
      const mass=(spec.parameters?.pmf||[]).reduce((a,b)=>a+b,0);if(Math.abs(mass-1)>1e-8)blocked.push(`${name} receptions PMF mass ${mass}`);
      if(spec.parameters?.target_distribution?.status!=='SHADOW_ONLY')blocked.push(`${name} receptions missing valid target distribution`);
    }
  }
  distributions[name]=rec;
}
if(process.argv.includes('--self-test')){if(built<15)blocked.push(`self-test built too few deployable distributions: ${built}`);if(receptionBuilt<3)blocked.push(`self-test built too few reception distributions: ${receptionBuilt}`);if(tailChecks<15)blocked.push(`self-test performed too few exact tail checks: ${tailChecks}`);}

const generatedAt=new Date().toISOString();
const output={schema_version:'1.2.0',season:2026,week:src.week,generated_at:generatedAt,mode:'SHADOW_ONLY',actionable:false,input_status:src.status,sportsbook_inputs_used:false,calibration_source:'distribution-family-calibration-2021-2025.json',catch_rate_source:'catch-rate-priors-2021-2025.json',tail_math_contract:'exact-tail-math-2026.json',distributions};
const report={generated_at:generatedAt,result:blocked.length?'BLOCKED':'PASS',mode:'SHADOW_ONLY',actionable:false,input_status:src.status,built_distributions:built,reception_distributions:receptionBuilt,exact_tail_checks:tailChecks,review_required:review,insufficient_data:insufficient,sportsbook_inputs_used:false,blocked,notes:['Weekly probabilities now use the selected family CDF/PMF rather than a universal Normal tail approximation.','Discrete integer lines preserve explicit push probability; half-point lines have zero push.','RB/WR/TE receptions use an exact compound PMF over the pregame target distribution and conditional catch process.','Same-game observed targets and sportsbook prices are excluded from football probability construction.','This remains SHADOW_ONLY until live weekly projections/markets and betting validation gates are satisfied.']};
fs.writeFileSync(path.join(outDir,'weekly-probability-distributions-2026.json'),JSON.stringify(output,null,2)+'\n');fs.writeFileSync(path.join(root,'guardrails/weekly-probability-engine-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(blocked.length)process.exit(1);
