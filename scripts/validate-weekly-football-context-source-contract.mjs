import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const source=JSON.parse(fs.readFileSync(path.join(root,'data/sources/weekly-football-context-2026.json'),'utf8'));
const blocked=[];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
if(source.season!==2026)blocked.push(`season must remain 2026: ${source.season}`);
if(source.sportsbook_inputs_allowed!==false)blocked.push('sportsbook inputs must remain forbidden');
if(!same(source.scope,['role','injury','team_environment','opponent','qb_context']))blocked.push('weekly context scope changed unexpectedly');
for(const s of source.scope||[]){
  if(!source.sources?.[s])blocked.push(`missing source contract: ${s}`);
  const h=source.normalization_contract?.capture_freshness_hours?.[s];
  if(!Number.isFinite(Number(h))||Number(h)<=0)blocked.push(`missing/invalid freshness window: ${s}`);
}
if(source.normalization_contract?.missing_is_zero!==false)blocked.push('missing context must never become zero');
if(source.normalization_contract?.capture_freshness_hours?.injury!==12)blocked.push('injury freshness must remain 12 hours');
if(!String(source.promotion_rule||'').includes('SHADOW_ONLY'))blocked.push('SHADOW_ONLY promotion guard missing');
const report={generated_at:new Date().toISOString(),result:blocked.length?'BLOCKED':'PASS',status:source.status,season:source.season,scope:source.scope,step_2e_status:source.step_2e_status,blocked,safeguards:['Weekly context is football-side only.','Missing values remain missing.','Injury capture freshness is capped at 12 hours.','Every signal category has a declared freshness window.','Weekly context may only adjust SHADOW_ONLY projections after validation.']};
fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});
fs.writeFileSync(path.join(root,'guardrails/weekly-football-context-source-contract-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);
