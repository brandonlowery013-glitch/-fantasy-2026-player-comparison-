import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const calibration=read('data/probability/generated/distribution-family-calibration-2021-2025.json');
const catchPriors=read('data/probability/generated/catch-rate-priors-2021-2025.json');
const input=read('data/probability/weekly-projection-inputs-2026.json');
const outDir=path.join(root,'data/probability/generated');
fs.mkdirSync(outDir,{recursive:true});
fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});

const statMap={
  passing_attempts:'pass_attempts',passing_yards:'pass_yards',passing_tds:'pass_tds',
  rushing_attempts:'rush_attempts',rushing_yards:'rush_yards',rushing_tds:'rush_tds',
  targets:'targets',receptions:'receptions',receiving_yards:'receiving_yards',receiving_tds:'receiving_tds'
};
const finite=x=>Number.isFinite(Number(x));
const normalize=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const playerCatch=new Map((catchPriors.player_priors||[]).map(p=>[`${p.position}|${p.player_key||normalize(p.player)}`,p]));

function baseSpec(position,stat,projection){
  const canonical=statMap[stat]||stat;
  const selected=calibration.selected_families?.[position]?.[canonical];
  if(!selected)return {status:'INSUFFICIENT_DATA',reason:`No calibrated family for ${position} ${canonical}`};
  const mean=Number(projection.mean),sd=Number(projection.sd);
  if(!finite(mean)||!finite(sd)||sd<=0)return {status:'INSUFFICIENT_DATA',reason:'Weekly football projection requires finite mean and positive sd'};
  const family=selected.family;
  const spec={status:'SHADOW_ONLY',actionable:false,position,stat:canonical,family,mean,sd,market_price_used_in_probability:false,source:'2021-2025 football-only distribution-family calibration'};
  if(family==='normal')spec.parameters={mu:mean,sigma:sd};
  else if(family==='student_t'){
    const df=Number(selected.df||8);spec.parameters={mu:mean,df,scale:sd*Math.sqrt((df-2)/df)};
  } else if(family==='lognormal_shifted'){
    const shift=Number.isFinite(Number(projection.shift))?Number(projection.shift):0;
    if(mean<=shift)return {status:'INSUFFICIENT_DATA',reason:'Shifted-lognormal mean must exceed shift'};
    const mx=mean-shift,v=sd*sd,sig2=Math.log(1+v/(mx*mx));
    spec.parameters={shift,log_mu:Math.log(mx)-sig2/2,log_sigma:Math.sqrt(sig2)};
  } else if(family==='poisson')spec.parameters={lambda:Math.max(1e-6,mean)};
  else if(family==='negative_binomial'){
    const variance=Math.max(sd*sd,mean+1e-6),r=mean*mean/Math.max(1e-6,variance-mean),p=r/(r+Math.max(1e-6,mean));
    spec.parameters={mean,variance,r,p};
  } else if(family==='zero_inflated_negative_binomial'){
    return {status:'REVIEW_REQUIRED',reason:'Zero-inflation parameter requires a current football-side zero-rate estimate before deployment',family};
  } else if(family==='beta_binomial'||family==='binomial_conditional_on_targets'){
    return {status:'REVIEW_REQUIRED',reason:'Conditional reception family must be marginalized over a forecast target distribution',family};
  } else return {status:'INSUFFICIENT_DATA',reason:`Unsupported calibrated family ${family}`};
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
  const projection=p.projections?.receptions;
  const targetProjection=p.projections?.targets;
  const selected=calibration.selected_families?.[position]?.receptions;
  if(!projection||!selected)return {status:'INSUFFICIENT_DATA',reason:'Missing reception projection or calibrated reception family'};
  if(!targetProjection||targetSpec?.status!=='SHADOW_ONLY')return {status:'REVIEW_REQUIRED',reason:'Pregame target distribution is required before receptions can be marginalized',family:selected.family};
  if(!['beta_binomial','binomial_conditional_on_targets'].includes(selected.family))return baseSpec(position,'receptions',projection);
  const prior=catchPriorFor(name,p,position);
  if(!prior)return {status:'REVIEW_REQUIRED',reason:'No historical player or position catch-rate prior available',family:selected.family};
  const m=Number(targetProjection.mean),v=Math.max(Number(targetProjection.sd)**2,1e-6),cp=Math.max(1e-5,Math.min(1-1e-5,prior.catch_rate));
  const rho=selected.family==='beta_binomial'?Math.max(.001,Math.min(.5,prior.rho)):0;
  const enn1=Math.max(0,v+m*m-m);
  const conditionalVar=cp*(1-cp)*(m+rho*enn1);
  const marginalVar=Math.max(1e-6,conditionalVar+cp*cp*v);
  const marginalMean=Math.max(0,m*cp),marginalSd=Math.sqrt(marginalVar);
  const standaloneMean=Number(projection.mean),meanGapPct=finite(standaloneMean)&&standaloneMean>0?(marginalMean-standaloneMean)/standaloneMean:null;
  return {
    status:'SHADOW_ONLY',actionable:false,position,stat:'receptions',family:selected.family==='beta_binomial'?'beta_binomial_marginalized_over_targets':'binomial_marginalized_over_targets',
    conditional_family:selected.family,mean:marginalMean,sd:marginalSd,market_price_used_in_probability:false,
    source:'pregame target distribution + 2021-2025 football-only catch-rate prior',
    parameters:{catch_rate:cp,rho,target_distribution:targetSpec,marginal_mean:marginalMean,marginal_variance:marginalVar,marginal_sd:marginalSd},
    catch_rate_prior:prior,
    standalone_reception_projection:{mean:finite(standaloneMean)?standaloneMean:null,sd:finite(projection.sd)?Number(projection.sd):null,mean_gap_pct:meanGapPct},
    note:'Reception distribution is marginalized over forecast targets; observed same-game targets are not used.'
  };
}

