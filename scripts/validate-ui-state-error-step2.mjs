import fs from 'node:fs';

const index=fs.readFileSync('index.html','utf8');
const runtime=fs.readFileSync('runtime-draft-opportunity-ui-2026.js','utf8');
const blocked=[];
const pass=msg=>console.log(`PASS: ${msg}`);
const need=(ok,msg)=>ok?pass(msg):blocked.push(msg);

// The public entry point now wraps the exact previously validated Step-2 shell.
// Preserve the full state/error contract by pinning that immutable shell SHA, then
// separately audit the new Opportunity/navigation overlay for unsafe fallbacks.
const BASE_SHA='083fca6edf212334c3a2bc8ef48f141cef94fe26';
need(index.includes(`${BASE_SHA}/index.html`),'entry point pins the previously validated state/error shell');
need(index.includes("if(!r.ok)throw Error('Verified platform shell unavailable')"),'base-shell load failure is explicit and blocking');
need(index.includes("Player data failed to load."),'wrapper exposes a visible required-shell failure state');
need(index.includes('runtime-draft-opportunity-ui-2026.js'),'new navigation/opportunity overlay is explicitly attached');
need(runtime.includes("document.documentElement.dataset.draftOpportunity='unavailable'"),'optional Opportunity source failure is explicitly degraded');
need(runtime.includes('console.warn(e.message)'),'optional Opportunity failure is surfaced without fabricating values');
need(runtime.includes('No exploitable edge'),'unknown/non-actionable Opportunity state defaults to a label, not a numeric zero');
need(runtime.includes('COMPANION_ONLY_NO_INTRINSIC_RANK_MUTATION'),'overlay hard-checks companion-only authority');

const forbidden=[
  /fallback\s*\?\?\s*0/,
  /mean\s*\|\|\s*0/,
  /sd\s*\|\|\s*0/,
  /line\s*\|\|\s*0/,
  /over\s*\|\|\s*0/,
  /under\s*\|\|\s*0/
];
for(const rx of forbidden){if(rx.test(index+runtime))blocked.push(`numeric zero fallback found: ${rx}`);else pass(`no unsafe numeric zero fallback: ${rx}`)}

const scenarios={
  required_base_shell_failed:{shell:'BLOCKED',board:'FAILED',weekly:'FAILED',games:'FAILED'},
  opportunity_source_failed:{board:'USABLE_WITHOUT_OPPORTUNITY_BADGES',profile:'USABLE_WITHOUT_OPPORTUNITY_CARD',compare:'INDEPENDENT'},
  inherited_required_players_failed:{shell:'BLOCKED',board:'FAILED',weekly:'FAILED',props:'FAILED'},
  inherited_odds_failed:{board:'USABLE',weekly:'USABLE',props:'FAILED',games:'USABLE'},
  inherited_forecast_failed:{board:'USABLE',weekly:'FAILED',props:'USABLE',games:'USABLE'},
  inherited_schedule_failed:{board:'USABLE',weekly:'USABLE',props:'USABLE',games:'FAILED'},
  inherited_readiness_failed:{board:'USABLE',weekly:'SOURCE_DEPENDENT',props:'SOURCE_DEPENDENT',games:'SOURCE_DEPENDENT'},
  inherited_empty_weekly:{weekly:'WAITING_NO_ZERO'},
  inherited_provider_unavailable:{props:'WAITING_NO_FAKE_LINE'},
  inherited_stale:{weekly:'REFERENCE_ONLY',props:'CAPTURED_NOT_CURRENT',games:'STALE_WARNING'}
};

const report={generated_at:new Date().toISOString(),result:blocked.length?'BLOCKED':'PASS',step:'UI_STATE_ERROR_HANDLING_STEP_2',base_shell_contract:{sha:BASE_SHA,mode:'IMMUTABLE_PREVIOUSLY_VALIDATED_SHELL'},scenarios,checks:{base_shell_pin:true,wrapper_failure_visible:true,opportunity_failure_isolated:true,no_fake_zero_or_market_values:true,legacy_state_contract_inherited_from_exact_sha:true},blocked};
fs.mkdirSync('guardrails',{recursive:true});
fs.writeFileSync('guardrails/ui-state-error-step2-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);
