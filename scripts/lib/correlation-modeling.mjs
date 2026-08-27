const EPS=1e-12;
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const finite=x=>Number.isFinite(Number(x));

export function mean(a){return a.reduce((s,x)=>s+x,0)/a.length;}
export function pearson(xs,ys){
  if(!Array.isArray(xs)||!Array.isArray(ys)||xs.length!==ys.length||xs.length<2)return null;
  const mx=mean(xs),my=mean(ys);let sxx=0,syy=0,sxy=0;
  for(let i=0;i<xs.length;i++){const dx=xs[i]-mx,dy=ys[i]-my;sxx+=dx*dx;syy+=dy*dy;sxy+=dx*dy;}
  if(!(sxx>EPS)||!(syy>EPS))return 0;
  return clamp(sxy/Math.sqrt(sxx*syy),-1,1);
}

export function shrinkCorrelation(raw,n,{strength=40,maxAbs=.9,minN=25}={}){
  if(!finite(raw)||!Number.isInteger(Number(n))||n<minN)return null;
  return clamp(Number(raw)*(n/(n+strength)),-maxAbs,maxAbs);
}

export function estimateCorrelation(pairs,opts={}){
  const clean=(pairs||[]).filter(p=>finite(p?.[0])&&finite(p?.[1])).map(p=>[Number(p[0]),Number(p[1])]);
  const n=clean.length;if(n<(opts.minN??25))return {status:'INSUFFICIENT_DATA',n,raw:null,rho:null};
  const raw=pearson(clean.map(x=>x[0]),clean.map(x=>x[1]));
  const rho=shrinkCorrelation(raw,n,opts);
  return {status:'SHADOW_ONLY',n,raw,rho};
}

export function normalCdf(x){
  const sign=x<0?-1:1,a=Math.abs(x)/Math.sqrt(2),t=1/(1+.3275911*a);
  const y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-a*a);
  return .5*(1+sign*y);
}

export function inverseNormalCdf(p){
  const q=clamp(Number(p),1e-12,1-1e-12);
  const a=[-3.969683028665376e1,2.209460984245205e2,-2.759285104469687e2,1.38357751867269e2,-3.066479806614716e1,2.506628277459239];
  const b=[-5.447609879822406e1,1.615858368580409e2,-1.556989798598866e2,6.680131188771972e1,-1.328068155288572e1];
  const c=[-7.784894002430293e-3,-3.223964580411365e-1,-2.400758277161838,-2.549732539343734,4.374664141464968,2.938163982698783];
  const d=[7.784695709041462e-3,3.224671290700398e-1,2.445134137142996,3.754408661907416];
  const pl=.02425,ph=1-pl;let r;
  if(q<pl){r=Math.sqrt(-2*Math.log(q));return (((((c[0]*r+c[1])*r+c[2])*r+c[3])*r+c[4])*r+c[5])/((((d[0]*r+d[1])*r+d[2])*r+d[3])*r+1);}
  if(q>ph){r=Math.sqrt(-2*Math.log(1-q));return -(((((c[0]*r+c[1])*r+c[2])*r+c[3])*r+c[4])*r+c[5])/((((d[0]*r+d[1])*r+d[2])*r+d[3])*r+1);}
  r=q-.5;const s=r*r;return (((((a[0]*s+a[1])*s+a[2])*s+a[3])*s+a[4])*s+a[5])*r/(((((b[0]*s+b[1])*s+b[2])*s+b[3])*s+b[4])*s+1);
}

export function cholesky(matrix){
  const n=matrix.length,L=Array.from({length:n},()=>Array(n).fill(0));
  for(let i=0;i<n;i++)for(let j=0;j<=i;j++){
    let s=0;for(let k=0;k<j;k++)s+=L[i][k]*L[j][k];
    if(i===j){const v=matrix[i][i]-s;if(v<=1e-10)return null;L[i][j]=Math.sqrt(v);}
    else L[i][j]=(matrix[i][j]-s)/L[j][j];
  }
  return L;
}

export function repairCorrelationMatrix(matrix){
  const n=matrix.length;if(!n||matrix.some(r=>r.length!==n))throw new Error('Correlation matrix must be square');
  const base=matrix.map((row,i)=>row.map((v,j)=>i===j?1:clamp(Number(v),-.99,.99)));
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){const v=(base[i][j]+base[j][i])/2;base[i][j]=base[j][i]=v;}
  let factor=1;
  for(let step=0;step<80;step++){
    const m=base.map((row,i)=>row.map((v,j)=>i===j?1:v*factor));
    const L=cholesky(m);if(L)return {matrix:m,cholesky:L,shrink_factor:factor,repaired:factor<.999999};
    factor*=.95;
  }
  throw new Error('Unable to repair correlation matrix');
}

function lcg(seed){let s=(seed>>>0)||1;return()=>((s=(Math.imul(1664525,s)+1013904223)>>>0)/4294967296);}
function standardNormals(count,rng){const out=[];while(out.length<count){const u1=Math.max(rng(),1e-12),u2=rng(),r=Math.sqrt(-2*Math.log(u1)),t=2*Math.PI*u2;out.push(r*Math.cos(t));if(out.length<count)out.push(r*Math.sin(t));}return out;}

export function gaussianCopulaJointProbability(probabilities,matrix,{samples=32768,seed=20260303}={}){
  const p=(probabilities||[]).map(Number);if(!p.length)throw new Error('At least one marginal event probability is required');
  if(p.some(x=>!finite(x)||x<0||x>1))throw new Error('Marginal event probabilities must be in [0,1]');
  if(samples<4096)throw new Error('Gaussian copula requires at least 4096 samples');
  const repaired=repairCorrelationMatrix(matrix),L=repaired.cholesky,thresholds=p.map(inverseNormalCdf),rng=lcg(seed);let hits=0;
  for(let s=0;s<samples;s++){
    const z=standardNormals(p.length,rng),y=Array(p.length).fill(0);
    for(let i=0;i<p.length;i++){for(let k=0;k<=i;k++)y[i]+=L[i][k]*z[k];}
    if(y.every((v,i)=>v<=thresholds[i]))hits++;
  }
  return {joint_probability:hits/samples,samples,independent_probability:p.reduce((a,b)=>a*b,1),correlation_matrix:repaired.matrix,psd_repaired:repaired.repaired,psd_shrink_factor:repaired.shrink_factor};
}

export function conditionTdProbabilityOnTeamScoring(baseProbability,teamPointsZ,rho){
  const p=clamp(Number(baseProbability),1e-9,1-1e-9),r=clamp(Number(rho),-.95,.95),z=Number(teamPointsZ);
  if(!finite(z))throw new Error('teamPointsZ must be finite');
  const threshold=inverseNormalCdf(1-p),sd=Math.sqrt(Math.max(1e-9,1-r*r));
  return clamp(1-normalCdf((threshold-r*z)/sd),0,1);
}

export function relationshipKey(a,b){return [String(a),String(b)].sort().join('__');}
