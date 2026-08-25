import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const priors=read('data/probability/generated/historical-uncertainty-priors-2021-2025.json');
const inputPath='data/probability/weekly-football-context-inputs-2026.json';
const outputPath='data/probability/weekly-projection-inputs-2026.json';
const input=read(inputPath);
fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});

const statsByPos={
  QB:['pass_yards','pass_tds','rush_yards'],
  RB:['rush_yards','targets','receiving_yards','receptions'],
  WR:['targets','receiving_yards','receptions'],
  TE:['targets','receiving_yards','receptions']
};
const finite=x=>Number.isFinite(Number(x));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const round=(x,d=4)=>Number(Number(x).toFixed(d));
const normalize=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const signalCurrent=s=>!s?.status||s.status==='CURRENT'||s.status==='SELF_TEST';

const playerPriorByName=new Map((priors.player_priors||[]).map(p=>[normalize(p.player),p]));
const positionPriors=priors.position_priors||{};

function syntheticInput(){
  return {
    schema_version:'self-test',season:2026,week:1,status:'SELF_TEST',generated_at:new Date().toISOString(),sportsbook_inputs_used:false,
    players:{
      'SELF_TEST_QB':{position:'QB',prior_player:null,expected_active:true,signals:{role:{status:'CURRENT',stat_adjustments:{pass_yards:{mean_pct:.04,sd_pct:.02},pass_tds:{mean_pct:.03},rush_yards:{mean_pct:.01}},source:'self-test role'},qb_context:{status:'CURRENT',stat_adjustments:{pass_yards:{mean_pct:.02}},source:'self-test qb'},opponent:{status:'CURRENT',stat_adjustments:{pass_yards:{mean_pct:-.03},rush_yards:{mean_pct:.02}},source:'self-test opponent'}}},
      'SELF_TEST_RB':{position:'RB',prior_player:null,expected_active:true,signals:{role:{status:'CURRENT',stat_adjustments:{rush_yards:{mean_pct:.08,sd_pct:.05},targets:{mean_pct:.06,sd_pct:.04},receiving_yards:{mean_pct:.02},receptions:{mean_pct:.02}},source:'self-test role'},injury:{status:'CURRENT',stat_adjustments:{rush_yards:{mean_pct:-.04,sd_pct:.08},targets:{mean_pct:-.02,sd_pct:.05}},source:'self-test injury'}}},
      'SELF_TEST_WR':{position:'WR',prior_player:null,expected_active:true,signals:{role:{status:'CURRENT',stat_adjustments:{targets:{mean_pct:.08,sd_pct:.03},receiving_yards:{mean_pct:.07},receptions:{mean_pct:.05}},source:'self-test role'},team_environment:{status:'CURRENT',stat_adjustments:{targets:{mean_pct:.02},receiving_yards:{mean_pct:.03}},source:'self-test environment'}}},
      'SELF_TEST_TE':{position:'TE',prior_player:null,expected_active:true,signals:{role:{status:'CURRENT',stat_adjustments:{targets:{mean_pct:.07},receiving_yards:{mean_pct:.05},receptions:{mean_pct:.06}},source:'self-test role'},opponent:{status:'STALE_REVIEW_REQUIRED',stat_adjustments:{targets:{mean_pct:-.01},receiving_yards:{mean_pct:-.02}},source:'self-test stale opponent'}}}
    }
  };
}

const src=process.argv.includes('--self-test')?syntheticInput():input;
const blocked=[];
if(src.sportsbook_inputs_used!==false) blocked.push('sportsbook_inputs_used must be false');

function baselineFor(name,p,pos,stat){
  const requested=p.prior_player||name;
  const pp=playerPriorByName.get(normalize(requested));
  const ps=pp?.position===pos?pp.stats?.[stat]:null;
  if(ps&&finite(ps.shrunk_mean)&&finite(ps.shrunk_sd)&&Number(ps.shrunk_sd)>0){
    return {mean:Number(ps.shrunk_mean),sd:Number(ps.shrunk_sd),source:'player_shrunk_prior',prior_player:pp.player,games:Number(ps.games||0)};
  }
  const q=positionPriors?.[pos]?.[stat];
  if(q&&finite(q.mean)&&finite(q.sd)&&Number(q.sd)>0){
    return {mean:Number(q.mean),sd:Number(q.sd),source:'position_prior',prior_player:null,games:Number(q.sample||0)};
  }
  return null;
}

function applySignals(base,p,stat){
  let meanMult=1,sdMult=1;
  const applied=[];const excluded=[];
  for(const [signalName,signal] of Object.entries(p.signals||{})){
    const a=signal?.stat_adjustments?.[stat];
    if(!a) continue;
    if(!signalCurrent(signal)){
      excluded.push({signal:signalName,status:signal?.status||null,source:signal?.source||null,captured_at:signal?.captured_at||null});
      continue;
    }
    const meanPct=finite(a.mean_pct)?clamp(Number(a.mean_pct),-.35,.35):0;
    const sdPct=finite(a.sd_pct)?clamp(Number(a.sd_pct),-.35,.50):0;
    meanMult*=1+meanPct;
    sdMult*=1+sdPct;
    applied.push({signal:signalName,mean_pct:meanPct,sd_pct:sdPct,source:signal.source||null,captured_at:signal.captured_at||null,status:signal.status||null});
  }
  meanMult=clamp(meanMult,.60,1.40);
  sdMult=clamp(sdMult,.65,1.60);
  const mean=Math.max(0,base.mean*meanMult);
  const sd=Math.max(1e-6,base.sd*sdMult);
  return {mean,sd,mean_multiplier:meanMult,sd_multiplier:sdMult,applied,excluded};
}

