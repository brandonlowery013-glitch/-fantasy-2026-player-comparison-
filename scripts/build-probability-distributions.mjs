import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const cfg=read('probabilityModel2026.json');
const guard=read('guardrails/guardrails-config.json');
const odds=read('vegasOdds2026.json');

let players=[];
for(let i=0;i<guard.authoritative_player_shards;i++) players.push(...read(`players${i}.json`));
const playerMap=new Map(players.map(p=>[p.n,p]));

const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const round=(v,d=6)=>Number(Number(v).toFixed(d));
const midpoint=(a,b)=>(Number(a)+Number(b))/2;
const erf=x=>{
  const sign=x<0?-1:1, ax=Math.abs(x), t=1/(1+0.3275911*ax);
  const y=1-(((((1.061405429*t-1.453152027)*t+1.421413741)*t-0.284496736)*t+0.254829592)*t)*Math.exp(-ax*ax);
  return sign*y;
};
const cdf=z=>0.5*(1+erf(z/Math.SQRT2));

function range(text,re){
  const m=String(text||'').match(re);
  return m?midpoint(m[1],m[2]):null;
}
function singleOrRange(text,reRange,reSingle){
  const r=range(text,reRange); if(r!=null) return r;
  const m=String(text||'').match(reSingle); return m?Number(m[1]):null;
}
function statCenter(text,stat){
  const n='([0-9]+(?:\\.[0-9]+)?)';
  if(stat==='passing_yards') return singleOrRange(text,new RegExp(`Pass\\s+${n}\\s*-\\s*${n}\\s*yd`,'i'),new RegExp(`Pass\\s+${n}\\s*yd`,'i'));
  if(stat==='rushing_yards') return singleOrRange(text,new RegExp(`Rush\\s+${n}\\s*-\\s*${n}\\s*yd`,'i'),new RegExp(`Rush\\s+${n}\\s*yd`,'i'));
  if(stat==='receiving_yards') return singleOrRange(text,new RegExp(`Rec\\s+[^·\\n]*?\\/\\s*${n}\\s*-\\s*${n}\\s*yd`,'i'),new RegExp(`Rec\\s+[^·\\n]*?\\/\\s*${n}\\s*yd`,'i'));
  if(stat==='passing_tds') return singleOrRange(text,new RegExp(`Pass\\s+[^·\\n]*?yd\\s*\\/\\s*${n}\\s*-\\s*${n}\\s*TD`,'i'),new RegExp(`Pass\\s+[^·\\n]*?yd\\s*\\/\\s*${n}\\s*TD`,'i'));
  if(stat==='receiving_tds') return singleOrRange(text,new RegExp(`Rec\\s+[^·\\n]*?yd\\s*\\/\\s*${n}\\s*-\\s*${n}\\s*TD`,'i'),new RegExp(`Rec\\s+[^·\\n]*?yd\\s*\\/\\s*${n}\\s*TD`,'i'));
  if(stat==='receptions') return singleOrRange(text,new RegExp(`Rec\\s+${n}\\s*-\\s*${n}\\s*\\/`,'i'),new RegExp(`Rec\\s+${n}\\s*\\/`,'i'));
  return null;
}

function uncertainty(p,stat,center,ceilingCenter){
  const w=cfg.uncertainty_weights;
  const scores={role:Number(p.r),availability:Number(p.a),reliability:Number(p.rl),sustainability:Number(p.su),environment:Number(p.e)};
  let risk=0;
  for(const [k,weight] of Object.entries(w)) risk+=weight*((10-clamp(scores[k],0,10))/10);
  const um=cfg.uncertainty_multiplier;
  const riskMult=clamp(um.base+um.risk_slope*risk,um.minimum,um.maximum);
  const cm=cfg.ceiling_score_multiplier;
  const ceilingScoreMult=clamp(1+cm.slope_per_point*(Number(p.ce)-cm.reference_score),cm.minimum,cm.maximum);
  const cv=Number(cfg.base_coefficient_of_variation[stat]);
  const baseSigma=center*cv*riskMult*ceilingScoreMult;
  const z90=Math.abs(Number(cfg.percentiles.p90_z));
  const ceilingSigma=Number.isFinite(ceilingCenter)&&ceilingCenter>center?(ceilingCenter-center)/z90:0;
  return {sigma:Math.max(baseSigma,ceilingSigma),risk:round(risk),risk_multiplier:round(riskMult),ceiling_score_multiplier:round(ceilingScoreMult),base_sigma:round(baseSigma),ceiling_implied_sigma:round(ceilingSigma)};
}

