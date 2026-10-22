const EPS=1e-12;
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const finite=x=>Number.isFinite(Number(x));

export function logGamma(z){
  const p=[676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.984369578019571e-6,1.5056327351493116e-7];
  if(z<.5)return Math.log(Math.PI)-Math.log(Math.sin(Math.PI*z))-logGamma(1-z);
  z-=1;let x=.9999999999998099;for(let i=0;i<p.length;i++)x+=p[i]/(z+i+1);const t=z+p.length-.5;
  return .5*Math.log(2*Math.PI)+(z+.5)*Math.log(t)-t+Math.log(x);
}

function betacf(a,b,x){
  const MAX=250,FPMIN=1e-30,TOL=3e-12;let qab=a+b,qap=a+1,qam=a-1,c=1,d=1-qab*x/qap;
  if(Math.abs(d)<FPMIN)d=FPMIN;d=1/d;let h=d;
  for(let m=1;m<=MAX;m++){
    const m2=2*m;let aa=m*(b-m)*x/((qam+m2)*(a+m2));d=1+aa*d;if(Math.abs(d)<FPMIN)d=FPMIN;c=1+aa/c;if(Math.abs(c)<FPMIN)c=FPMIN;d=1/d;h*=d*c;
    aa=-(a+m)*(qab+m)*x/((a+m2)*(qap+m2));d=1+aa*d;if(Math.abs(d)<FPMIN)d=FPMIN;c=1+aa/c;if(Math.abs(c)<FPMIN)c=FPMIN;d=1/d;const del=d*c;h*=del;if(Math.abs(del-1)<TOL)break;
  }
  return h;
}
export function regularizedBeta(x,a,b){
  if(x<=0)return 0;if(x>=1)return 1;
  const bt=Math.exp(logGamma(a+b)-logGamma(a)-logGamma(b)+a*Math.log(x)+b*Math.log(1-x));
  return x<(a+1)/(a+b+2)?bt*betacf(a,b,x)/a:1-bt*betacf(b,a,1-x)/b;
}

export function erf(x){
  const s=x<0?-1:1,a=Math.abs(x),t=1/(1+.3275911*a);
  const y=1-(((((1.061405429*t-1.453152027)*t+1.421413741)*t-.284496736)*t+.254829592)*t)*Math.exp(-a*a);
  return s*y;
}
export const normalCdf=x=>.5*(1+erf(x/Math.SQRT2));

export function studentTCdfValue(x,mu,scale,df){
  if(!(scale>0)||!(df>0))return NaN;
  const t=(x-mu)/scale,q=df/(df+t*t),ib=regularizedBeta(q,df/2,.5);
  return clamp(t>=0?1-.5*ib:.5*ib,0,1);
}

export function lognormalShiftedCdf(x,{shift,log_mu,log_sigma}){
  if(!(log_sigma>0))return NaN;
  if(x<=shift)return 0;
  return clamp(normalCdf((Math.log(x-shift)-log_mu)/log_sigma),0,1);
}

export function poissonPmf(k,lambda){
  if(k<0||Math.floor(k)!==k||!(lambda>0))return 0;
  return Math.exp(k*Math.log(lambda)-lambda-logGamma(k+1));
}
export function poissonCdf(k,lambda){
  if(k<0)return 0;let s=0;for(let i=0;i<=Math.floor(k);i++)s+=poissonPmf(i,lambda);return clamp(s,0,1);
}

export function negativeBinomialPmf(k,{r,p}){
  if(k<0||Math.floor(k)!==k||!(r>0)||!(p>0&&p<1))return 0;
  return Math.exp(logGamma(k+r)-logGamma(r)-logGamma(k+1)+r*Math.log(p)+k*Math.log(1-p));
}
export function negativeBinomialCdf(k,pars){
  if(k<0)return 0;let s=0;for(let i=0;i<=Math.floor(k);i++)s+=negativeBinomialPmf(i,pars);return clamp(s,0,1);
}

export function binomialPmf(k,n,p){
  if(k<0||k>n||Math.floor(k)!==k||Math.floor(n)!==n)return 0;p=clamp(p,1e-10,1-1e-10);
  return Math.exp(logGamma(n+1)-logGamma(k+1)-logGamma(n-k+1)+k*Math.log(p)+(n-k)*Math.log(1-p));
}
export function betaBinomialPmf(k,n,p,rho){
  if(k<0||k>n||Math.floor(k)!==k||Math.floor(n)!==n)return 0;
  p=clamp(p,1e-8,1-1e-8);rho=clamp(rho,1e-8,.95);const t=1/rho-1,a=p*t,b=(1-p)*t;
  return Math.exp(logGamma(n+1)-logGamma(k+1)-logGamma(n-k+1)+logGamma(k+a)+logGamma(n-k+b)-logGamma(n+a+b)+logGamma(a+b)-logGamma(a)-logGamma(b));
}

