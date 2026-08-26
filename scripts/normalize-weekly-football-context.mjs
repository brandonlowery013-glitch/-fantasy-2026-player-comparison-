import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const contract=read('data/sources/weekly-football-context-2026.json');
const cohortContract=read('data/sources/role-cohort-baseline-selection-2026.json');
const cohortPriors=read('data/probability/generated/role-cohort-priors-2021-2025.json');
const rawPath='data/probability/weekly-football-context-raw-2026.json';
const outPath='data/probability/weekly-football-context-inputs-2026.json';
const reportPath='guardrails/weekly-football-context-normalization-report.json';
fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});

const allowedPositions=new Set(contract.normalization_contract.allowed_positions||[]);
const allowedSignals=new Set(contract.normalization_contract.allowed_signal_types||[]);
const freshness=contract.normalization_contract.capture_freshness_hours||{};
const meanCap=Number(contract.normalization_contract.max_abs_mean_adjustment_pct_per_signal||.35);
const sdUp=Number(contract.normalization_contract.max_sd_increase_pct_per_signal||.50);
const sdDown=Number(contract.normalization_contract.max_sd_decrease_pct_per_signal||-.35);
const statsByPos={QB:new Set(['pass_yards','pass_tds','rush_yards']),RB:new Set(['rush_yards','targets','receiving_yards','receptions']),WR:new Set(['targets','receiving_yards','receptions']),TE:new Set(['targets','receiving_yards','receptions'])};
const marketWords=/\b(odds?|sportsbook|bookmaker|moneyline|vig|juice|implied_probability|market_price|betting_price)\b/i;
const finite=x=>Number.isFinite(Number(x));
const isoMs=x=>{const t=Date.parse(String(x||''));return Number.isFinite(t)?t:null};
const round=(x,d=4)=>Number(Number(x).toFixed(d));
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
const cohortPosition=new Map(Object.entries(cohortPriors.cohorts||{}).map(([k,v])=>[k,String(v.position||'').toUpperCase()]));

const liveByNorm=new Map();
for(let i=0;i<13;i++)for(const p of read(`players${i}.json`))liveByNorm.set(norm(p.n),{name:p.n,position:String(p.p||'').toUpperCase()});

function synthetic(){
  const now=Date.now();
  const iso=h=>new Date(now-h*3600000).toISOString();
  return {schema_version:'self-test',season:2026,week:1,status:'SELF_TEST',captured_at:new Date(now).toISOString(),sportsbook_inputs_used:false,players:{
    SELF_TEST_QB:{position:'QB',expected_active:true,signals:{role:{source:'self-test utilization',captured_at:iso(1),cohort:'QB_STARTER',stat_adjustments:{pass_yards:{mean_pct:.01}}},qb_context:{source:'self-test depth-chart evidence',captured_at:iso(1),stat_adjustments:{pass_yards:{mean_pct:.02},pass_tds:{mean_pct:.01}}},opponent:{source:'self-test prior-only defense',captured_at:iso(2),stat_adjustments:{pass_yards:{mean_pct:-.03}}}}},
    SELF_TEST_RB:{position:'RB',expected_active:true,signals:{role:{source:'self-test utilization',captured_at:iso(2),cohort:'RB_LEAD',stat_adjustments:{rush_yards:{mean_pct:.08,sd_pct:.05},targets:{mean_pct:.06}}},injury:{source:'self-test official injury',captured_at:iso(1),stat_adjustments:{rush_yards:{mean_pct:-.02,sd_pct:.04}}}}},
    SELF_TEST_WR:{position:'WR',expected_active:true,signals:{role:{source:'self-test utilization',captured_at:iso(2),cohort:'WR_FULL_TIME',stat_adjustments:{targets:{mean_pct:.07},receiving_yards:{mean_pct:.05}}},team_environment:{source:'self-test nflverse context',captured_at:iso(3),stat_adjustments:{receiving_yards:{mean_pct:.02}}}}},
    SELF_TEST_TE:{position:'TE',expected_active:true,signals:{role:{source:'self-test utilization',captured_at:iso(2),cohort:'TE_RECEIVING',stat_adjustments:{targets:{mean_pct:.06},receptions:{mean_pct:.05}}},injury:{source:'self-test official injury',captured_at:iso(13),stat_adjustments:{targets:{mean_pct:-.04}}}}}
  }};
}

const selfTest=process.argv.includes('--self-test');
const src=selfTest?synthetic():read(rawPath);
const now=Date.now();
const blocked=[];
const review=[];
if(src.season!==2026)blocked.push(`unexpected season ${src.season}`);
if(src.sportsbook_inputs_used!==false)blocked.push('sportsbook_inputs_used must be false');
if(src.week!=null&&(!Number.isInteger(Number(src.week))||Number(src.week)<1||Number(src.week)>18))blocked.push(`invalid week ${src.week}`);
if(cohortPriors.sportsbook_inputs_used!==false)blocked.push('role cohort priors unexpectedly use sportsbook inputs');

