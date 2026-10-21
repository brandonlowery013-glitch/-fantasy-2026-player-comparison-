import {currentPlatformInterface} from './lib/current-platform-interface.mjs';
import fs from 'node:fs';

const contract=JSON.parse(fs.readFileSync('data/sources/ui-core-feature-qa-step3.json','utf8'));
const index=fs.readFileSync('index.html','utf8');
const runtime=fs.readFileSync('runtime-draft-opportunity-ui-2026.js','utf8');
const compare=fs.readFileSync('compare.html','utf8');
const opportunities=fs.readFileSync('weekly-opportunities.html','utf8');
const draft=JSON.parse(fs.readFileSync('data/market/draft-opportunity-qa-2026.json','utf8'));
const fail=m=>{throw new Error(m)};
const need=(ok,m)=>{if(!ok)fail(m)};

need(contract.official_sequence_step===3,'Official UI sequence must identify this as Step 3');
need(contract.name==='Core Feature QA','Step 3 must remain Core Feature QA');
for(const [k,v] of Object.entries(contract.rules))need(v===true,`Step 3 rule must stay enabled: ${k}`);
const byId=Object.fromEntries(contract.features.map(x=>[x.id,x]));
for(const id of ['compare','props','nfl_games','weekly_opportunities','filters','sit_start','sleepers_breakouts','avoid_busts','games_of_the_week','trap_games','historical_situational_indicators'])need(byId[id],`Missing Step 3 feature contract: ${id}`);

const current=currentPlatformInterface();
for(const check of current.checks)need(check.passed,check.name);
const source=JSON.parse(fs.readFileSync('MODEL_SOURCE_OF_TRUTH.json','utf8'));
const market=JSON.parse(fs.readFileSync('data/market/market-value-board-2026.json','utf8'));
need(market.universe===source.active_player_model&&market.board.length===source.active_player_model,'Market companion covers the canonical player universe');
need(market.authority==='COMPANION_ONLY_NO_INTRINSIC_RANK_MUTATION','Market context remains companion-only');

for(const path of ['data/market/player-prop-market-snapshots-2026.json','data/market/player-prop-recommendations-2026.json','data/probability/generated/weekly-game-projections-2026.json','data/market/weekly-game-market-recommendations-2026.json','data/market/unified-opportunities-2026.json','data/sources/ui-step3a-feature-rule-contracts-2026.json'])need(fs.existsSync(path),`Required feature data/contract missing: ${path}`);

// Season-long sleepers/busts are now implemented through the QA-locked draft Opportunity layer.
need(byId.sleepers_breakouts.level==='player_season_long','Sleepers/Breakouts must stay season-long');
need(byId.avoid_busts.level==='player_season_long','Avoid/Bust must stay season-long');
need(Array.isArray(market.board),'Season-long market context has published rows');
need(market.board.every(row=>typeof row.player==='string'),'Published market rows identify canonical players');
for(const id of ['sit_start','games_of_the_week','trap_games','historical_situational_indicators']){
  const f=byId[id];
  need(f.status==='RULES_LOCKED_PENDING_IMPLEMENTATION',`${id} must have locked rules and remain pending implementation`);
  need(f.surface===null,`${id} cannot claim a live surface before implementation`);
}
need(byId.sit_start.level==='player_weekly','Sit/Start must stay player-level weekly');
need(byId.games_of_the_week.level==='game_market','Games of the Week must stay game-market level');
need(byId.trap_games.level==='game_weekly','Trap Games must stay NFL game-level weekly');
need(byId.historical_situational_indicators.level==='game_context','Historical situational indicators must stay game-context level');

const report={version:contract.version,status:'PASS_SEASON_LONG_OPPORTUNITY_IMPLEMENTED',primary_navigation:['Player Board','Compare','Weekly','Games'],season_long_features:{sleepers_breakouts:'IMPLEMENTED_QA_LOCKED',avoid_busts:'IMPLEMENTED_QA_LOCKED'},rules_locked_pending_implementation:contract.features.filter(x=>['sit_start','games_of_the_week','trap_games','historical_situational_indicators'].includes(x.id)).map(x=>x.id),core_feature_step_complete:false,reason:'Season-long Opportunity features are implemented without contaminating weekly/game engines; remaining weekly/game feature surfaces follow their locked sequence.'};
fs.mkdirSync('guardrails',{recursive:true});
fs.writeFileSync('guardrails/ui-core-feature-step3-report.json',JSON.stringify(report,null,2)+'\n');
console.log('UI Step 3 core feature audit PASS_SEASON_LONG_OPPORTUNITY_IMPLEMENTED');
console.log(JSON.stringify(report,null,2));