const output={
  season:2026,
  model_version:cfg.version,
  mode:'SHADOW_ONLY',
  actionable:false,
  calibration_status:cfg.calibration_status,
  generated_at:new Date().toISOString(),
  methodology:'projection midpoint + football-only uncertainty inputs; sportsbook price excluded from model probability',
  players:{},
  coverage:{priced_markets:0,modeled_markets:0,insufficient_markets:0}
};
const probabilityInputs={
  season:2026,
  mode:'SHADOW_ONLY',
  status:'NON_ACTIONABLE',
  calibration_status:cfg.calibration_status,
  purpose:'Model probabilities generated from the football projection distribution. Never infer or back-solve model probability from sportsbook pricing.',
  players:{}
};

for(const [name,bookPlayer] of Object.entries(odds.players||{})){
  const p=playerMap.get(name); if(!p) continue;
  const markets={};
  for(const m of bookPlayer.markets||[]){
    output.coverage.priced_markets++;
    const center=statCenter(p.m,m.stat);
    const ceilingCenter=statCenter(p.cl,m.stat);
    const key=`${m.book}|${m.stat}|${m.line}`;
    if(!Number.isFinite(center)||center<=0){
      output.coverage.insufficient_markets++;
      markets[key]={stat:m.stat,line:m.line,book:m.book,status:'INSUFFICIENT_DATA',reason:'Could not parse a football-model projection center for this stat from player.m'};
      continue;
    }
    const u=uncertainty(p,m.stat,center,ceilingCenter);
    if(!Number.isFinite(u.sigma)||u.sigma<=0){
      output.coverage.insufficient_markets++;
      markets[key]={stat:m.stat,line:m.line,book:m.book,status:'INSUFFICIENT_DATA',reason:'Distribution sigma could not be constructed'};
      continue;
    }
    const pct={};
    for(const [label,z] of Object.entries(cfg.percentiles)) pct[label.replace('_z','')]=round(Math.max(0,center+Number(z)*u.sigma),3);
    const z=(Number(m.line)-center)/u.sigma;
    const pOver=clamp(1-cdf(z),0,1);
    const pUnder=1-pOver;
    output.coverage.modeled_markets++;
    markets[key]={
      stat:m.stat,label:m.label,line:m.line,book:m.book,
      status:'UNVALIDATED_SHADOW',actionable:false,
      projection_center:round(center,3),ceiling_projection_center:Number.isFinite(ceilingCenter)?round(ceilingCenter,3):null,
      standard_deviation:round(u.sigma,3),percentiles:pct,
      model_over_probability:round(pOver),model_under_probability:round(pUnder),
      inputs:{ceiling_score:Number(p.ce),role:Number(p.r),availability:Number(p.a),reliability:Number(p.rl),sustainability:Number(p.su),environment:Number(p.e),...u},
      market_price_used_in_probability:false
    };
    probabilityInputs.players[name]??={markets:{}};
    probabilityInputs.players[name].markets[key]={
      model_over_probability:round(pOver),
      method:`probabilityModel2026 ${cfg.version}: projection distribution`,
      generated_at:output.generated_at,
      calibration_status:cfg.calibration_status,
      independent_signals:['football_projection_center','football_uncertainty_profile'],
      actionable:false
    };
  }
  if(Object.keys(markets).length) output.players[name]={position:p.p,markets};
}

const modeled=output.coverage.modeled_markets;
const priced=output.coverage.priced_markets;
output.coverage.modeled_pct=priced?round(modeled/priced):0;
const minCoverage=0.80;
if(output.coverage.modeled_pct<minCoverage){
  console.error(`Probability model coverage ${output.coverage.modeled_pct} is below required shadow validation floor ${minCoverage}`);
  process.exitCode=1;
}

fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});
fs.writeFileSync(path.join(root,'guardrails/probability-distribution-report.json'),JSON.stringify(output,null,2)+'\n');
fs.writeFileSync(path.join(root,'guardrails/generated-ev-probability-inputs.json'),JSON.stringify(probabilityInputs,null,2)+'\n');
console.log(JSON.stringify(output.coverage,null,2));
if(process.argv.includes('--validate')){
  for(const obj of Object.values(output.players)) for(const m of Object.values(obj.markets||{})) if(m.model_over_probability!=null){
    if(Math.abs((m.model_over_probability+m.model_under_probability)-1)>guard.probability.sum_tolerance) throw new Error('Probability complement failure');
    if(m.market_price_used_in_probability!==false) throw new Error('Market contamination detected');
  }
  console.log('Probability distribution shadow validation complete.');
}
