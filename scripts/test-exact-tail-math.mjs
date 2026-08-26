import {normalCdf,studentTCdfValue,poissonPmf,poissonCdf,negativeBinomialPmf,discreteSupport,compoundReceptionPmf,lineProbabilities} from './lib/distribution-tail-math.mjs';

const fail=[];
const near=(a,b,t=1e-8)=>Math.abs(a-b)<=t;
const check=(ok,msg)=>{if(!ok)fail.push(msg)};

check(near(normalCdf(0),.5,2e-7),'normal CDF symmetry failed');
check(near(studentTCdfValue(0,0,1,8),.5,1e-10),'student-t CDF symmetry failed');
check(near(poissonPmf(0,2),Math.exp(-2),1e-12),'Poisson P(X=0) failed');
check(near(poissonCdf(0,2),Math.exp(-2),1e-12),'Poisson CDF at zero failed');

const pois={family:'poisson',parameters:{lambda:2},mean:2,sd:Math.sqrt(2)};
const pHalf=lineProbabilities(pois,1.5);
check(near(pHalf.push,0),'half-point Poisson line should have zero push');
check(near(pHalf.under,poissonCdf(1,2),1e-12),'half-point Poisson under failed');
check(near(pHalf.over,1-poissonCdf(1,2),1e-12),'half-point Poisson over failed');
const pInt=lineProbabilities(pois,2);
check(near(pInt.push,poissonPmf(2,2),1e-12),'integer Poisson push failed');
check(near(pInt.over+pInt.under+pInt.push,1,1e-12),'integer Poisson sum failed');

const nb={family:'negative_binomial',parameters:{r:4,p:.4,mean:6,variance:15},mean:6,sd:Math.sqrt(15)};
const nbSupport=discreteSupport(nb,{tailTolerance:1e-12,maxSupport:120});
check(Math.abs(nbSupport.pmf.reduce((a,b)=>a+b,0)-1)<1e-12,'NB support normalization failed');
check(negativeBinomialPmf(0,nb.parameters)>0,'NB zero mass failed');
const nbLine=lineProbabilities(nb,5.5);check(Math.abs(nbLine.over+nbLine.under+nbLine.push-1)<1e-12,'NB line sum failed');

const compound=compoundReceptionPmf(nb,{catch_rate:.65,rho:.08,conditional_family:'beta_binomial',tailTolerance:1e-12,maxSupport:120});
check(Math.abs(compound.normalized_mass-1)<1e-12,'compound PMF mass failed');
check(Math.abs(compound.mean-6*.65)<1e-8,'compound mean identity E[R]=E[N]p failed');
check(compound.sd>0,'compound SD invalid');
const recSpec={family:'compound_receptions',parameters:{pmf:compound.pmf},mean:compound.mean,sd:compound.sd};
const recHalf=lineProbabilities(recSpec,3.5);check(recHalf.push===0,'compound half-point push must be zero');check(Math.abs(recHalf.over+recHalf.under-1)<1e-12,'compound half-point sum failed');
const recInt=lineProbabilities(recSpec,3);check(recInt.push>0,'compound integer push missing');check(Math.abs(recInt.over+recInt.under+recInt.push-1)<1e-12,'compound integer sum failed');

const continuous={family:'normal',parameters:{mu:50,sigma:10},mean:50,sd:10};
const c=lineProbabilities(continuous,50);check(near(c.over,.5,2e-7)&&near(c.under,.5,2e-7)&&c.push===0,'continuous line probability symmetry failed');

const report={result:fail.length?'BLOCKED':'PASS',tests:17,failed:fail.length,fail,safeguards:['Selected-family CDF/PMF line probabilities are tested directly.','Discrete half-point lines have zero push.','Discrete integer lines explicitly preserve push mass.','Compound receptions conserve PMF mass and satisfy E[R]=E[N]p.']};
console.log(JSON.stringify(report,null,2));if(fail.length)process.exit(1);
