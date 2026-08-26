import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const c=read('data/sources/frozen-2025-calibration-audit-2026.json');
const r=read('data/probability/generated/frozen-2025-calibration-audit.json');
const blocked=[];
if(c.sportsbook_inputs_allowed!==false||r.sportsbook_inputs_used!==false)blocked.push('sportsbook inputs must remain forbidden');
if(c.retuning_on_2025_allowed!==false||r.retuned_on_2025!==false)blocked.push('2025 retuning must remain forbidden');
if(JSON.stringify(c.family_selection_window)!==JSON.stringify([2023,2024]))blocked.push('family selection window changed');
if(JSON.stringify(c.frozen_evaluation_window)!==JSON.stringify([2025]))blocked.push('evaluation window changed');
if(JSON.stringify(r.family_selection_window)!==JSON.stringify([2023,2024])||JSON.stringify(r.evaluation_window)!==JSON.stringify([2025]))blocked.push('report windows violate contract');
if(!['PASS','REVIEW_REQUIRED'].includes(r.result))blocked.push(`audit must be structurally valid before validation: ${r.result}`);
if(Number(r.total_holdout_observations)<1000)blocked.push(`holdout observations unexpectedly small: ${r.total_holdout_observations}`);
let cells=0;for(const [pos,stats] of Object.entries(r.results||{}))for(const [stat,x] of Object.entries(stats||{})){cells++;if(Number(x.sample)<100)blocked.push(`${pos} ${stat} sample <100`);if(!['PASS','REVIEW_REQUIRED'].includes(x.status))blocked.push(`${pos} ${stat} invalid status`);for(const k of ['pit_uniformity_rmse','central_50_coverage','central_80_coverage','central_90_coverage','lower_10_tail_rate','upper_10_tail_rate']){const v=Number(x[k]);if(!Number.isFinite(v)||v<0||v>1)blocked.push(`${pos} ${stat} invalid ${k}`);}if(stat==='receptions'&&x.diagnostic_only_receptions!==true)blocked.push(`${pos} receptions must remain diagnostic-only`);}
if(cells<20)blocked.push(`too few audited position/stat cells: ${cells}`);
const out={generated_at:new Date().toISOString(),result:blocked.length?'BLOCKED':'PASS',audit_result:r.result,position_stat_cells:cells,total_holdout_observations:r.total_holdout_observations,review_required:r.position_stat_review_count,blocked,safeguards:['2025 is evaluation-only.','REVIEW_REQUIRED calibration findings cannot be converted into tuning changes by this validator.','Reception same-game-target family diagnostics remain explicitly non-deployable.','No sportsbook inputs are allowed.']};
fs.writeFileSync(path.join(root,'guardrails/frozen-2025-calibration-audit-validation-report.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));if(blocked.length)process.exit(1);
