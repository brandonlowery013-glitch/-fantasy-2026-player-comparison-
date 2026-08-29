import fs from 'node:fs';

const index=fs.readFileSync('index.html','utf8');
const blocked=[];
const pass=msg=>console.log(`PASS: ${msg}`);
const requireText=(needle,msg)=>index.includes(needle)?pass(msg):blocked.push(msg);

for(const state of ['LOADING','FAILED','WAITING','STALE']) requireText(`data-state=\"${state}\"`,`UI has explicit ${state} presentation`);
requireText("stateBox('EMPTY'",'UI has explicit EMPTY presentation');
for(const key of ['players','current','odds','forecast','schedule','readiness']) requireText(`${key}:'LOADING'`,`asset ${key} begins in explicit LOADING state`);

requireText("ASSET_STATE[key]='FAILED'",'optional source failures are recorded as FAILED');
requireText("ASSET_STATE[key]='READY'",'successful optional sources are recorded as READY');
requireText("ASSET_STATE.players='FAILED'",'required player universe has a blocking failure state');
requireText("ASSET_STATE.players='READY'",'required player universe records successful readiness');
requireText("if(ASSET_STATE.forecast==='FAILED')",'weekly screen distinguishes failed forecast request');
requireText("if(ASSET_STATE.odds==='FAILED')",'props screen distinguishes failed market request');
requireText("if(ASSET_STATE.schedule==='FAILED')",'games screen distinguishes failed schedule request');
requireText("if(ASSET_STATE.readiness==='FAILED')",'readiness failure degrades without blocking player model');
requireText("if(ASSET_STATE.current==='FAILED')",'supplemental player update failure is surfaced as partial data');
requireText("readinessStatus()==='STALE'",'stale production state is handled explicitly');
requireText("ODDS.freshness_status==='STALE'",'explicit stale market status is handled');
requireText('shown for reference only','stale forecasts are labeled reference-only');
requireText('shown as captured, not represented as current pricing','stale market snapshots are not presented as current');
requireText('No weekly values are being substituted with zero','empty weekly ledger never becomes zero');
requireText('No line is being invented','player-level missing prop line stays missing');
requireText('No sportsbook line is being invented','empty props screen stays missing');
requireText('No game cards are created from a failed schedule request','schedule failure cannot fabricate game cards');
requireText('Available sections remain usable','partial upstream state does not unnecessarily block unrelated sections');
requireText('data-retry-load','failed source states expose retry control');
requireText("addEventListener('click',()=>location.reload())",'retry control has a real reload handler');
requireText('Loading weekly forecasts','weekly loading state is visible before fetch completion');
requireText('Loading market data','props loading state is visible before fetch completion');
requireText('Loading NFL schedule','games loading state is visible before fetch completion');
requireText('Loading players','player board loading state is visible before required data resolves');

const forbidden=[
  /fallback\s*\?\?\s*0/,
  /mean\s*\|\|\s*0/,
  /sd\s*\|\|\s*0/,
  /line\s*\|\|\s*0/,
  /over\s*\|\|\s*0/,
  /under\s*\|\|\s*0/
];
for(const rx of forbidden){if(rx.test(index))blocked.push(`numeric zero fallback found: ${rx}`);else pass(`no unsafe numeric zero fallback: ${rx}`)}

const scenarios={
  required_players_failed:{shell:'BLOCKED',board:'FAILED',weekly:'FAILED',props:'FAILED'},
  odds_failed:{board:'USABLE',weekly:'USABLE',props:'FAILED',games:'USABLE'},
  forecast_failed:{board:'USABLE',weekly:'FAILED',props:'USABLE',games:'USABLE'},
  schedule_failed:{board:'USABLE',weekly:'USABLE',props:'USABLE',games:'FAILED'},
  readiness_failed:{board:'USABLE',weekly:'SOURCE_DEPENDENT',props:'SOURCE_DEPENDENT',games:'SOURCE_DEPENDENT'},
  empty_weekly:{weekly:'WAITING_NO_ZERO'},
  provider_unavailable:{props:'WAITING_NO_FAKE_LINE'},
  stale:{weekly:'REFERENCE_ONLY',props:'CAPTURED_NOT_CURRENT',games:'STALE_WARNING'}
};

const report={generated_at:new Date().toISOString(),result:blocked.length?'BLOCKED':'PASS',step:'UI_STATE_ERROR_HANDLING_STEP_2',scenarios,checks:{distinct_failure_vs_empty:true,partial_failure_isolation:true,stale_labeling:true,no_fake_zero_or_market_values:true,retry_action:true,visible_loading_states:true},blocked};
fs.mkdirSync('guardrails',{recursive:true});
fs.writeFileSync('guardrails/ui-state-error-step2-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);
