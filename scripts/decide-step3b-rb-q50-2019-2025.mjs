import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

for(const script of ['scripts/audit-step3b-rb-health-composition-2021-2025.mjs','scripts/audit-step3b-rb-top30-2019-2025.mjs']){
  const run=spawnSync(process.execPath,[script],{stdio:'inherit'});
  if(run.status!==0)process.exit(run.status||1);
}
const top=JSON.parse(fs.readFileSync('guardrails/step3b-rb-top30-2019-2025.json','utf8'));
const health=JSON.parse(fs.readFileSync('guardrails/step3b-rb-health-composition-2021-2025.json','utf8'));
const rows=top.players||[];
const healthRows=health.players||[];
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const median=a=>{if(!a.length)return null;const x=[...a].sort((a,b)=>a-b);const m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2;};
const compat=(obs,p,N)=>N>0&&Math.abs(obs-p)<=1.96*Math.sqrt(p*(1-p)/N);
const summarize=(a,q='q50')=>{const n=a.length;const getQ=x=>x[q]??x.projected_q50;const cov=n?a.filter(x=>x.actual_ppg<=getQ(x)).length/n:null;const gaps=a.map(x=>x.actual_ppg-getQ(x));return{n,q50_coverage:cov,absolute_q50_error:cov==null?null:Math.abs(cov-.5),compatible_95pct:cov==null?null:compat(cov,.5,n),mean_gap:avg(gaps),median_gap:median(gaps)};};
const years={};for(const y of [2019,2020,2021,2022,2023,2024,2025])years[y]=summarize(rows.filter(x=>x.target===y));
const groups={};for(const g of ['HEALTHY_ESTABLISHED','INJURY_OR_RECOVERY_AFFECTED','FRINGE_PRIOR_ROLE','ROLE_OR_TEAM_CHANGE','VETERAN_ROLE_DECLINE_PROXY','OTHER'])groups[g]=summarize(healthRows.filter(x=>x.group===g),'projected_q50');
const overall=summarize(rows);
const healthy=groups.HEALTHY_ESTABLISHED;
const report={generated_at:new Date().toISOString(),step:'STEP3B_RB_Q50_2019_2025_DECISION',population:'2019-2025 RB history with preseason fantasy-relevant selection and zero-game outcomes retained; realized health/role labels are diagnostic only.',years,overall,diagnostic_groups:groups,decision_rules:{no_single_year_hindsight_correction:true,no_target_season_leakage_for_preseason_selection:true,do_not_shift_healthy_q50_to_fit_injury_benching_or_role_collapse_noise:true,availability_and_role_loss_belong_in_downside_risk_not_blanket_healthy_median:true},locked_decision:{core_rb_q50:'RETAIN_EXISTING_CORE_RB_Q50',healthy_established_n:healthy.n,healthy_established_q50_coverage:healthy.q50_coverage,healthy_established_compatible_95pct:healthy.compatible_95pct,healthy_established_median_gap_ppg:healthy.median_gap,full_population_q50_coverage:overall.q50_coverage,interpretation:'The full-population median is overoptimistic because disrupted seasons are common, but normal established RB seasons calibrate at approximately 50%. A blanket Q50 cut would miscalibrate healthy RBs. Keep the core Q50 and treat availability/role-collapse as downside-distribution risk.'},recommendation:'RETAIN_CORE_RB_Q50_MODEL_AVAILABILITY_ROLE_DOWNSIDE_SEPARATELY',sportsbook_or_adp_used:false,live_projection_movement:0,live_rank_movement:0,promotion_allowed:false};
fs.writeFileSync('guardrails/step3b-rb-q50-2019-2025-decision.json',JSON.stringify(report,null,2)+'\n');
console.log('\nRB 2019-2025 DECISION SUMMARY\n'+JSON.stringify(report,null,2));
