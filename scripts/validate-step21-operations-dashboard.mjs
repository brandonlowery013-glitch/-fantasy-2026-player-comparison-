import fs from 'node:fs';
const must=(ok,msg)=>{if(!ok)throw new Error(msg)};
const html=fs.readFileSync('operations-dashboard.html','utf8');
const index=fs.readFileSync('index.html','utf8');
const required=[
  'data/calibration/weekly-pipeline-status-2026.json',
  'data/calibration/calibration-governance-status-2026.json',
  'data/market/unified-opportunities-2026.json',
  'data/market/player-prop-recommendations-2026.json',
  'data/market/weekly-game-market-recommendations-2026.json',
  'data/calibration/weekly-forecast-capture-2026.json',
  'data/probability/generated/weekly-game-projections-2026.json'
];
for(const p of required)must(html.includes(p),`dashboard missing ${p}`);
must(!index.includes('operations-dashboard.html'),'public shell must not expose Operations dashboard');
must(!/\bOperations\b/.test(index),'public shell must not expose Operations wording');
must(html.includes('read-only')&&html.includes('does not recalculate'),'dashboard must explicitly remain read-only');
for(const forbidden of ['probability_edge >=','expected_value >=','0.03','0.02','americanOddsTo','noVig','promoteChallenger'])must(!html.includes(forbidden),`dashboard duplicates decision/model logic: ${forbidden}`);
const pipeline=JSON.parse(fs.readFileSync('data/calibration/weekly-pipeline-status-2026.json','utf8'));
const gov=JSON.parse(fs.readFileSync('data/calibration/calibration-governance-status-2026.json','utf8'));
must(pipeline.actionable===false,'pipeline health must remain non-actionable');
must(gov.actionable===false,'calibration governance must remain non-actionable');
must(['READY','WAITING_FOR_SOURCE','WAITING_FOR_CONTEXT','WAITING_FOR_FORECAST','WAITING_FOR_FINAL','WAITING_FOR_SETTLEMENT','STALE','BLOCKED'].includes(pipeline.overall_status),'invalid pipeline state');
const report={step:21,status:'PASS',public_operations_exposed:false,admin_dashboard_present:true,read_only:true,upstream_ledgers:required,pipeline_status:pipeline.overall_status,calibration_decision:gov.decision,logic_duplicated:false};
fs.mkdirSync('guardrails',{recursive:true});fs.writeFileSync('guardrails/step21-operations-dashboard-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
