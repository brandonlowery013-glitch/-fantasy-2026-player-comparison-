import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const c=read('data/sources/automatic-football-context-adapters-2026.json');
const blocked=[];
const required=['role','injury','team_environment','opponent','qb_context'];
if(c.status!=='STEP_10_AUTOMATIC_CONTEXT_ADAPTERS_LOCKED')blocked.push('unexpected status');
if(c.mode!=='SHADOW_ONLY'||c.actionable!==false)blocked.push('adapter layer must remain SHADOW_ONLY/non-actionable');
if(c.sportsbook_inputs_allowed!==false)blocked.push('sportsbook inputs must be prohibited');
for(const t of required){const a=c.adapters?.[t];if(!a)blocked.push(`missing adapter ${t}`);else{if(!a.automated_source)blocked.push(`${t} missing automated_source`);if(a.numeric_adjustments_calibrated!==false)blocked.push(`${t} must not claim calibrated numeric adjustments`);}}
if(c.write_contract?.append_only!==true)blocked.push('snapshot ledger must be append only');
if(c.write_contract?.dedupe_by_evidence_fingerprint!==true)blocked.push('evidence fingerprint dedupe required');
for(const t of required)if(!(c.write_contract?.allowed_signal_types||[]).includes(t))blocked.push(`write contract missing ${t}`);
if(c.availability_contract?.absence_from_injury_feed_never_by_itself_implies_active!==true)blocked.push('missing no-injury-absence safeguard');
if(c.availability_contract?.injury_out_ir_pup_suspended_overrides_active!==true)blocked.push('missing explicit inactive override');
const report={generated_at:new Date().toISOString(),result:blocked.length?'BLOCKED':'PASS',status:c.status,mode:c.mode,actionable:c.actionable,sportsbook_inputs_allowed:c.sportsbook_inputs_allowed,adapters:required,blocked};
fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});fs.writeFileSync(path.join(root,'guardrails/automatic-football-context-adapters-contract-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(blocked.length)process.exit(1);
