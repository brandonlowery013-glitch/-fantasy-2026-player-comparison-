import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const contract=read('data/sources/preseason-comparison-risk-2026.json');
const weekly=read('data/sources/risk-profile-2026.json');
fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});

const blocked=[];
const inputs=contract.inputs||{};
const expected={availability:{field:'a',weight:0.45},reliability:{field:'rl',weight:0.35},sustainability:{field:'su',weight:0.20}};
for(const [k,v] of Object.entries(expected)){
  if(!inputs[k]) blocked.push(`missing input ${k}`);
  else {
    if(inputs[k].field!==v.field) blocked.push(`${k} field must be ${v.field}`);
    if(Number(inputs[k].weight)!==v.weight) blocked.push(`${k} weight must be ${v.weight}`);
  }
}
const weightSum=Object.values(inputs).reduce((s,x)=>s+Number(x.weight||0),0);
if(Math.abs(weightSum-1)>1e-12) blocked.push(`input weights sum to ${weightSum}, expected 1`);
if(contract.mode!=='PRODUCTION_READY_PRESEASON') blocked.push('mode must be PRODUCTION_READY_PRESEASON');
if(contract.actionable_for_comparison_runtime!==true) blocked.push('comparison runtime must be allowed');
if(contract.replaces_step_4_weekly_risk!==false) blocked.push('must not replace Step 4 weekly risk');
if(contract.risk_bands_source!=='data/sources/risk-profile-2026.json') blocked.push('risk bands must inherit locked Step 4 labels');
const p=contract.provenance_rules||{};
for(const k of ['adp_allowed','market_value_label_allowed','sportsbook_allowed','raw_injury_status_text_allowed_as_extra_penalty','projection_mutation_allowed','ceiling_mutation_allowed','role_mutation_allowed','environment_mutation_allowed']) if(p[k]!==false) blocked.push(`${k} must be false`);
if(p.football_only!==true) blocked.push('football_only must be true');
const rel=contract.relationship_to_step_4||{};
if(rel.weekly_step_4_remains_authoritative_when_populated!==true) blocked.push('weekly Step 4 must remain authoritative when populated');
if(rel.this_profile_does_not_modify_step_4!==true) blocked.push('bridge may not modify Step 4');
if(!String(rel.production_resolution_rule||'').includes('Never combine')) blocked.push('resolution rule must explicitly prohibit combining risk scores');
if(weekly.status!=='STEP_4_RISK_PROFILE_LOCKED') blocked.push('Step 4 source is not locked');

const report={generated_at:new Date().toISOString(),result:blocked.length?'BLOCKED':'PASS',contract_status:contract.status,mode:contract.mode,weight_sum:weightSum,step_4_status:weekly.status,blocked};
fs.writeFileSync(path.join(root,'guardrails/preseason-comparison-risk-contract-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);
