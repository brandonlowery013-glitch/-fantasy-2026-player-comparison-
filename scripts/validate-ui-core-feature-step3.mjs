import fs from 'node:fs';

const contract=JSON.parse(fs.readFileSync('data/sources/ui-core-feature-qa-step3.json','utf8'));
const index=fs.readFileSync('index.html','utf8');
const compare=fs.readFileSync('compare.html','utf8');
const opportunities=fs.readFileSync('weekly-opportunities.html','utf8');
const fail=m=>{throw new Error(m)};
const need=(ok,m)=>{if(!ok)fail(m)};

need(contract.official_sequence_step===3,'Official UI sequence must identify this as Step 3');
need(contract.name==='Core Feature QA','Step 3 must remain Core Feature QA');
for(const [k,v] of Object.entries(contract.rules)) need(v===true,`Step 3 rule must stay enabled: ${k}`);

const byId=Object.fromEntries(contract.features.map(x=>[x.id,x]));
for(const id of ['compare','props','nfl_games','weekly_opportunities','filters','sit_start','sleepers_breakouts','avoid_busts','games_of_the_week','trap_games','historical_situational_indicators']) need(byId[id],`Missing Step 3 feature contract: ${id}`);

need(index.includes('data-route="compare"')&&index.includes('compare.html'),'Compare route/surface missing');
need(compare.includes('runtime-comparison-decision-2026.js'),'Compare must load the locked decision runtime');
need(index.includes('data-route="props"'),'Props route missing');
need(index.includes('data-route="games"'),'NFL Games route missing');
need(index.includes('id="search"')&&index.includes('id="pos"'),'Core player filters missing');
need(index.includes('weekly-opportunities.html'),'Weekly Opportunities navigation missing');
need(opportunities.includes('unified-opportunities-2026.json'),'Weekly Opportunities must consume the unified output ledger');

for(const path of [
  'data/market/player-prop-market-snapshots-2026.json',
  'data/market/player-prop-recommendations-2026.json',
  'data/probability/generated/weekly-game-projections-2026.json',
  'data/market/weekly-game-market-recommendations-2026.json',
  'data/market/unified-opportunities-2026.json',
  'data/sources/ui-step3a-feature-rule-contracts-2026.json'
]) need(fs.existsSync(path),`Required feature data/contract missing: ${path}`);

for(const id of ['sit_start','sleepers_breakouts','avoid_busts','games_of_the_week','trap_games','historical_situational_indicators']){
  const f=byId[id];
  need(f.status==='RULES_LOCKED_PENDING_IMPLEMENTATION',`${id} must have locked rules and remain pending implementation`);
  need(f.surface===null,`${id} cannot claim a live surface before implementation`);
}

need(byId.sit_start.level==='player_weekly','Sit/Start must stay player-level weekly');
need(byId.sleepers_breakouts.level==='player_season_long','Sleepers/Breakouts must stay season-long');
need(byId.avoid_busts.level==='player_season_long','Avoid/Bust must stay season-long');
need(byId.games_of_the_week.level==='game_market','Games of the Week must stay game-market level');
need(byId.trap_games.level==='game_weekly','Trap Games must stay NFL game-level weekly');
need(byId.historical_situational_indicators.level==='game_context','Historical situational indicators must stay game-context level');

const report={
  version:contract.version,
  status:'PASS_RULES_LOCKED_IMPLEMENTATION_PENDING',
  ready_for_qa:contract.features.filter(x=>x.status==='READY_FOR_QA').map(x=>x.id),
  rules_locked_pending_implementation:contract.features.filter(x=>x.status==='RULES_LOCKED_PENDING_IMPLEMENTATION').map(x=>x.id),
  core_feature_step_complete:false,
  reason:'Step 3A feature definitions are locked. New feature surfaces and the validated mathematical foundation/recalculation pipeline still must be implemented and QA-tested.'
};
fs.mkdirSync('guardrails',{recursive:true});
fs.writeFileSync('guardrails/ui-core-feature-step3-report.json',JSON.stringify(report,null,2)+'\n');
console.log('UI Step 3 core feature audit PASS_RULES_LOCKED_IMPLEMENTATION_PENDING');
console.log(JSON.stringify(report,null,2));
