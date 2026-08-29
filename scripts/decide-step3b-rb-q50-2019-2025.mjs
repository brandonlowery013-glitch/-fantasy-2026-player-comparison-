import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const run=spawnSync(process.execPath,['scripts/audit-step3b-rb-top30-2019-2025.mjs'],{stdio:'inherit'});
if(run.status!==0)process.exit(run.status||1);
const src=JSON.parse(fs.readFileSync('guardrails/step3b-rb-top30-2019-2025.json','utf8'));
const rows=src.players||[];
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const compat=(obs,p,N)=>N>0&&Math.abs(obs-p)<=1.96*Math.sqrt(p*(1-p)/N);
const summarize=a=>{const n=a.length;const cov=n?a.filter(x=>x.actual_ppg<=x.q50).length/n:null;return{n,q50_coverage:cov,absolute_q50_error:cov==null?null:Math.abs(cov-.5),compatible_95pct:cov==null?null:compat(cov,.5,n),mean_actual_ppg:avg(a.map(x=>x.actual_ppg)),mean_q50:avg(a.map(x=>x.q50)),mean_gap:avg(a.map(x=>x.actual_ppg-x.q50)),mean_games:avg(a.map(x=>x.target_games)),target_out_or_11_games_share:n?a.filter(x=>x.target_out_weeks>=2||x.target_games<=11).length/n:null,major_role_drop_share:n?a.filter(x=>x.major_role_drop).length/n:null};};
const years={};for(const y of [2019,2020,2021,2022,2023,2024,2025])years[y]=summarize(rows.filter(x=>x.target===y));
const overall=summarize(rows);
const pre2024=summarize(rows.filter(x=>x.target<=2023));
const recent=summarize(rows.filter(x=>x.target>=2024));
const incompatible=Object.entries(years).filter(([,v])=>!v.compatible_95pct).map(([y,v])=>({year:Number(y),q50_coverage:v.q50_coverage,mean_gap:v.mean_gap,mean_games:v.mean_games,target_out_or_11_games_share:v.target_out_or_11_games_share,major_role_drop_share:v.major_role_drop_share}));
const report={generated_at:new Date().toISOString(),step:'STEP3B_RB_Q50_2019_2025_DECISION',population:'Leakage-safe preseason top-30 RBs per year, selected from prior-season history only; players with zero target-season games retained as zero outcomes.',years,overall,periods:{'2019_2023':pre2024,'2024_2025':recent},incompatible_years_95pct:incompatible,decision_rules:{no_single_year_hindsight_correction:true,no_target_season_leakage:true,prefer_full_period_balance_over_forcing_each_year_to_exact_50pct:true,availability_and_role_collapse_are_downside_distribution_inputs_not_reason_to_shift_all_healthy_q50s:true},recommendation:overall.compatible_95pct?'RETAIN_CORE_RB_Q50_AND_MODEL_AVAILABILITY_ROLE_DOWNSIDE_SEPARATELY':'RB_Q50_REQUIRES_GLOBAL_RECALIBRATION',sportsbook_or_adp_used:false,live_projection_movement:0,live_rank_movement:0,promotion_allowed:false};
fs.writeFileSync('guardrails/step3b-rb-q50-2019-2025-decision.json',JSON.stringify(report,null,2)+'\n');
console.log('\nRB 2019-2025 DECISION SUMMARY\n'+JSON.stringify(report,null,2));
