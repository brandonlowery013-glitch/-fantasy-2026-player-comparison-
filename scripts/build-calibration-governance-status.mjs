import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),JSON.stringify(x,null,2)+'\n');};
const self=process.argv.includes('--self-test');
const contract=read('data/sources/calibration-governance-2026.json');

function build(settlements,calibration){
  const n=Array.isArray(settlements.settlements)?settlements.settlements.length:Number(calibration.settled_forecasts||0);
  const floor=contract.minimum_samples.global_settled_observations;
  const floorMet=n>=floor;
  const status=!floorMet?'INSUFFICIENT_EVIDENCE':'READY_FOR_CHALLENGER_EVALUATION';
  const reason=!floorMet?`Need ${floor-n} more settled observations before any global challenger evaluation.`:'Global sample floor met; challenger still requires prospective holdout evidence and manual promotion review.';
  return {
    schema_version:'1.0.0',season:2026,mode:'SHADOW_ONLY',actionable:false,status,decision:'HOLD',settled_observations:n,
    global_sample_floor:floor,global_sample_floor_met:floorMet,
    champion:{model_id:'2026_PRESEASON_BASELINE',status:'LOCKED_CHAMPION'},
    challenger:null,promotion_eligible:false,reason,generated_at:self?'SELF_TEST':new Date().toISOString(),
    calibration_metrics:calibration.metrics??null,
    safeguards:{same_observation_tune_and_score_prohibited:true,automatic_promotion:false,automatic_live_model_mutation:false,prospective_holdout_required:true}
  };
}

if(self){
  const a=build({settlements:Array(99).fill({})},{settled_forecasts:99,metrics:null});
  const b=build({settlements:Array(100).fill({})},{settled_forecasts:100,metrics:{mae:1}});
  const errors=[];
  if(a.global_sample_floor_met||a.status!=='INSUFFICIENT_EVIDENCE')errors.push('99 observations must remain below floor');
  if(!b.global_sample_floor_met||b.status!=='READY_FOR_CHALLENGER_EVALUATION')errors.push('100 observations must meet global floor');
  if(b.decision!=='HOLD'||b.promotion_eligible!==false)errors.push('sample floor alone must never promote a challenger');
  if(errors.length){console.error(errors.join('\n'));process.exit(1)}
  console.log(JSON.stringify({result:'PASS',checks:3},null,2));
  process.exit(0);
}

const settlements=read(contract.sources.settlements);
const calibration=read(contract.sources.calibration);
write('data/calibration/calibration-governance-status-2026.json',build(settlements,calibration));
console.log('calibration governance status built');
