import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const contract=JSON.parse(fs.readFileSync(path.join(root,'data/sources/comparison-decision-2026.json'),'utf8'));
fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});

const blocked=[];
const finite=x=>Number.isFinite(Number(x));
if(contract.status!=='STEP_5_COMPARISON_DECISION_LOCKED')blocked.push('Step 5 contract status is not locked');
if(contract.mode!=='SHADOW_ONLY'||contract.actionable!==false)blocked.push('Step 5 must remain SHADOW_ONLY/non-actionable');

const required=['expected_production','ceiling','role_volume','offensive_environment','risk_safety'];
let sum=0;
for(const k of required){const v=contract.head_to_head_weights?.[k];if(!finite(v)||Number(v)<0)blocked.push(`Invalid/missing weight ${k}`);else sum+=Number(v);}
if(Math.abs(sum-1)>1e-10)blocked.push(`Head-to-head weights must sum to 1; got ${sum}`);

const sep=contract.price_separation||{};
if(sep.head_to_head_may_use_adp!==false)blocked.push('ADP must be excluded from head-to-head scoring');
if(sep.head_to_head_may_use_market_value_label!==false)blocked.push('Market-value labels must be excluded from head-to-head scoring');
if(sep.head_to_head_may_use_sportsbook_data!==false)blocked.push('Sportsbook data must be excluded from head-to-head scoring');
const labels=sep.standalone_price_labels||[];
for(const x of ['BUY','FAIR','REACH','FADE'])if(!labels.includes(x))blocked.push(`Standalone price labels missing ${x}`);

const bands=contract.edge_bands||[];
const expected=['TOSS_UP','SLIGHT_EDGE','EDGE','CLEAR_EDGE'];
if(bands.length!==expected.length)blocked.push('Expected four edge bands');
let cursor=0;
for(let i=0;i<bands.length;i++){
  const b=bands[i];
  if(b.label!==expected[i])blocked.push(`Unexpected edge band order at ${i}`);
  if(!finite(b.min_abs_gap)||!finite(b.max_abs_gap_exclusive)||Number(b.max_abs_gap_exclusive)<=Number(b.min_abs_gap))blocked.push(`Invalid edge band ${b.label}`);
  if(Math.abs(Number(b.min_abs_gap)-cursor)>1e-10)blocked.push(`Edge bands not contiguous before ${b.label}`);
  cursor=Number(b.max_abs_gap_exclusive);
}
if(cursor<1)blocked.push('Edge bands do not cover full normalized gap range');

const forbidden=(contract.public_language?.forbidden_terms||[]).map(x=>String(x).toLowerCase());
if(!forbidden.includes('true value'))blocked.push('Public-language contract must explicitly forbid True Value');
if(contract.public_language?.max_sentences!==3)blocked.push('Explanation sentence cap must remain 3');
if(contract.step_5a_status!=='COMPLETE'||contract.step_5b_status!=='COMPLETE')blocked.push('Step 5A/5B status not COMPLETE');

const report={generated_at:new Date().toISOString(),result:blocked.length?'BLOCKED':'PASS',mode:contract.mode,actionable:contract.actionable,head_to_head_weight_sum:sum,edge_band_count:bands.length,adp_allowed_in_head_to_head:sep.head_to_head_may_use_adp,sportsbook_allowed_in_head_to_head:sep.head_to_head_may_use_sportsbook_data,blocked};
fs.writeFileSync(path.join(root,'guardrails/comparison-decision-contract-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);
