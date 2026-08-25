import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const calibration=read('data/probability/generated/distribution-family-calibration-2021-2025.json');
const input=read('data/probability/weekly-projection-inputs-2026.json');
const outDir=path.join(root,'data/probability/generated');
fs.mkdirSync(outDir,{recursive:true});
fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});

const statMap={
  passing_attempts:'pass_attempts',passing_yards:'pass_yards',passing_tds:'pass_tds',
  rushing_attempts:'rush_attempts',rushing_yards:'rush_yards',rushing_tds:'rush_tds',
  targets:'targets',receptions:'receptions',receiving_yards:'receiving_yards',receiving_tds:'receiving_tds'
};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const finite=x=>Number.isFinite(Number(x));

function buildSpec(position,stat,projection){
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
    return {status:'REVIEW_REQUIRED',reason:'Receptions family is conditional on a pregame target distribution; target-distribution forecast must be supplied before deployment',family};
  } else return {status:'INSUFFICIENT_DATA',reason:`Unsupported calibrated family ${family}`};
  return spec;
}

function syntheticInput(){
  const players={};let i=0;
  for(const [pos,stats] of Object.entries(calibration.selected_families||{})){
    for(const stat of Object.keys(stats)){
      const name=`SELF_TEST_${pos}_${stat}_${++i}`;
      players[name]={position:pos,projections:{[stat]:{mean:stat.includes('td')?1.2:stat.includes('attempt')||stat==='targets'||stat==='receptions'?8:55,sd:stat.includes('td')?1.0:stat.includes('attempt')||stat==='targets'||stat==='receptions'?4:35}}};
    }
  }
  return {schema_version:'self-test',season:2026,status:'SELF_TEST',week:1,sportsbook_inputs_used:false,players};
}

const src=process.argv.includes('--self-test')?syntheticInput():input;
const distributions={},blocked=[];let built=0,review=0,insufficient=0;
if(src.sportsbook_inputs_used!==false)blocked.push('sportsbook_inputs_used must be false');
for(const [name,p] of Object.entries(src.players||{})){
  const position=String(p.position||'').toUpperCase();
  const rec={position,distributions:{}};
  for(const [stat,projection] of Object.entries(p.projections||{})){
    const spec=buildSpec(position,stat,projection);rec.distributions[stat]=spec;
    if(spec.status==='SHADOW_ONLY')built++;else if(spec.status==='REVIEW_REQUIRED')review++;else insufficient++;
    if(spec.market_price_used_in_probability===true)blocked.push(`${name} ${stat} market contamination`);
    if(spec.status==='SHADOW_ONLY'&&(!finite(spec.mean)||!finite(spec.sd)||spec.sd<=0))blocked.push(`${name} ${stat} invalid distribution parameters`);
  }
  distributions[name]=rec;
}
if(process.argv.includes('--self-test')&&built<10)blocked.push(`self-test built too few deployable distributions: ${built}`);

const generatedAt=new Date().toISOString();
const output={schema_version:'1.0.0',season:2026,week:src.week,generated_at:generatedAt,mode:'SHADOW_ONLY',actionable:false,input_status:src.status,sportsbook_inputs_used:false,calibration_source:'distribution-family-calibration-2021-2025.json',distributions};
const report={generated_at:generatedAt,result:blocked.length?'BLOCKED':'PASS',mode:'SHADOW_ONLY',actionable:false,input_status:src.status,built_distributions:built,review_required:review,insufficient_data:insufficient,sportsbook_inputs_used:false,blocked,notes:['This engine constructs football-only weekly distribution objects and does not ingest sportsbook thresholds or prices.','Season-long futures are intentionally not routed through this weekly distribution layer.','Receptions remain REVIEW_REQUIRED until a pregame target distribution is supplied.','Current repository input is a contract placeholder until a 2026 weekly projection snapshot is populated.']};
fs.writeFileSync(path.join(outDir,'weekly-probability-distributions-2026.json'),JSON.stringify(output,null,2)+'\n');
fs.writeFileSync(path.join(root,'guardrails/weekly-probability-engine-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);