const players={};
let projected=0,review=0,insufficient=0,adjustmentCount=0,targetProjected=0,excludedStaleAdjustments=0;
for(const [name,p] of Object.entries(src.players||{})){
  const pos=String(p.position||'').toUpperCase();
  const stats=statsByPos[pos];
  if(!stats){players[name]={position:pos,status:'INSUFFICIENT_DATA',reason:'Unsupported position'};insufficient++;continue;}
  if(p.expected_active===false){players[name]={position:pos,status:'REVIEW_REQUIRED',reason:'Player not expected active; no playing-time projection generated',projections:{}};review++;continue;}
  const projections={};
  let playerStatus=p.context_status==='REVIEW_REQUIRED'?'REVIEW_REQUIRED':'SHADOW_ONLY';
  if(playerStatus==='REVIEW_REQUIRED')review++;
  for(const stat of stats){
    const base=baselineFor(name,p,pos,stat);
    if(!base){projections[stat]={status:'INSUFFICIENT_DATA',reason:'No valid player or position historical prior'};insufficient++;playerStatus='REVIEW_REQUIRED';continue;}
    const adj=applySignals(base,p,stat); adjustmentCount+=adj.applied.length;excludedStaleAdjustments+=adj.excluded.length;
    const missingCoreSignals=['role','injury','team_environment','opponent'].filter(k=>!p.signals?.[k]||!signalCurrent(p.signals[k]));
    projections[stat]={
      status:'SHADOW_ONLY',actionable:false,mean:round(adj.mean),sd:round(adj.sd),
      baseline:{mean:round(base.mean),sd:round(base.sd),source:base.source,prior_player:base.prior_player,games:base.games},
      adjustments:{mean_multiplier:round(adj.mean_multiplier),sd_multiplier:round(adj.sd_multiplier),applied:adj.applied,excluded_noncurrent:adj.excluded},
      missing_core_signals:missingCoreSignals,
      sportsbook_inputs_used:false
    };
    projected++;
    if(stat==='targets')targetProjected++;
  }
  players[name]={position:pos,status:playerStatus,source_context_status:p.context_status||null,projections};
}

if(process.argv.includes('--self-test')){
  if(projected<11) blocked.push(`self-test projected too few stats: ${projected}`);
  if(targetProjected<3) blocked.push(`self-test projected too few target distributions: ${targetProjected}`);
  if(adjustmentCount<9) blocked.push(`self-test applied too few current context adjustments: ${adjustmentCount}`);
  if(excludedStaleAdjustments<2) blocked.push(`self-test did not exclude stale adjustments: ${excludedStaleAdjustments}`);
}
for(const [name,p] of Object.entries(players)) for(const [stat,x] of Object.entries(p.projections||{})){
  if(x.status==='SHADOW_ONLY'&&(!finite(x.mean)||!finite(x.sd)||Number(x.sd)<=0)) blocked.push(`${name} ${stat} invalid projection`);
  if(x.sportsbook_inputs_used!==false&&x.status==='SHADOW_ONLY') blocked.push(`${name} ${stat} market contamination`);
}

const generatedAt=new Date().toISOString();
const output={
  schema_version:'1.2.0',season:2026,week:src.week,generated_at:generatedAt,
  status:src.status==='SELF_TEST'?'SELF_TEST':'SHADOW_ONLY',sportsbook_inputs_used:false,players
};
const report={
  generated_at:generatedAt,result:blocked.length?'BLOCKED':'PASS',mode:'SHADOW_ONLY',actionable:false,
  input_status:src.status,projected_stats:projected,target_projections:targetProjected,review_required:review,insufficient_data:insufficient,
  context_adjustments_applied:adjustmentCount,excluded_noncurrent_adjustments:excludedStaleAdjustments,sportsbook_inputs_used:false,blocked,
  safeguards:[
    'Historical player/position priors are the baseline; no sportsbook line or price is used.',
    'Pregame targets are projected for RB/WR/TE from historical football-side priors before any reception probability is constructed.',
    'Only CURRENT weekly signals may modify a projection; stale/review-required signals remain in the audit trail but are excluded from multipliers.',
    'Stale core signals count as missing current context rather than current evidence.',
    'Individual signal adjustments and total multipliers are capped to prevent a single bad input from creating an extreme projection.',
    'Missing context is reported rather than silently invented.',
    'This generator remains SHADOW_ONLY until real 2026 weekly context feeds and holdout calibration are active.'
  ]
};
fs.writeFileSync(path.join(root,outputPath),JSON.stringify(output,null,2)+'\n');
fs.writeFileSync(path.join(root,'guardrails/weekly-projection-generator-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length) process.exit(1);
