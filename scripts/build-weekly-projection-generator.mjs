import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const priors=read('data/probability/generated/historical-uncertainty-priors-2021-2025.json');
const rookiePriors=read('data/probability/generated/rookie-no-history-priors-2016-2025.json');
const cohortPriors=read('data/probability/generated/role-cohort-priors-2021-2025.json');
const cohortContract=read('data/sources/role-cohort-baseline-selection-2026.json');
const inputPath='data/probability/weekly-football-context-inputs-2026.json';
const outputPath='data/probability/weekly-projection-inputs-2026.json';
const input=read(inputPath);
fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});

const statsByPos={QB:['pass_yards','pass_tds','rush_yards'],RB:['rush_yards','targets','receiving_yards','receptions'],WR:['targets','receiving_yards','receptions'],TE:['targets','receiving_yards','receptions']};
const finite=x=>Number.isFinite(Number(x));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const round=(x,d=4)=>Number(Number(x).toFixed(d));
const normalize=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const signalCurrent=s=>!s?.status||s.status==='CURRENT'||s.status==='SELF_TEST';

const playerPriorByName=new Map((priors.player_priors||[]).map(p=>[normalize(p.player),p]));
const rookiePriorByName=new Map((rookiePriors.current_player_priors||[]).map(p=>[normalize(p.player),p]));
const positionPriors=priors.position_priors||{};
const cohorts=cohortPriors.cohorts||{};
const baselinePriority=['player_shrunk_prior','rookie_no_history_prior','current_role_cohort_prior','position_prior'];

function syntheticInput(){return {schema_version:'self-test',season:2026,week:1,status:'SELF_TEST',generated_at:new Date().toISOString(),sportsbook_inputs_used:false,players:{
  'SELF_TEST_QB':{position:'QB',prior_player:null,expected_active:true,signals:{role:{status:'CURRENT',cohort:'QB_STARTER',stat_adjustments:{pass_yards:{mean_pct:.04,sd_pct:.02},pass_tds:{mean_pct:.03},rush_yards:{mean_pct:.01}},source:'self-test role'},qb_context:{status:'CURRENT',stat_adjustments:{pass_yards:{mean_pct:.02}},source:'self-test qb'},opponent:{status:'CURRENT',stat_adjustments:{pass_yards:{mean_pct:-.03},rush_yards:{mean_pct:.02}},source:'self-test opponent'}}},
  'SELF_TEST_RB':{position:'RB',prior_player:null,expected_active:true,signals:{role:{status:'CURRENT',cohort:'RB_LEAD',stat_adjustments:{rush_yards:{mean_pct:.08,sd_pct:.05},targets:{mean_pct:.06,sd_pct:.04},receiving_yards:{mean_pct:.02},receptions:{mean_pct:.02}},source:'self-test role'},injury:{status:'CURRENT',stat_adjustments:{rush_yards:{mean_pct:-.04,sd_pct:.08},targets:{mean_pct:-.02,sd_pct:.05}},source:'self-test injury'}}},
  'SELF_TEST_WR':{position:'WR',prior_player:null,expected_active:true,signals:{role:{status:'CURRENT',cohort:'WR_FULL_TIME',stat_adjustments:{targets:{mean_pct:.08,sd_pct:.03},receiving_yards:{mean_pct:.07},receptions:{mean_pct:.05}},source:'self-test role'},team_environment:{status:'CURRENT',stat_adjustments:{targets:{mean_pct:.02},receiving_yards:{mean_pct:.03}},source:'self-test environment'}}},
  'SELF_TEST_TE':{position:'TE',prior_player:null,expected_active:true,signals:{role:{status:'CURRENT',cohort:'TE_RECEIVING',stat_adjustments:{targets:{mean_pct:.07},receiving_yards:{mean_pct:.05},receptions:{mean_pct:.06}},source:'self-test role'},opponent:{status:'STALE_REVIEW_REQUIRED',stat_adjustments:{targets:{mean_pct:-.01},receiving_yards:{mean_pct:-.02}},source:'self-test stale opponent'}}},
  'Carnell Tate':{position:'WR',prior_player:null,expected_active:true,signals:{role:{status:'CURRENT',cohort:'WR_FULL_TIME',stat_adjustments:{targets:{mean_pct:.03}},source:'self-test rookie role'}}},
  'Jeremiyah Love':{position:'RB',prior_player:null,expected_active:true,signals:{role:{status:'CURRENT',cohort:'RB_LEAD',stat_adjustments:{rush_yards:{mean_pct:.03},targets:{mean_pct:.02}},source:'self-test rookie role'}}}
}};}

const src=process.argv.includes('--self-test')?syntheticInput():input;
const blocked=[];
if(src.sportsbook_inputs_used!==false)blocked.push('sportsbook_inputs_used must be false');
if(cohortPriors.sportsbook_inputs_used!==false)blocked.push('role cohort priors unexpectedly use sportsbook inputs');
if(rookiePriors.sportsbook_inputs_used!==false)blocked.push('rookie priors unexpectedly use sportsbook inputs');
if(cohortContract.sportsbook_inputs_allowed!==false)blocked.push('role cohort baseline contract unexpectedly permits sportsbook inputs');

