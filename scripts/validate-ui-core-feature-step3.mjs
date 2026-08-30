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

need(index.includes('runtime-draft-opportunity-ui-2026.js'),'Player Board entry point must load the Opportunity UI runtime');
need(compare.includes('runtime-comparison-decision-2026.js'),'Compare must load the locked decision runtime');
need(compare.includes('runtime-comparison-opportunity-ui-2026.js'),'Compare must load the season-long Opportunity context runtime');
need(runtime.includes('opportunityFilter'),'Player filters include the QA-locked market-read layer');
need(runtime.includes('gamesPropsMount'),'Props remain implemented but nested under Games');
need(runtime.includes('weekly-opportunities.html'),'Weekly Opportunities remain implemented but nested under Weekly');
need(opportunities.includes('unified-opportunities-2026.json'),'Weekly Opportunities must consume the unified weekly output ledger');
need(draft.universe===162&&draft.authority==='COMPANION_ONLY_NO_INTRINSIC_RANK_MUTATION','Season-long Opportunity layer must cover 162 and remain companion-only');
need((draft.actionable?.length||0)+(draft.fair_players?.length||0)===162,'Season-long Opportunity QA must account for all 162 players');

for(const path of ['data/market/player-prop-market-snapshots-2026.json','data/market/player-prop-recommendations-2026.json','data/probability/generated/weekly-game-projections-2026.json','data/market/weekly-game-market-recommendations-2026.json','data/market/unified-opportunities-2026.json','data/sources/ui-step3a-feature-rule-contracts-2026.json'])need(fs.existsSync(path),`Required feature data/contract missing: ${path}`);

// Season-long sleepers/busts are now implemented through the QA-locked draft Opportunity layer.
need(byId.sleepers_breakouts.level==='player_season_long','Sleepers/Breakouts must stay season-long');
need(byId.avoid_busts.level==='player_season_long','Avoid/Bust must stay season-long');
need(draft.counts.SLEEPER+draft.counts['DEEP SLEEPER']+draft.counts['DEEP STASH']>0,'Season-long sleeper surface has QA-approved players');
need(draft.counts.FADE>0&&draft.counts.REACH>0,'Season-long avoid/bust surface has QA-approved fade/reach players');
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
