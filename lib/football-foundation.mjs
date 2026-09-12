// Normal-normal Bayes update. Variances describe uncertainty in the mean,
// not week-to-week performance variance. Evidence must be independent.
const finite=(n,label)=>{if(typeof n!=='number'||!Number.isFinite(n))throw Error(`${label} must be finite`);return n;};
const positive=(n,label)=>{finite(n,label);if(n<=0)throw Error(`${label} must be positive`);return n;};
export function updateNormalPrior(prior,evidence=[]){
  finite(prior.mean,'prior mean');positive(prior.variance,'prior variance');
  const used=new Set();let precision=1/prior.variance,weighted=prior.mean*precision;
  for(const row of evidence){
    if(!row.id||used.has(row.id))throw Error('Evidence requires unique source IDs');
    used.add(row.id);finite(row.mean,'evidence mean');positive(row.variance,'evidence variance');
    precision+=1/row.variance;weighted+=row.mean/row.variance;
  }
  const mean=weighted/precision,variance=1/precision;
  finite(mean,'posterior mean');positive(variance,'posterior variance');
  return {mean,variance,evidence_ids:[...used]};
}

// FV = E[X] + lambda*(Q90-Q50) - rho*(Q50-Q10) + gamma*S.
// Coefficients must be supplied by the fitted model; none are invented here.
export function footballValue({expected,q10,q50,q90,scarcity},{lambda,rho,gamma}){
  for(const [key,value] of Object.entries({expected,q10,q50,q90,scarcity,lambda,rho,gamma}))finite(value,key);
  if(q10>q50||q50>q90)throw Error('Quantiles must be ordered');
  if(lambda<0||rho<0||gamma<0)throw Error('Value coefficients must be nonnegative');
  const upside=lambda*(q90-q50),downside=rho*(q50-q10),scarcity_adjustment=gamma*scarcity;
  const score=expected+upside-downside+scarcity_adjustment;finite(score,'football value');
  return {score,expected,upside,downside,scarcity_adjustment};
}
