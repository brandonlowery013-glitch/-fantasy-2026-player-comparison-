import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const contract=read('data/sources/weekly-football-context-2026.json');
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
const marketWords=/\b(odds?|sportsbook|bookmaker|spread|moneyline|total|over|under|vig|juice|price|implied_probability)\b/i;
const finite=x=>Number.isFinite(Number(x));
const isoMs=x=>{const t=Date.parse(String(x||''));return Number.isFinite(t)?t:null};
const round=(x,d=4)=>Number(Number(x).toFixed(d));

function synthetic(){
  const now=Date.now();
  const iso=h=>new Date(now-h*3600000).toISOString();
  return {schema_version:'self-test',season:2026,week:1,status:'SELF_TEST',captured_at:new Date(now).toISOString(),sportsbook_inputs_used:false,players:{
    SELF_TEST_QB:{position:'QB',expected_active:true,signals:{qb_context:{source:'self-test depth-chart evidence',captured_at:iso(1),stat_adjustments:{pass_yards:{mean_pct:.02},pass_tds:{mean_pct:.01}}},opponent:{source:'self-test prior-only defense',captured_at:iso(2),stat_adjustments:{pass_yards:{mean_pct:-.03}}}}},
    SELF_TEST_RB:{position:'RB',expected_active:true,signals:{role:{source:'self-test utilization',captured_at:iso(2),stat_adjustments:{rush_yards:{mean_pct:.08,sd_pct:.05},targets:{mean_pct:.06}}},injury:{source:'self-test official injury',captured_at:iso(1),stat_adjustments:{rush_yards:{mean_pct:-.02,sd_pct:.04}}}}},
    SELF_TEST_WR:{position:'WR',expected_active:true,signals:{role:{source:'self-test utilization',captured_at:iso(2),stat_adjustments:{targets:{mean_pct:.07},receiving_yards:{mean_pct:.05}}},team_environment:{source:'self-test nflverse context',captured_at:iso(3),stat_adjustments:{receiving_yards:{mean_pct:.02}}}}},
    SELF_TEST_TE:{position:'TE',expected_active:true,signals:{role:{source:'self-test utilization',captured_at:iso(2),stat_adjustments:{targets:{mean_pct:.06},receptions:{mean_pct:.05}}},injury:{source:'self-test official injury',captured_at:iso(13),stat_adjustments:{targets:{mean_pct:-.04}}}}}
  }};
}

const src=process.argv.includes('--self-test')?synthetic():read(rawPath);
const now=Date.now();
const blocked=[];
const review=[];
if(src.season!==2026)blocked.push(`unexpected season ${src.season}`);
if(src.sportsbook_inputs_used!==false)blocked.push('sportsbook_inputs_used must be false');
if(src.week!=null&&(!Number.isInteger(Number(src.week))||Number(src.week)<1||Number(src.week)>18))blocked.push(`invalid week ${src.week}`);

const players={};let currentSignals=0,staleSignals=0,invalidSignals=0;
for(const [name,p] of Object.entries(src.players||{})){
  const pos=String(p.position||'').toUpperCase();
  if(!allowedPositions.has(pos)){blocked.push(`${name} unsupported position ${pos}`);continue;}
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
    const status=stale?'STALE_REVIEW_REQUIRED':'CURRENT';
    if(stale){staleSignals++;playerReview=true;review.push(`${name} ${signalName} stale ${round(ageHours,2)}h > ${maxAge}h`);}else currentSignals++;
    outSignals[signalName]={...s,position:undefined,status,age_hours:round(ageHours,3),freshness_limit_hours:maxAge,stat_adjustments:adj,sportsbook_inputs_used:false};
  }
  players[name]={position:pos,prior_player:p.prior_player||null,expected_active:p.expected_active!==false,context_status:playerReview?'REVIEW_REQUIRED':'PASS',signals:outSignals};
}

const generatedAt=new Date().toISOString();
const output={schema_version:'2.0.0',season:2026,week:src.week??null,status:src.status==='SELF_TEST'?'SELF_TEST':(review.length?'REVIEW_REQUIRED':src.status||'NORMALIZED'),generated_at:generatedAt,sportsbook_inputs_used:false,players};
const report={generated_at:generatedAt,result:blocked.length?'BLOCKED':(review.length?'REVIEW_REQUIRED':'PASS'),mode:'SHADOW_ONLY',actionable:false,input_status:src.status,players:Object.keys(players).length,current_signals:currentSignals,stale_signals:staleSignals,invalid_signals:invalidSignals,review,blocked,sportsbook_inputs_used:false,safeguards:['Every normalized signal has source and capture time.','Signal freshness is category-specific; injury uses the existing 12-hour limit.','Stale signals are preserved for audit but marked STALE_REVIEW_REQUIRED so projection code can exclude them.','Missing signals remain missing and are not converted to zero or neutral evidence.','Per-signal mean/uncertainty adjustments are bounded by the source contract.','Market/sportsbook language in source/evidence blocks normalization.']};
fs.writeFileSync(path.join(root,outPath),JSON.stringify(output,null,2)+'\n');
fs.writeFileSync(path.join(root,reportPath),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);
if(process.argv.includes('--require-current')&&review.length)process.exit(2);
