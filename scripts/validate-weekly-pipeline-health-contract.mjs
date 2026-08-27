import fs from 'node:fs';
const src='data/sources/weekly-pipeline-health-2026.json';
const out='guardrails/weekly-pipeline-health-contract-report.json';
const x=JSON.parse(fs.readFileSync(src,'utf8'));
const required=['READY','WAITING_FOR_SOURCE','WAITING_FOR_FORECAST','WAITING_FOR_FINAL','WAITING_FOR_SETTLEMENT','STALE','BLOCKED'];
const checks={schema:x.schema_version==='1.0.0',season:x.season===2026,observational:x.mode==='OBSERVATIONAL_ONLY'&&x.actionable===false,statuses:required.every(s=>x.allowed_statuses?.includes(s)),no_market:x.rules?.market_inputs_allowed===false,no_model_mutation:x.rules?.health_layer_may_mutate_model===false,no_promotion:x.rules?.health_layer_may_promote_challenger===false,no_forecast_rewrite:x.rules?.health_layer_may_rewrite_frozen_forecasts===false,no_settlement_rewrite:x.rules?.health_layer_may_rewrite_settlements===false,inputs:['schedule','football_context','forecasts','settlements','calibration','governance'].every(k=>typeof x.inputs?.[k]==='string')};
const ok=Object.values(checks).every(Boolean);
fs.mkdirSync('guardrails',{recursive:true});
fs.writeFileSync(out,JSON.stringify({schema_version:'1.0.0',step:20,ok,checks},null,2)+'\n');
if(!ok){console.error(checks);process.exit(1)}
console.log('Step 20 pipeline health contract valid');
