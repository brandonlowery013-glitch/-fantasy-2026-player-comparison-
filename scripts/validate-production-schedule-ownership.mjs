import fs from 'node:fs';
const legacy=[
'.github/workflows/step8-weekly-forecast-capture.yml',
'.github/workflows/step9-weekly-football-ingestion.yml',
'.github/workflows/step11-postgame-forecast-settlement.yml',
'.github/workflows/step14-weekly-game-projections.yml',
'.github/workflows/step15-game-market-recommendations.yml',
'.github/workflows/step16-player-prop-recommendations.yml',
'.github/workflows/step17-unified-opportunity-engine.yml',
'.github/workflows/step19-calibration-governance.yml',
'.github/workflows/step20-weekly-pipeline-health.yml',
'.github/workflows/step22-real-season-validation.yml',
'.github/workflows/step23-live-market-ingestion.yml'
];
const blocked=[];
for(const p of legacy){const t=fs.readFileSync(p,'utf8');if(/\n\s*schedule:\s*\n/.test(t))blocked.push(`${p} still owns autonomous schedule`);}
for(const p of ['.github/workflows/step8-weekly-forecast-capture.yml','.github/workflows/step9-weekly-football-ingestion.yml','.github/workflows/step11-postgame-forecast-settlement.yml','.github/workflows/step14-weekly-game-projections.yml','.github/workflows/step15-game-market-recommendations.yml','.github/workflows/step16-player-prop-recommendations.yml','.github/workflows/step17-unified-opportunity-engine.yml','.github/workflows/step23-live-market-ingestion.yml']){const t=fs.readFileSync(p,'utf8');if(!t.includes('group: weekly-production-orchestration'))blocked.push(`${p} manual writer missing global concurrency group`);}
const orchestration=fs.readFileSync('.github/workflows/step24-weekly-production-orchestration.yml','utf8');
if(!/\n\s*schedule:\s*\n/.test(orchestration))blocked.push('Step 24 missing autonomous schedule');
if(!orchestration.includes('group: weekly-production-orchestration'))blocked.push('Step 24 missing global concurrency group');
if(!orchestration.includes('git commit -m "Run ordered weekly production lifecycle"'))blocked.push('Step 24 missing atomic lifecycle commit');
const report={generated_at:new Date().toISOString(),result:blocked.length?'BLOCKED':'PASS',legacy_schedules_checked:legacy.length,blocked};fs.mkdirSync('guardrails',{recursive:true});fs.writeFileSync('guardrails/production-schedule-ownership-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(blocked.length)process.exit(1);
