import fs from 'node:fs';
import path from 'node:path';
import {pearson,shrinkCorrelation,estimateCorrelation,repairCorrelationMatrix,gaussianCopulaJointProbability,conditionTdProbabilityOnTeamScoring} from './lib/correlation-modeling.mjs';

const fail=[];
const check=(name,ok,detail='')=>{if(!ok)fail.push({name,detail});};
const near=(a,b,t)=>Math.abs(a-b)<=t;

check('pearson-perfect-positive',near(pearson([1,2,3,4],[2,4,6,8]),1,1e-12));
check('pearson-perfect-negative',near(pearson([1,2,3,4],[8,6,4,2]),-1,1e-12));
check('shrink-reduces-magnitude',Math.abs(shrinkCorrelation(.8,40,{strength:40,minN:25,maxAbs:.9}))<.8);
check('shrink-small-sample-blocks',shrinkCorrelation(.8,10,{strength:40,minN:25,maxAbs:.9})===null);
const est=estimateCorrelation(Array.from({length:80},(_,i)=>[i,i*2+(i%3)]),{strength:40,minN:25,maxAbs:.9});
check('estimate-status',est.status==='SHADOW_ONLY'&&est.n===80&&est.rho>0&&est.rho<.9,JSON.stringify(est));

const repaired=repairCorrelationMatrix([[1,.95,.95],[.95,1,-.95],[.95,-.95,1]]);
check('psd-repair-triggered',repaired.repaired===true&&repaired.shrink_factor<1,JSON.stringify(repaired));
check('psd-diagonal-preserved',repaired.matrix.every((r,i)=>near(r[i],1,1e-12)));
check('psd-symmetric',repaired.matrix.every((r,i)=>r.every((v,j)=>near(v,repaired.matrix[j][i],1e-12))));

const independent=gaussianCopulaJointProbability([.5,.5],[[1,0],[0,1]],{samples:65536,seed:17});
check('copula-independence',near(independent.joint_probability,.25,.012),JSON.stringify(independent));
const positive=gaussianCopulaJointProbability([.5,.5],[[1,.7],[.7,1]],{samples:65536,seed:17});
check('copula-positive-correlation-raises-joint-hit',positive.joint_probability>independent.joint_probability+.07,JSON.stringify({independent,positive}));
const negative=gaussianCopulaJointProbability([.5,.5],[[1,-.7],[-.7,1]],{samples:65536,seed:17});
check('copula-negative-correlation-lowers-joint-hit',negative.joint_probability<independent.joint_probability-.07,JSON.stringify({independent,negative}));
const tri=gaussianCopulaJointProbability([.6,.55,.5],[[1,.4,.2],[.4,1,.35],[.2,.35,1]],{samples:32768,seed:31});
check('copula-three-leg-bounds',tri.joint_probability>=0&&tri.joint_probability<=.5,JSON.stringify(tri));
check('copula-preserves-marginal-input-contract',near(tri.independent_probability,.6*.55*.5,1e-12));

const base=.18,up=conditionTdProbabilityOnTeamScoring(base,1,.35),down=conditionTdProbabilityOnTeamScoring(base,-1,.35),neutral=conditionTdProbabilityOnTeamScoring(base,0,.35);
check('team-scoring-up-increases-td-probability',up>neutral&&neutral>down,JSON.stringify({down,neutral,up}));
check('team-scoring-neutral-near-base',near(neutral,base,.02),JSON.stringify({base,neutral}));

const report={generated_at:new Date().toISOString(),result:fail.length?'BLOCKED':'PASS',tests:14,failed:fail.length,fail,safeguards:['Correlation shrinkage and minimum sample size are tested.','Invalid pairwise matrices are repaired to a PSD correlation matrix before joint simulation.','Gaussian copula joint probability differs correctly from independence under positive and negative dependence.','Football-side team scoring environment changes TD probability in the expected direction without sportsbook inputs.']};
fs.mkdirSync(path.join(process.cwd(),'guardrails'),{recursive:true});
fs.writeFileSync(path.join(process.cwd(),'guardrails/correlation-modeling-test-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(fail.length)process.exit(1);
