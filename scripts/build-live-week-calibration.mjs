import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const cfg=read('guardrails/guardrails-config.json');
const contract=read('data/sources/live-week-calibration-2026.json');
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const finite=x=>Number.isFinite(Number(x));
const iso=x=>{const t=new Date(x).getTime();return Number.isFinite(t)?t:null;};
const round=(x,d=6)=>Number(Number(x).toFixed(d));
const americanProfit=o=>{o=Number(o);if(!Number.isFinite(o)||o===0)return null;return o<0?100/(-o):o/100;};

function probabilityBucket(p,buckets){let label=`<${buckets[0].toFixed(2)}`;for(let i=0;i<buckets.length;i++)if(p>=buckets[i])label=i===buckets.length-1?`${buckets[i].toFixed(2)}+`:`${buckets[i].toFixed(2)}-${buckets[i+1].toFixed(2)}`;return label;}

export function evaluateLiveHoldout(predictions,outcomes,{minimum=100,buckets=cfg.calibration.probability_buckets}={}){
  const blocked=[],review=[],seen=new Set(),predMap=new Map();
  for(const p of predictions||[]){
    const id=String(p.prediction_id||'');if(!id){blocked.push('prediction missing prediction_id');continue;}if(seen.has(id)){blocked.push(`duplicate prediction_id ${id}`);continue;}seen.add(id);
    const pt=iso(p.prediction_timestamp),start=iso(p.event_start),prob=Number(p.model_probability),market=Number(p.market_probability),odds=Number(p.offered_odds);
    if(pt==null||start==null||pt>=start)blocked.push(`${id} prediction timestamp must precede event start`);
    if(p.frozen!==true)blocked.push(`${id} prediction must be frozen`);
    if(String(p.split||'').toUpperCase()!=='HOLDOUT')blocked.push(`${id} split must be HOLDOUT`);
    if(!finite(prob)||prob<0||prob>1)blocked.push(`${id} invalid model_probability`);
    if(!finite(market)||market<0||market>1)blocked.push(`${id} invalid market_probability`);
    if(!americanProfit(odds))blocked.push(`${id} invalid offered_odds`);
    if(!p.market_type)blocked.push(`${id} missing market_type`);
    predMap.set(id,p);
  }
  const settled=[];
  for(const o of outcomes||[]){
    const id=String(o.prediction_id||''),p=predMap.get(id);if(!p){blocked.push(`outcome without matching prediction ${id||'MISSING_ID'}`);continue;}
    const result=Number(o.result),close=Number(o.closing_market_probability),settledAt=iso(o.settled_at),start=iso(p.event_start);
    if(![0,1].includes(result))blocked.push(`${id} result must be 0 or 1`);
    if(!finite(close)||close<0||close>1)blocked.push(`${id} invalid closing_market_probability`);
    if(settledAt==null||start==null||settledAt<start)blocked.push(`${id} settled_at must not precede event start`);
    if([0,1].includes(result)&&finite(close)&&close>=0&&close<=1&&settledAt!=null&&start!=null&&settledAt>=start)settled.push({p,o,result,close});
  }
  if(blocked.length)return {status:'BLOCKED',quantitative_gate_passed:false,holdout_bets:settled.length,metrics:null,blocked,review};
  const n=settled.length;if(n<minimum)review.push(`minimum live holdout sample not met: ${n}/${minimum}`);
  if(!n)return {status:'REVIEW_REQUIRED',quantitative_gate_passed:false,holdout_bets:0,metrics:{brier_score:null,log_loss:null,roi:null,closing_line_value:null,hit_rate_by_probability_bucket:null,hit_rate_by_market_type:null},blocked,review};
  let brier=0,ll=0,net=0,stakeTotal=0,clv=0;const byBucket=new Map(),byType=new Map();
  for(const {p,result,close} of settled){
    const prob=clamp(Number(p.model_probability),1e-12,1-1e-12),stake=finite(p.stake_units)&&Number(p.stake_units)>0?Number(p.stake_units):1,profit=americanProfit(p.offered_odds);
    brier+=(prob-result)**2;ll+=-(result*Math.log(prob)+(1-result)*Math.log(1-prob));net+=result?stake*profit:-stake;stakeTotal+=stake;clv+=close-Number(p.market_probability);
    const b=probabilityBucket(prob,buckets),t=String(p.market_type);if(!byBucket.has(b))byBucket.set(b,{wins:0,bets:0});if(!byType.has(t))byType.set(t,{wins:0,bets:0});byBucket.get(b).bets++;byBucket.get(b).wins+=result;byType.get(t).bets++;byType.get(t).wins+=result;
  }
  const rates=m=>Object.fromEntries([...m].map(([k,v])=>[k,{bets:v.bets,wins:v.wins,hit_rate:round(v.wins/v.bets)}]));
  const metrics={brier_score:round(brier/n),log_loss:round(ll/n),roi:round(net/stakeTotal),closing_line_value:round(clv/n),hit_rate_by_probability_bucket:rates(byBucket),hit_rate_by_market_type:rates(byType)};
  const quantitative=n>=minimum&&contract.required_metrics.every(k=>metrics[k]!=null);if(quantitative)review.push('quantitative gate met; exact-sample manual production-trust approval required');
  return {status:'REVIEW_REQUIRED',quantitative_gate_passed:quantitative,holdout_bets:n,metrics,blocked,review};
}

