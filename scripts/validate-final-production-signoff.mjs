import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const exists=p=>fs.existsSync(path.join(root,p));
const contract=read('data/calibration/final-production-signoff-2026.json');
const blocked=[];

const requiredFiles={
  verified_weekly_schedule:'data/calibration/weekly-event-schedule-2026.json',
  football_context_gate:'scripts/validate-step28-week1-context-activation.mjs',
  weekly_player_projections:'scripts/build-weekly-projection-generator.mjs',
  weekly_probability_distributions:'scripts/build-weekly-probability-engine.mjs',
  immutable_forecast_freeze:'scripts/capture-weekly-forecast-snapshots.mjs',
  weekly_game_projections:'scripts/build-weekly-game-projections.mjs',
  live_market_snapshots:'scripts/ingest-live-market-snapshots.mjs',
  game_recommendations:'scripts/build-game-market-recommendations.mjs',
  player_prop_recommendations:'scripts/build-player-prop-recommendations.mjs',
  unified_opportunities:'scripts/build-unified-opportunity-engine.mjs',
  postgame_settlement:'scripts/settle-weekly-forecast-results.mjs',
  live_calibration:'scripts/build-live-week-calibration.mjs',
  calibration_governance:'scripts/build-calibration-governance-status.mjs',
  pipeline_health:'scripts/check-weekly-pipeline-health.mjs',
  real_season_validation:'scripts/validate-real-season-validation.mjs',
  production_readiness:'scripts/build-production-readiness-status.mjs',
  operations_dashboard:'operations-dashboard.html'
};
for(const c of contract.required_components||[]) if(!requiredFiles[c]||!exists(requiredFiles[c])) blocked.push(`missing required component ${c}`);

const orchestrator=fs.readFileSync(path.join(root,'.github/workflows/step24-weekly-production-orchestration.yml'),'utf8');
const freeze=fs.readFileSync(path.join(root,'scripts/capture-weekly-forecast-snapshots.mjs'),'utf8');
const context=fs.readFileSync(path.join(root,'scripts/normalize-weekly-football-context.mjs'),'utf8');
const gameRec=fs.readFileSync(path.join(root,'scripts/build-game-market-recommendations.mjs'),'utf8');
const propRec=fs.readFileSync(path.join(root,'scripts/build-player-prop-recommendations.mjs'),'utf8');
const ops=fs.readFileSync(path.join(root,'operations-dashboard.html'),'utf8');

const checks=[
  [/schedule:\s*\n\s*- cron:/,orchestrator,'Step 24 must retain the sole autonomous production schedule'],
  [/concurrency:\s*\n\s*group:\s*weekly-production-orchestration\s*\n\s*cancel-in-progress:\s*false/,orchestrator,'shared anti-race lock missing'],
  [/Stage 3 - freeze first valid pregame forecasts/,orchestrator,'forecast freeze missing from lifecycle'],
  [/Stage 8 - settle any newly final frozen forecasts/,orchestrator,'settlement missing from lifecycle'],
  [/frozen:true/,freeze,'freeze rows must be frozen'],
  [/split:'HOLDOUT'/,freeze,'freeze rows must be HOLDOUT'],
  [/attempted frozen forecast rewrite/,freeze,'frozen rewrite guard missing'],
  [/sportsbook_inputs_used!==false/,context,'context sportsbook contamination guard missing'],
  [/PICK/,gameRec,'game recommendation decision layer missing'],
  [/PASS/,gameRec,'game recommendation PASS path missing'],
  [/PICK/,propRec,'player prop recommendation decision layer missing'],
  [/PASS/,propRec,'player prop recommendation PASS path missing'],
  [/Operations/i,ops,'Operations surface missing']
];
for(const [re,text,msg] of checks) if(!re.test(text)) blocked.push(msg);

const generated_at=new Date().toISOString();
const result=blocked.length?'BLOCKED':'PASS';
const report={generated_at,result,step:30,season:2026,platform_state_on_pass:contract.platform_state_on_pass,required_components:(contract.required_components||[]).length,locked_invariants:(contract.locked_invariants||[]).length,blocked};
fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});
fs.writeFileSync(path.join(root,'guardrails/final-production-signoff-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);
