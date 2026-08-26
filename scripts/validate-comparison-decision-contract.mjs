import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const contract=JSON.parse(fs.readFileSync(path.join(root,'data/sources/comparison-decision-2026.json'),'utf8'));
const risk=JSON.parse(fs.readFileSync(path.join(root,'data/sources/preseason-comparison-risk-2026.json'),'utf8'));
const runtime=fs.readFileSync(path.join(root,'runtime-comparison-decision-2026.js'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});

const blocked=[];
const finite=x=>Number.isFinite(Number(x));
if(contract.status!=='STEP_5_COMPARISON_DECISION_LOCKED')blocked.push('Step 5 contract status is not locked');
if(contract.mode!=='PRODUCTION_COMPARISON_RUNTIME'||contract.actionable!==true)blocked.push('Step 5 production runtime is not active/actionable');
if(contract.production_gate?.step_6a_calibration_complete!==true)blocked.push('Step 6A calibration gate not complete');
if(contract.production_gate?.step_6b_preseason_risk_bridge_complete!==true)blocked.push('Step 6B risk bridge gate not complete');
if(risk.actionable_for_comparison_runtime!==true)blocked.push('Preseason risk bridge not production-ready');

const required=['expected_production','ceiling','role_volume','offensive_environment','risk_safety'];
let sum=0;
for(const k of required){const v=contract.head_to_head_weights?.[k];if(!finite(v)||Number(v)<0)blocked.push(`Invalid/missing weight ${k}`);else sum+=Number(v);}
if(Math.abs(sum-1)>1e-10)blocked.push(`Head-to-head weights must sum to 1; got ${sum}`);
const sep=contract.price_separation||{};
if(sep.head_to_head_may_use_adp!==false)blocked.push('ADP must be excluded from head-to-head scoring');
if(sep.head_to_head_may_use_market_value_label!==false)blocked.push('Market-value labels must be excluded from head-to-head scoring');
if(sep.head_to_head_may_use_sportsbook_data!==false)blocked.push('Sportsbook data must be excluded from head-to-head scoring');
for(const x of ['BUY','FAIR','REACH','FADE'])if(!(sep.standalone_price_labels||[]).includes(x))blocked.push(`Standalone price labels missing ${x}`);

const bands=contract.edge_bands||[],expected=['TOSS_UP','SLIGHT_EDGE','EDGE','CLEAR_EDGE'];
if(bands.length!==4)blocked.push('Expected four edge bands');
let cursor=0;
for(let i=0;i<bands.length;i++){const b=bands[i];if(b.label!==expected[i])blocked.push(`Unexpected edge band order at ${i}`);if(!finite(b.min_abs_gap)||!finite(b.max_abs_gap_exclusive)||Number(b.max_abs_gap_exclusive)<=Number(b.min_abs_gap))blocked.push(`Invalid edge band ${b.label}`);if(Math.abs(Number(b.min_abs_gap)-cursor)>1e-10)blocked.push(`Edge bands not contiguous before ${b.label}`);cursor=Number(b.max_abs_gap_exclusive);}
if(cursor<1)blocked.push('Edge bands do not cover full normalized gap range');

for(const token of ['0.35*clamp(Number(p.pd)/10)','0.20*clamp(Number(p.ce)/10)','0.15*clamp(Number(p.r)/10)','0.10*clamp(Number(p.e)/10)','0.20*clamp(safety)','a<0.035','a<0.09','a<0.18'])if(!runtime.includes(token))blocked.push(`Runtime missing locked token: ${token}`);
for(const bad of ['p.ad','p.px','sportsbook','implied'])if(runtime.includes(bad))blocked.push(`Better Player runtime contains forbidden market token: ${bad}`);
if(!runtime.includes('Number(p.a)*0.45+Number(p.rl)*0.35+Number(p.su)*0.20'))blocked.push('Runtime risk bridge formula drifted');
if(!runtime.includes("usesDraftPrice:false")||!runtime.includes("usesSportsbook:false"))blocked.push('Runtime independence flags missing');
if(!runtime.includes("label:'Toss-up'")||!runtime.includes('winner:null'))blocked.push('Runtime toss-up must not name a winner');
if(!index.includes('runtime-comparison-decision-2026.js'))blocked.push('Production entry does not load Step 6B runtime');
if(contract.public_language?.max_sentences!==3)blocked.push('Explanation sentence cap must remain 3');
if(contract.step_5a_status!=='COMPLETE'||contract.step_5b_status!=='COMPLETE'||contract.step_6b_runtime_status!=='ACTIVE')blocked.push('Step 5/6B completion state invalid');

const report={generated_at:new Date().toISOString(),result:blocked.length?'BLOCKED':'PASS',mode:contract.mode,actionable:contract.actionable,head_to_head_weight_sum:sum,edge_band_count:bands.length,production_runtime_loaded:index.includes('runtime-comparison-decision-2026.js'),adp_allowed_in_head_to_head:sep.head_to_head_may_use_adp,sportsbook_allowed_in_head_to_head:sep.head_to_head_may_use_sportsbook_data,blocked};
fs.writeFileSync(path.join(root,'guardrails/comparison-decision-contract-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);