export function applyManualTrustReview(evaluation,approval){
  const review=[];let trusted=false;
  if(evaluation.quantitative_gate_passed){
    const exact=Number(approval?.reviewed_holdout_bets)===Number(evaluation.holdout_bets),approved=String(approval?.decision||'').toUpperCase()==='APPROVED',timestamp=iso(approval?.review_timestamp),reviewer=String(approval?.reviewer||'').trim();
    trusted=approved&&exact&&timestamp!=null&&reviewer.length>0;
    if(!trusted)review.push('manual production-trust approval missing, stale, incomplete, or not APPROVED');
  }
  return {production_trusted:trusted,review};
}

function synthetic(){const predictions=[],outcomes=[];for(let i=0;i<120;i++){const p=.50+(i%6)*.05,win=i%10<Math.round(p*10),id=`T${i}`;predictions.push({prediction_id:id,prediction_timestamp:'2026-09-10T12:00:00Z',event_start:'2026-09-10T20:00:00Z',model_probability:p,market_probability:Math.max(.01,p-.03),offered_odds:-110,market_type:i%2?'receiving_yards':'rush_yards',split:'HOLDOUT',frozen:true,stake_units:1});outcomes.push({prediction_id:id,result:win?1:0,closing_market_probability:Math.max(.01,p-.01),settled_at:'2026-09-11T01:00:00Z'});}return {predictions,outcomes};}

const selfTest=process.argv.includes('--self-test');
const source=selfTest?synthetic():{predictions:read('data/calibration/weekly-predictions-2026.json').predictions||[],outcomes:read('data/calibration/weekly-outcomes-2026.json').outcomes||[]};
const evaluation=evaluateLiveHoldout(source.predictions,source.outcomes,{minimum:Number(contract.minimum_holdout_bets_before_trust)});
const approval=selfTest?{decision:'NOT_REVIEWED',reviewed_holdout_bets:0,review_timestamp:null,reviewer:null}:read('data/calibration/production-trust-review-2026.json');
const trust=applyManualTrustReview(evaluation,approval),generatedAt=new Date().toISOString(),review=[...evaluation.review,...trust.review];
const output={schema_version:'1.1.0',season:2026,generated_at:generatedAt,status:evaluation.blocked.length?'BLOCKED':trust.production_trusted?'PRODUCTION_TRUSTED':'REVIEW_REQUIRED',mode:trust.production_trusted?'PRODUCTION_TRUSTED':'SHADOW_ONLY',actionable:trust.production_trusted,production_trusted:trust.production_trusted,quantitative_gate_passed:evaluation.quantitative_gate_passed,holdout_bets:evaluation.holdout_bets,...(evaluation.metrics||{}),blocked:evaluation.blocked,review,required_before_actionable_weekly_betting:true,minimum_holdout_bets_before_trust:Number(contract.minimum_holdout_bets_before_trust),manual_review_required_after_quantitative_gate:true,approval_decision:approval?.decision||null,approval_reviewed_holdout_bets:approval?.reviewed_holdout_bets??null};
fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});
if(selfTest){
  const failures=[];if(evaluation.blocked.length)failures.push(...evaluation.blocked);if(evaluation.holdout_bets!==120)failures.push(`expected 120 settled bets, got ${evaluation.holdout_bets}`);if(!evaluation.quantitative_gate_passed)failures.push('synthetic quantitative gate should pass');if(trust.production_trusted!==false)failures.push('unreviewed synthetic sample must not be production trusted');for(const k of contract.required_metrics)if(evaluation.metrics?.[k]==null)failures.push(`missing metric ${k}`);
  const approved=applyManualTrustReview(evaluation,{decision:'APPROVED',reviewed_holdout_bets:120,review_timestamp:'2026-09-12T12:00:00Z',reviewer:'manual-review'});if(!approved.production_trusted)failures.push('exact-sample complete manual approval should permit trust');
  const stale=applyManualTrustReview(evaluation,{decision:'APPROVED',reviewed_holdout_bets:119,review_timestamp:'2026-09-12T12:00:00Z',reviewer:'manual-review'});if(stale.production_trusted)failures.push('stale approval must not permit trust');
  const bad=evaluateLiveHoldout([{prediction_id:'LEAK',prediction_timestamp:'2026-09-10T21:00:00Z',event_start:'2026-09-10T20:00:00Z',model_probability:.6,market_probability:.55,offered_odds:-110,market_type:'rush_yards',split:'HOLDOUT',frozen:true}],[]);if(bad.status!=='BLOCKED')failures.push('post-start prediction must block');
  const report={generated_at:generatedAt,result:failures.length?'BLOCKED':'PASS',tests:8,failed:failures.length,failures,synthetic_holdout_bets:evaluation.holdout_bets,quantitative_gate_passed:evaluation.quantitative_gate_passed,unreviewed_production_trusted:trust.production_trusted};fs.writeFileSync(path.join(root,'guardrails/live-week-calibration-test-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(failures.length)process.exit(1);
}else{
  fs.writeFileSync(path.join(root,'weeklyCalibration2026.json'),JSON.stringify(output,null,2)+'\n');const report={generated_at:generatedAt,result:evaluation.blocked.length?'BLOCKED':'PASS',holdout_bets:evaluation.holdout_bets,quantitative_gate_passed:evaluation.quantitative_gate_passed,production_trusted:trust.production_trusted,approval_decision:approval?.decision||null,blocked:evaluation.blocked,review};fs.writeFileSync(path.join(root,'guardrails/live-week-calibration-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(output,null,2));if(evaluation.blocked.length)process.exit(1);
}