export function discreteSupport(spec,{tailTolerance=1e-10,maxSupport=120}={}){
  const family=spec?.family,pmf=[];let mass=0;
  for(let k=0;k<=maxSupport;k++){
    let pk;
    if(family==='poisson')pk=poissonPmf(k,Number(spec.parameters?.lambda));
    else if(family==='negative_binomial')pk=negativeBinomialPmf(k,spec.parameters||{});
    else throw new Error(`Unsupported discrete target family ${family}`);
    if(!Number.isFinite(pk)||pk<0)throw new Error(`Invalid PMF for ${family} at ${k}`);
    pmf.push(pk);mass+=pk;
    if(k>=5&&1-mass<=tailTolerance)break;
  }
  if(mass<=0)throw new Error(`No PMF mass for ${family}`);
  const tail=Math.max(0,1-mass);
  return {pmf:pmf.map(x=>x/mass),raw_mass:mass,truncated_tail:tail,max_k:pmf.length-1};
}

export function compoundReceptionPmf(targetSpec,{catch_rate,rho=0,conditional_family='beta_binomial',tailTolerance=1e-10,maxSupport=120}={}){
  const target=discreteSupport(targetSpec,{tailTolerance,maxSupport});
  const out=Array(target.max_k+1).fill(0);const p=clamp(Number(catch_rate),1e-8,1-1e-8);
  for(let n=0;n<target.pmf.length;n++){
    const pn=target.pmf[n];if(pn===0)continue;
    for(let r=0;r<=n;r++){
      const pr=conditional_family==='beta_binomial'?betaBinomialPmf(r,n,p,rho):binomialPmf(r,n,p);
      out[r]+=pn*pr;
    }
  }
  const total=out.reduce((a,b)=>a+b,0);if(!(total>0))throw new Error('Compound reception PMF has no mass');
  const pmf=out.map(x=>x/total);const mean=pmf.reduce((s,x,k)=>s+k*x,0);const variance=pmf.reduce((s,x,k)=>s+(k-mean)**2*x,0);
  return {pmf,mean,variance,sd:Math.sqrt(Math.max(variance,0)),support_max:pmf.length-1,target_truncated_tail:target.truncated_tail,normalized_mass:pmf.reduce((a,b)=>a+b,0)};
}

export function lineProbabilities(spec,line){
  const x=Number(line);if(!Number.isFinite(x))throw new Error('Line must be finite');const f=spec?.family;
  if(['normal','student_t','lognormal_shifted'].includes(f)){
    let c;
    if(f==='normal')c=normalCdf((x-Number(spec.parameters?.mu))/Number(spec.parameters?.sigma));
    else if(f==='student_t')c=studentTCdfValue(x,Number(spec.parameters?.mu),Number(spec.parameters?.scale),Number(spec.parameters?.df));
    else c=lognormalShiftedCdf(x,spec.parameters||{});
    c=clamp(c,0,1);return {over:1-c,under:c,push:0};
  }
  if(f==='poisson'||f==='negative_binomial'){
    const integerLine=Number.isInteger(x),floor=Math.floor(x),cdfAtFloor=f==='poisson'?poissonCdf(floor,Number(spec.parameters?.lambda)):negativeBinomialCdf(floor,spec.parameters||{});
    if(integerLine){const pm=f==='poisson'?poissonPmf(x,Number(spec.parameters?.lambda)):negativeBinomialPmf(x,spec.parameters||{});const under=Math.max(0,cdfAtFloor-pm);return normalizeTriple({over:Math.max(0,1-cdfAtFloor),under,push:pm});}
    return normalizeTriple({over:Math.max(0,1-cdfAtFloor),under:cdfAtFloor,push:0});
  }
  if(f==='compound_receptions'){
    const pmf=spec.parameters?.pmf;if(!Array.isArray(pmf)||!pmf.length)throw new Error('Compound reception PMF missing');
    const integerLine=Number.isInteger(x),floor=Math.floor(x),cdf=pmf.slice(0,Math.min(pmf.length,floor+1)).reduce((a,b)=>a+b,0);
    if(integerLine){const pm=x>=0&&x<pmf.length?pmf[x]:0;return normalizeTriple({over:Math.max(0,1-cdf),under:Math.max(0,cdf-pm),push:pm});}
    return normalizeTriple({over:Math.max(0,1-cdf),under:cdf,push:0});
  }
  throw new Error(`Unsupported line probability family ${f}`);
}

function normalizeTriple(x){
  const s=x.over+x.under+x.push;if(!(s>0))throw new Error('Probability triple has zero mass');
  return {over:clamp(x.over/s,0,1),under:clamp(x.under/s,0,1),push:clamp(x.push/s,0,1)};
}