function validCandidate(mean,sd){return finite(mean)&&finite(sd)&&Number(sd)>0;}
function candidateBaselines(name,p,pos,stat){
  const requested=p.prior_player||name;
  const pp=playerPriorByName.get(normalize(requested));
  const ps=pp?.position===pos?pp.stats?.[stat]:null;
  const player=ps&&validCandidate(ps.shrunk_mean,ps.shrunk_sd)?{mean:Number(ps.shrunk_mean),sd:Number(ps.shrunk_sd),source:'player_shrunk_prior',prior_player:pp.player,games:Number(ps.games||0)}:null;

  const rp=rookiePriorByName.get(normalize(name));
  const rx=rp?.position===pos?rp.numeric_prior?.stats?.[stat]:null;
  const rookie=rx&&validCandidate(rx.mean,rx.sd)?{mean:Number(rx.mean),sd:Number(rx.sd),source:rp.numeric_prior.source==='historical_rookie_draft_tier'?'rookie_draft_tier_prior':'rookie_position_prior',rookie_player:rp.player,draft_pick:Number(rp.draft_pick),draft_tier:rp.draft_tier,cohort:rp.numeric_prior.cohort,unique_rookies:Number(rp.numeric_prior.unique_rookies||0),player_games:Number(rp.numeric_prior.player_games||0),age_2026_season_start:rp.age_2026_season_start??null}:null;

  const roleSignal=p.signals?.role;let role=null;
  if(signalCurrent(roleSignal)&&roleSignal?.cohort){const cohortName=String(roleSignal.cohort),c=cohorts[cohortName],allowed=(cohortContract.allowed_cohorts?.[pos]||[]).includes(cohortName),x=c?.stats?.[stat];if(!c||String(c.position||'').toUpperCase()!==pos||!allowed)blocked.push(`${name} invalid current role cohort for ${pos}: ${cohortName}`);else if(x&&validCandidate(x.mean,x.sd))role={mean:Number(x.mean),sd:Number(x.sd),source:'role_cohort_prior',cohort:cohortName,player_seasons:Number(c.player_seasons||0),player_games:Number(c.player_games||0),role_source:roleSignal.source||null,role_captured_at:roleSignal.captured_at||null};}

  const q=positionPriors?.[pos]?.[stat];const position=q&&validCandidate(q.mean,q.sd)?{mean:Number(q.mean),sd:Number(q.sd),source:'position_prior',sample:Number(q.sample||0)}:null;
  const selected=player||rookie||role||position||null;
  return {selected,candidates:{player,rookie,role_cohort:role,position}};
}

function applySignals(base,p,stat){let meanMult=1,sdMult=1;const applied=[],excluded=[];for(const [signalName,signal] of Object.entries(p.signals||{})){const a=signal?.stat_adjustments?.[stat];if(!a)continue;if(!signalCurrent(signal)){excluded.push({signal:signalName,status:signal?.status||null,source:signal?.source||null,captured_at:signal?.captured_at||null});continue;}const meanPct=finite(a.mean_pct)?clamp(Number(a.mean_pct),-.35,.35):0,sdPct=finite(a.sd_pct)?clamp(Number(a.sd_pct),-.35,.50):0;meanMult*=1+meanPct;sdMult*=1+sdPct;applied.push({signal:signalName,mean_pct:meanPct,sd_pct:sdPct,source:signal.source||null,captured_at:signal.captured_at||null,status:signal.status||null});}meanMult=clamp(meanMult,.60,1.40);sdMult=clamp(sdMult,.65,1.60);return {mean:Math.max(0,base.mean*meanMult),sd:Math.max(1e-6,base.sd*sdMult),mean_multiplier:meanMult,sd_multiplier:sdMult,applied,excluded};}

