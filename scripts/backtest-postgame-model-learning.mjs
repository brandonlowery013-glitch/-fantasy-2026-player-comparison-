import fs from 'node:fs';
import {fitResidual,candidateProbability} from '../lib/postgame-model-learning.mjs';
const ledger=JSON.parse(fs.readFileSync('data/market/postgame-model-learning-2026.json','utf8'));
const finals=new Map(ledger.settlements.map(r=>[r.forecast_id,r]));
const rows=ledger.forecasts.filter(f=>f.bootstrap&&finals.get(f.forecast_id)?.outcome!==null).map(f=>({...f,outcome:finals.get(f.forecast_id).outcome}));
function metrics(rs,pred){
 const n=rs.length;if(!n)return {n:0};
 return {n,brier:rs.reduce((s,r)=>s+(pred(r)-r.outcome)**2,0)/n,log_loss:rs.reduce((s,r)=>s-Math.log(r.outcome?pred(r):1-pred(r)),0)/n,correct:rs.filter(r=>(pred(r)>.5?1:0)===r.outcome).length};
}
const results=[];
for(const market of ['moneyline','spread'])for(let week=1;week<=4;week++){
 const train=rows.filter(r=>r.market===market&&r.week<week),test=rows.filter(r=>r.market===market&&r.week===week),fit=fitResidual(train);
 results.push({market,week,training_weeks:[...new Set(train.map(r=>r.week))],trained_games:fit.n,base:metrics(test,r=>r.probability),candidate:metrics(test,r=>candidateProbability(fit,r.probability,r.features)),model:fit});
}
const report={status:'RETROSPECTIVE_DIAGNOSTIC_NOT_PROMOTION_EVIDENCE',method:'Train only on preceding weeks; fixed ridge strength and maximum 2-point correction; no test-week outcomes in the fit. Moneyline and spread fitted separately.',limitations:['Historical finals were retrieved now; this is a reconstructed diagnostic, not contemporaneously frozen challenger predictions.', 'Original forecast versions changed across Weeks 1–4; this diagnostic does not validate the current no-rest model.', 'Detailed gameplay inputs were not frozen before those historical games, so they are not backfilled into historical training features.', 'Fresh independently paired candidate outcomes and existing governance are required before production promotion.'],results};
fs.writeFileSync('data/market/postgame-model-learning-backtest-2026.json',JSON.stringify(report,null,2)+'\n');
for(const r of results)console.log(JSON.stringify({market:r.market,week:r.week,base:r.base,candidate:r.candidate}));