function syntheticInput(){
  const players={};
  for(const [pos,stats] of Object.entries(calibration.selected_families||{})){
    const projections={};
    for(const stat of Object.keys(stats))projections[stat]={mean:stat.includes('td')?1.2:stat.includes('attempt')||stat==='targets'?8:stat==='receptions'?5:55,sd:stat.includes('td')?1.0:stat.includes('attempt')||stat==='targets'?4:stat==='receptions'?2.5:35,baseline:{prior_player:null}};
    players[`SELF_TEST_${pos}`]={position:pos,projections};
  }
  return {schema_version:'self-test',season:2026,status:'SELF_TEST',week:1,sportsbook_inputs_used:false,players};
}

const src=process.argv.includes('--self-test')?syntheticInput():input;
const distributions={},blocked=[];let built=0,review=0,insufficient=0,receptionBuilt=0;
if(src.sportsbook_inputs_used!==false)blocked.push('sportsbook_inputs_used must be false');
for(const [name,p] of Object.entries(src.players||{})){
  const position=String(p.position||'').toUpperCase();
  const rec={position,distributions:{}};
  const targetProjection=p.projections?.targets;
  const targetSpec=targetProjection?baseSpec(position,'targets',targetProjection):null;
  if(targetProjection)rec.distributions.targets=targetSpec;
  for(const [stat,projection] of Object.entries(p.projections||{})){
    if(stat==='targets')continue;
    const spec=stat==='receptions'?receptionSpec(name,p,position,targetSpec):baseSpec(position,stat,projection);
    rec.distributions[stat]=spec;
  }
  for(const [stat,spec] of Object.entries(rec.distributions)){
    if(spec.status==='SHADOW_ONLY'){built++;if(stat==='receptions')receptionBuilt++;}
    else if(spec.status==='REVIEW_REQUIRED')review++;else insufficient++;
    if(spec.market_price_used_in_probability===true)blocked.push(`${name} ${stat} market contamination`);
    if(spec.status==='SHADOW_ONLY'&&(!finite(spec.mean)||!finite(spec.sd)||spec.sd<=0))blocked.push(`${name} ${stat} invalid distribution parameters`);
    if(stat==='receptions'&&spec.status==='SHADOW_ONLY'&&spec.parameters?.target_distribution?.status!=='SHADOW_ONLY')blocked.push(`${name} receptions missing valid target distribution`);
  }
  distributions[name]=rec;
}
if(process.argv.includes('--self-test')){
  if(built<15)blocked.push(`self-test built too few deployable distributions: ${built}`);
  if(receptionBuilt<3)blocked.push(`self-test built too few reception distributions: ${receptionBuilt}`);
}

const generatedAt=new Date().toISOString();
const output={schema_version:'1.1.0',season:2026,week:src.week,generated_at:generatedAt,mode:'SHADOW_ONLY',actionable:false,input_status:src.status,sportsbook_inputs_used:false,calibration_source:'distribution-family-calibration-2021-2025.json',catch_rate_source:'catch-rate-priors-2021-2025.json',distributions};
const report={generated_at:generatedAt,result:blocked.length?'BLOCKED':'PASS',mode:'SHADOW_ONLY',actionable:false,input_status:src.status,built_distributions:built,reception_distributions:receptionBuilt,review_required:review,insufficient_data:insufficient,sportsbook_inputs_used:false,blocked,notes:['This engine constructs football-only weekly distribution objects and does not ingest sportsbook thresholds or prices.','Season-long futures are intentionally not routed through this weekly distribution layer.','RB/WR/TE receptions are marginalized over forecast target distributions using historical catch-rate priors; same-game targets are not used.','Catch-rate uncertainty is beta-binomial when that family was selected in tuning; low-history players shrink toward position priors.','Current repository input is a contract placeholder until a 2026 weekly projection snapshot is populated.']};
fs.writeFileSync(path.join(outDir,'weekly-probability-distributions-2026.json'),JSON.stringify(output,null,2)+'\n');
fs.writeFileSync(path.join(root,'guardrails/weekly-probability-engine-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);