const players={};let projected=0,review=0,insufficient=0,adjustmentCount=0,targetProjected=0,excludedStaleAdjustments=0;
const baselineSourceCounts={player_shrunk_prior:0,rookie_draft_tier_prior:0,rookie_position_prior:0,role_cohort_prior:0,position_prior:0};
for(const [name,p] of Object.entries(src.players||{})){const pos=String(p.position||'').toUpperCase(),stats=statsByPos[pos];if(!stats){players[name]={position:pos,status:'INSUFFICIENT_DATA',reason:'Unsupported position'};insufficient++;continue;}if(p.expected_active===false){players[name]={position:pos,status:'REVIEW_REQUIRED',reason:'Player not expected active; no playing-time projection generated',projections:{}};review++;continue;}const projections={};let playerStatus=p.context_status==='REVIEW_REQUIRED'?'REVIEW_REQUIRED':'SHADOW_ONLY';if(playerStatus==='REVIEW_REQUIRED')review++;
  for(const stat of stats){const baseline=candidateBaselines(name,p,pos,stat),base=baseline.selected;if(!base){projections[stat]={status:'INSUFFICIENT_DATA',reason:'No valid player, rookie, role-cohort, or position historical prior',baseline_candidates:baseline.candidates};insufficient++;playerStatus='REVIEW_REQUIRED';continue;}baselineSourceCounts[base.source]=(baselineSourceCounts[base.source]||0)+1;const adj=applySignals(base,p,stat);adjustmentCount+=adj.applied.length;excludedStaleAdjustments+=adj.excluded.length;const missingCoreSignals=['role','injury','team_environment','opponent'].filter(k=>!p.signals?.[k]||!signalCurrent(p.signals[k]));projections[stat]={status:'SHADOW_ONLY',actionable:false,mean:round(adj.mean),sd:round(adj.sd),baseline:{...base,mean:round(base.mean),sd:round(base.sd)},baseline_candidates:{player:baseline.candidates.player?{...baseline.candidates.player,mean:round(baseline.candidates.player.mean),sd:round(baseline.candidates.player.sd)}:null,rookie:baseline.candidates.rookie?{...baseline.candidates.rookie,mean:round(baseline.candidates.rookie.mean),sd:round(baseline.candidates.rookie.sd)}:null,role_cohort:baseline.candidates.role_cohort?{...baseline.candidates.role_cohort,mean:round(baseline.candidates.role_cohort.mean),sd:round(baseline.candidates.role_cohort.sd)}:null,position:baseline.candidates.position?{...baseline.candidates.position,mean:round(baseline.candidates.position.mean),sd:round(baseline.candidates.position.sd)}:null},adjustments:{mean_multiplier:round(adj.mean_multiplier),sd_multiplier:round(adj.sd_multiplier),applied:adj.applied,excluded_noncurrent:adj.excluded},missing_core_signals:missingCoreSignals,sportsbook_inputs_used:false};projected++;if(stat==='targets')targetProjected++;}
  players[name]={position:pos,status:playerStatus,source_context_status:p.context_status||null,projections};}

if(process.argv.includes('--self-test')){if(projected<18)blocked.push(`self-test projected too few stats: ${projected}`);if(targetProjected<5)blocked.push(`self-test projected too few target distributions: ${targetProjected}`);if(adjustmentCount<11)blocked.push(`self-test applied too few current context adjustments: ${adjustmentCount}`);if(excludedStaleAdjustments<2)blocked.push(`self-test did not exclude stale adjustments: ${excludedStaleAdjustments}`);if((baselineSourceCounts.rookie_draft_tier_prior||0)+(baselineSourceCounts.rookie_position_prior||0)<7)blocked.push(`self-test rookie baselines unexpectedly low`);if((baselineSourceCounts.role_cohort_prior||0)<11)blocked.push(`self-test role cohort baselines unexpectedly low: ${baselineSourceCounts.role_cohort_prior||0}`);if((baselineSourceCounts.position_prior||0)!==0)blocked.push(`self-test unexpectedly used generic position fallback: ${baselineSourceCounts.position_prior||0}`);}
for(const [name,p] of Object.entries(players))for(const [stat,x] of Object.entries(p.projections||{})){if(x.status==='SHADOW_ONLY'&&(!finite(x.mean)||!finite(x.sd)||Number(x.sd)<=0))blocked.push(`${name} ${stat} invalid projection`);if(x.sportsbook_inputs_used!==false&&x.status==='SHADOW_ONLY')blocked.push(`${name} ${stat} market contamination`);}

const generatedAt=new Date().toISOString();
const output={schema_version:'1.4.0',season:2026,week:src.week,generated_at:generatedAt,status:src.status==='SELF_TEST'?'SELF_TEST':'SHADOW_ONLY',sportsbook_inputs_used:false,baseline_priority:baselinePriority,players};
const report={generated_at:generatedAt,result:blocked.length?'BLOCKED':'PASS',mode:'SHADOW_ONLY',actionable:false,input_status:src.status,projected_stats:projected,target_projections:targetProjected,review_required:review,insufficient_data:insufficient,context_adjustments_applied:adjustmentCount,excluded_noncurrent_adjustments:excludedStaleAdjustments,baseline_source_counts:baselineSourceCounts,sportsbook_inputs_used:false,blocked,safeguards:['Baseline priority is player-specific history, then a verified no-history rookie prior, then current role cohort, then generic position fallback.','A rookie prior is used only for a player explicitly present in the 2026 no-history source set; no veteran is silently classified as a rookie.','Rookie priors come from historical NFL rookie outcomes by position and draft-capital tier; no NFL stats are fabricated for 2026 rookies.','Age/college/prospect information receives no uncalibrated numeric multiplier.','Current role signals adjust the selected rookie baseline downstream and remain source-attributed.','All baseline candidates are preserved for auditability.','No blend weights are introduced before calibration.','Only CURRENT weekly signals may modify a projection; stale/review-required signals are excluded.','This generator remains SHADOW_ONLY until real 2026 weekly context feeds and holdout calibration are active.']};
fs.writeFileSync(path.join(root,outputPath),JSON.stringify(output,null,2)+'\n');fs.writeFileSync(path.join(root,'guardrails/weekly-projection-generator-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(blocked.length)process.exit(1);
