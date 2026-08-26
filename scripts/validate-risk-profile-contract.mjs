import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const contract=JSON.parse(fs.readFileSync(path.join(root,'data/sources/risk-profile-2026.json'),'utf8'));
fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});

const blocked=[];
const finite=x=>Number.isFinite(Number(x));
if(contract.status!=='STEP_4_RISK_PROFILE_LOCKED')blocked.push('Step 4 contract status is not locked');
if(contract.mode!=='SHADOW_ONLY'||contract.actionable!==false)blocked.push('Step 4 must remain SHADOW_ONLY/non-actionable');
if(contract.sportsbook_inputs_allowed!==false)blocked.push('Sportsbook inputs must be forbidden');
if(contract.feedback_into_projection_math_allowed!==false)blocked.push('Risk feedback into projections must be forbidden');
if(contract.feedback_into_probability_math_allowed!==false)blocked.push('Risk feedback into football probabilities must be forbidden');
if(contract.feedback_into_ev_math_allowed!==false)blocked.push('Risk feedback into EV must be forbidden');

const components=contract.components||{};
const required=['distribution_downside','relative_uncertainty','projection_error_share','role_baseline_fragility','context_fragility'];
let weight=0;
for(const key of required){const c=components[key];if(!c)blocked.push(`Missing risk component ${key}`);else if(!finite(c.weight)||Number(c.weight)<0)blocked.push(`Invalid weight for ${key}`);else weight+=Number(c.weight);}
if(Math.abs(weight-1)>1e-10)blocked.push(`Risk component weights must sum to 1; got ${weight}`);
const frac=Number(components.distribution_downside?.threshold_fraction_of_mean);
if(!finite(frac)||frac<=0||frac>=1)blocked.push('Downside threshold fraction must be between 0 and 1');

const bands=contract.risk_bands||[];
if(bands.length!==4)blocked.push('Expected four risk bands');
let cursor=0;
for(const b of bands){if(!finite(b.min)||!finite(b.max_exclusive)||Number(b.min)<0||Number(b.max_exclusive)<=Number(b.min))blocked.push(`Invalid risk band ${b.label}`);if(Math.abs(Number(b.min)-cursor)>1e-8)blocked.push(`Risk bands are not contiguous before ${b.label}`);cursor=Number(b.max_exclusive);}
if(cursor<1)blocked.push('Risk bands do not cover score 1');

const rules=(contract.hard_block_rules||[]).join(' ').toLowerCase();
for(const token of ['sportsbook','projection','probability','ev','non-finite','outside [0,1]'])if(!rules.includes(token))blocked.push(`Hard-block contract missing ${token}`);
if(contract.step_4_status!=='COMPLETE')blocked.push('Step 4 status is not COMPLETE');

const report={generated_at:new Date().toISOString(),result:blocked.length?'BLOCKED':'PASS',mode:contract.mode,actionable:contract.actionable,component_weight_sum:weight,risk_band_count:bands.length,sportsbook_inputs_allowed:contract.sportsbook_inputs_allowed,feedback_into_projection_math_allowed:contract.feedback_into_projection_math_allowed,feedback_into_probability_math_allowed:contract.feedback_into_probability_math_allowed,feedback_into_ev_math_allowed:contract.feedback_into_ev_math_allowed,blocked};
fs.writeFileSync(path.join(root,'guardrails/risk-profile-contract-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);