const players={};let currentSignals=0,staleSignals=0,invalidSignals=0,currentRoleCohorts=0,staleRoleCohorts=0;
for(const [inputName,p] of Object.entries(src.players||{})){
  const suppliedPos=String(p.position||'').toUpperCase();
  if(!allowedPositions.has(suppliedPos)){blocked.push(`${inputName} unsupported position ${suppliedPos}`);continue;}
  if(typeof p.expected_active!=='boolean'){blocked.push(`${inputName} expected_active must be explicit boolean`);continue;}
  let name=inputName,pos=suppliedPos;
  if(!selfTest){
    const live=liveByNorm.get(norm(inputName));
    if(!live){blocked.push(`${inputName} is not in authoritative 162-player universe`);continue;}
    name=live.name;
    if(live.position&&live.position!==suppliedPos){blocked.push(`${inputName} position mismatch: ${suppliedPos} vs live ${live.position}`);continue;}
  }
  const outSignals={};let playerReview=false;
  for(const [signalName,s] of Object.entries(p.signals||{})){
    if(!allowedSignals.has(signalName)){blocked.push(`${name} unsupported signal ${signalName}`);invalidSignals++;continue;}
    if(!s||typeof s!=='object'){blocked.push(`${name} ${signalName} invalid signal object`);invalidSignals++;continue;}
    const source=String(s.source||'').trim();const captured=isoMs(s.captured_at);
    if(!source){blocked.push(`${name} ${signalName} missing source`);invalidSignals++;continue;}
    if(marketWords.test(source)||marketWords.test(JSON.stringify(s.evidence||{}))){blocked.push(`${name} ${signalName} possible market contamination`);invalidSignals++;continue;}
    if(captured==null){blocked.push(`${name} ${signalName} invalid captured_at`);invalidSignals++;continue;}
    if(captured>now+5*60000){blocked.push(`${name} ${signalName} captured_at is in the future`);invalidSignals++;continue;}
    const ageHours=(now-captured)/3600000;const maxAge=Number(freshness[signalName]);
    const stale=ageHours>maxAge;
    const adj={};
    for(const [stat,a] of Object.entries(s.stat_adjustments||{})){
      if(!statsByPos[pos]?.has(stat)){blocked.push(`${name} ${signalName} adjustment not allowed for ${pos}: ${stat}`);continue;}
      if(!a||typeof a!=='object'){blocked.push(`${name} ${signalName} ${stat} invalid adjustment`);continue;}
      const x={};
      if(a.mean_pct!=null){if(!finite(a.mean_pct)||Math.abs(Number(a.mean_pct))>meanCap)blocked.push(`${name} ${signalName} ${stat} mean_pct outside cap`);else x.mean_pct=Number(a.mean_pct);}
      if(a.sd_pct!=null){if(!finite(a.sd_pct)||Number(a.sd_pct)<sdDown||Number(a.sd_pct)>sdUp)blocked.push(`${name} ${signalName} ${stat} sd_pct outside cap`);else x.sd_pct=Number(a.sd_pct);}
      if(Object.keys(x).length)adj[stat]=x;
    }
    let cohort=null;
    if(signalName==='role'&&s.cohort!=null){
      cohort=String(s.cohort);
      const declared=(cohortContract.allowed_cohorts?.[pos]||[]).includes(cohort);
      const actualPos=cohortPosition.get(cohort)||null;
      if(!declared||actualPos!==pos){blocked.push(`${name} role cohort invalid for ${pos}: ${cohort}`);invalidSignals++;cohort=null;}
      else if(stale)staleRoleCohorts++;else currentRoleCohorts++;
    }
    const status=stale?'STALE_REVIEW_REQUIRED':'CURRENT';
    if(stale){staleSignals++;playerReview=true;review.push(`${name} ${signalName} stale ${round(ageHours,2)}h > ${maxAge}h`);}else currentSignals++;
    const {position:unusedPosition,...signalRest}=s;
    outSignals[signalName]={...signalRest,cohort,status,age_hours:round(ageHours,3),freshness_limit_hours:maxAge,stat_adjustments:adj,sportsbook_inputs_used:false};
  }
  players[name]={player:name,position:pos,prior_player:p.prior_player||null,expected_active:p.expected_active,context_status:playerReview?'REVIEW_REQUIRED':'PASS',signals:outSignals};
}

if(selfTest&&currentRoleCohorts<4)blocked.push(`self-test current role cohorts unexpectedly low: ${currentRoleCohorts}`);
const generatedAt=new Date().toISOString();
const output={schema_version:'2.2.0',season:2026,week:src.week??null,status:src.status==='SELF_TEST'?'SELF_TEST':(review.length?'REVIEW_REQUIRED':src.status||'NORMALIZED'),generated_at:generatedAt,sportsbook_inputs_used:false,players};
const report={generated_at:generatedAt,result:blocked.length?'BLOCKED':(review.length?'REVIEW_REQUIRED':'PASS'),mode:'SHADOW_ONLY',actionable:false,input_status:src.status,players:Object.keys(players).length,current_signals:currentSignals,stale_signals:staleSignals,invalid_signals:invalidSignals,current_role_cohorts:currentRoleCohorts,stale_role_cohorts:staleRoleCohorts,authoritative_live_players:liveByNorm.size,review,blocked,sportsbook_inputs_used:false,safeguards:['Every normalized signal has source and capture time.','Signal freshness is category-specific; injury uses the existing 12-hour limit.','Stale signals are preserved for audit but marked STALE_REVIEW_REQUIRED so projection code can exclude them.','Role cohort evidence is optional, but when supplied it must exist in the historical cohort file and match the player position.','A stale role signal cannot provide a current role-cohort baseline.','expected_active must be explicit; missing availability is never silently converted to active.','Real weekly inputs must resolve to the authoritative 162-player universe with matching position.','Missing signals remain missing and are not converted to zero or neutral evidence.','Per-signal mean/uncertainty adjustments are bounded by the source contract.']};
fs.writeFileSync(path.join(root,outPath),JSON.stringify(output,null,2)+'\n');
fs.writeFileSync(path.join(root,reportPath),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);
if(process.argv.includes('--require-current')&&review.length)process.exit(2);
