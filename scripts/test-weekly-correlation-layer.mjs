import fs from 'node:fs';
import path from 'node:path';
import {repairCorrelationMatrix,gaussianCopulaJointProbability} from './lib/correlation-modeling.mjs';

const fail=[],check=(name,ok,detail='')=>{if(!ok)fail.push({name,detail});};
const modelPath=path.join(process.cwd(),'data/probability/generated/correlation-model-2021-2025.json');
if(!fs.existsSync(modelPath))throw new Error('Run build-correlation-model.mjs before weekly correlation tests');
const model=JSON.parse(fs.readFileSync(modelPath,'utf8'));
const r=k=>Number(model.relationships?.[k]?.rho);
for(const k of ['QB_PASS_YARDS__RECEIVER_YARDS','QB_PASS_TDS__RECEIVER_TDS','TARGETS__RECEPTIONS','TARGETS__RECEIVING_YARDS','RECEPTIONS__RECEIVING_YARDS','CARRIES__RUSHING_YARDS'])check(`${k}-available`,Number.isFinite(r(k))&&Math.abs(r(k))<1,String(r(k)));
const qbWr=[[1,r('QB_PASS_YARDS__RECEIVER_YARDS')],[r('QB_PASS_YARDS__RECEIVER_YARDS'),1]],repaired=repairCorrelationMatrix(qbWr);
check('qb-wr-matrix-psd',Array.isArray(repaired.cholesky)&&repaired.cholesky.length===2);
const joint=gaussianCopulaJointProbability([.55,.55],repaired.matrix,{samples:16384,seed:101});
check('qb-wr-joint-valid',joint.joint_probability>=0&&joint.joint_probability<=.55,JSON.stringify(joint));
check('step3b-marginal-inputs-preserved',Math.abs(joint.independent_probability-(.55*.55))<1e-12,JSON.stringify(joint));
const report={generated_at:new Date().toISOString(),result:fail.length?'BLOCKED':'PASS',tests:9,failed:fail.length,fail,safeguards:['Required weekly relationship coefficients exist after historical calibration.','A same-team QB/receiver pair produces a PSD-safe joint correlation matrix.','Step 3B marginal probabilities are inputs to, not rewritten by, the joint probability layer.']};
fs.mkdirSync(path.join(process.cwd(),'guardrails'),{recursive:true});fs.writeFileSync(path.join(process.cwd(),'guardrails/weekly-correlation-layer-test-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(fail.length)process.exit(1);
