import {numericInjuryAdjustmentAllowed} from '../lib/injury-ranking-policy.mjs';
import {weeklyRankStatus,fantasyInjuryStatus} from '../lib/weekly-ranking-availability.mjs';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(x,null,2)+'\n');};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const finite=x=>Number.isFinite(Number(x));
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');

const source=read('MODEL_SOURCE_OF_TRUTH.json');
const policy=read('data/sources/in-season-ranking-policy-2026.json');
const expected=Number(source.active_player_model);
const shards=Number(source.runtime_player_shards);
if(!Number.isInteger(expected)||expected<=0) throw new Error(`Invalid active_player_model ${source.active_player_model}`);
if(!Number.isInteger(shards)||shards<=0) throw new Error(`Invalid runtime_player_shards ${source.runtime_player_shards}`);

let canonical=[];
for(let i=0;i<shards;i++) canonical.push(...read(`players${i}.json`));
const unique=new Set(canonical.map(p=>norm(p.n)));
if(canonical.length!==expected||unique.size!==expected) throw new Error(`Canonical universe mismatch ${canonical.length}/${unique.size}; expected ${expected}/${expected}`);

const contextPath='data/probability/weekly-football-context-inputs-2026.json';
const context=fs.existsSync(path.join(root,contextPath))?read(contextPath):{week:null,players:{}};
const byContext=new Map(Object.entries(context.players||{}).map(([name,v])=>[norm(name),v]));
const opponentMultiplier=Number(policy.weekly_rank_policy?.opponent_signal_multiplier??1.2);
if(!finite(opponentMultiplier)||opponentMultiplier<1||opponentMultiplier>1.5) throw new Error(`Invalid opponent_signal_multiplier ${opponentMultiplier}`);

function signalMean(signal){
  if(!signal||signal.status!=='CURRENT') return null;
  const vals=Object.values(signal.stat_adjustments||{}).map(x=>Number(x?.mean_pct)).filter(Number.isFinite);
  if(!vals.length) return 0;
  return vals.reduce((a,b)=>a+b,0)/vals.length;
}

function weeklyAdjustment(c){
  if(!c) return {pct:0,parts:[],availability:'MISSING_CONTEXT'};
  const parts=[];
  for(const [name,signal] of Object.entries(c.signals||{})){
    if(name==='injury'&&!numericInjuryAdjustmentAllowed(signal))continue;
    const avg=signalMean(signal);
    if(avg==null) continue;
    const weight=name==='opponent'?opponentMultiplier:1;
    parts.push({signal:name,raw_mean_pct:Number(avg.toFixed(4)),weight,weighted_mean_pct:Number((avg*weight).toFixed(4))});
  }
  let pct=parts.reduce((s,x)=>s+x.weighted_mean_pct,0);
  pct=clamp(pct,-.25,.25);
  // Injury/role effects already present in sourced adjustments remain intact.
  // An absent active-list confirmation adds no fabricated four-percent penalty.
  return {pct:Number(pct.toFixed(4)),parts,availability:c.expected_active===true?'EXPECTED_ACTIVE':c.expected_active===false?'EXPECTED_INACTIVE':'UNKNOWN'};
}

const schedulePath=path.join(root,'data/calibration/weekly-event-schedule-2026.json');const schedule=fs.existsSync(schedulePath)?read('data/calibration/weekly-event-schedule-2026.json'):null;
const byGame=new Map(Object.entries(schedule?.week===context.week?schedule.games||{}:{}).flatMap(([id,g])=>(g.players||[]).map(n=>[norm(n),{id,...g}])));
const rankNow=Date.now();
const personnelPath='data/ingestion/team-personnel-2026.json';
const personnel=fs.existsSync(personnelPath)?read(personnelPath):null;
const rosterTime=Date.parse(personnel?.captured_at);
const rosterCurrent=personnel?.season===2026&&personnel?.week===context.week&&Number.isFinite(rosterTime)&&rosterTime<=rankNow&&rankNow-rosterTime<=24*3600000;
const rosterByName=new Map(rosterCurrent?(personnel.canonical_reconciliation||[]).map(p=>[norm(p.player),p.status]):[]);
const rows=canonical.map(p=>{
  const rawContext=byContext.get(norm(p.n))||null;const rosterStatus=rosterByName.get(norm(p.n));
  const c=rawContext?{...rawContext,ranking_roster_observed:rosterStatus==='MATCH',ranking_identity_status:rosterStatus||null}:null;
  const adj=weeklyAdjustment(c);const game=byGame.get(norm(p.n));const rankStatus=weeklyRankStatus(c,game,rankNow);const injury=fantasyInjuryStatus(c,rankNow);
  const base=finite(p.s)?Number(p.s):0;
  const weeklyScore=base*(1+adj.pct);
  return {
    player:p.n,
    position:p.p,
    team:p.t,
    ros_overall_rank:Number(p.o),
    ros_position_rank:p.pr,
    true_value_rank:Number(p.tr),
    true_value_score:base,
    weekly_rank_status:rankStatus,weekly_actionable:rankStatus==='MODEL_RANK',weekly_game_id:game?.id||null,weekly_kickoff:game?.event_start||null,
    weekly_score:['MODEL_RANK','PROVISIONAL_AVAILABILITY_REVIEW'].includes(rankStatus)?Number(weeklyScore.toFixed(5)):null,
    weekly_adjustment_pct:adj.pct,
    weekly_availability:injury.designation||((c?.expected_active===false)?'EXPECTED_INACTIVE':c?.signals?.role?.status==='CURRENT'?'NO_ADVERSE_STATUS_REPORTED':'UNKNOWN'),
    injury_status:injury.designation,injury_tag:injury.tag,injury_label:injury.label,injury_reported_at:injury.source_updated_at,
    game_status_confirmed:false,
    weekly_matchup_context:{opponent_signal_multiplier:opponentMultiplier,components:adj.parts},
    weekly_overall_rank:null,
    weekly_position_rank:null
  };
});

rows.sort((a,b)=>b.weekly_score-a.weekly_score||a.ros_overall_rank-b.ros_overall_rank||a.player.localeCompare(b.player));
const ranked=rows.filter(r=>['MODEL_RANK','PROVISIONAL_AVAILABILITY_REVIEW'].includes(r.weekly_rank_status));ranked.forEach((r,i)=>r.weekly_overall_rank=i+1);
const posCounts={};
for(const r of ranked){posCounts[r.position]=(posCounts[r.position]||0)+1;r.weekly_position_rank=`${r.position}${posCounts[r.position]}`;}

const generatedAt=new Date().toISOString();
const out={
  schema_version:'1.0.0',
  season:2026,
  week:context.week??null,
  generated_at:generatedAt,
  mode:'IN_SEASON_ROS_PLUS_WEEKLY',
  source_of_truth:'MODEL_SOURCE_OF_TRUTH.json',
  universe:expected,
  market_policy:{adp:'DISABLED',draft_price_labels:'DISABLED',comparison_targets:['PPR_ROS_OVERALL','PPR_ROS_POSITIONAL']},
  ranking_policy:{true_value:'SEASON_LONG_INDEPENDENT',ros:'SEASON_LONG_ACTIONABLE',weekly:'GAME_DEPENDENT',opponent_signal_multiplier:opponentMultiplier,weekly_schedule_weight:'MODESTLY_ELEVATED'},
  players:Object.fromEntries(rows.map(r=>[r.player,r]))
};

const blocked=[];
if(Object.keys(out.players).length!==expected) blocked.push(`Output universe ${Object.keys(out.players).length}/${expected}`);
if(rows.some(r=>!Number.isInteger(r.ros_overall_rank)||!r.ros_position_rank)) blocked.push('Missing ROS overall or positional rank');
if(ranked.some(r=>!Number.isInteger(r.weekly_overall_rank)||!r.weekly_position_rank)) blocked.push('Missing weekly rank');
if(JSON.stringify(out).match(/\"adp\"\s*:\s*(?!\"DISABLED\")/i)) blocked.push('Active ADP value leaked into in-season ranking output');

write('data/weekly/in-season-ranking-layer-2026.json',out);
write('guardrails/in-season-ranking-layer-report.json',{
  generated_at:generatedAt,
  result:blocked.length?'BLOCKED':'PASS',
  universe:expected,
  week:out.week,
  opponent_signal_multiplier:opponentMultiplier,
  players_with_context:rows.filter(r=>r.weekly_matchup_context.components.length>0).length,
  players_expected_inactive:rows.filter(r=>r.weekly_rank_status==='NOT_EXPECTED_TO_PLAY').length,
  blocked,
  safeguards:[
    'Active universe count is resolved from MODEL_SOURCE_OF_TRUTH.json at runtime.',
    'ADP and draft BUY/FAIR/REACH/FADE are disabled in the in-season ranking layer.',
    'Questionable/doubtful players retain model ranks with injury badges; missing active-list confirmation is not an automatic penalty.',
    'ROS overall and positional ranks remain separate from the game-dependent weekly layer.',
    'Opponent/SOS context is modestly upweighted only in the weekly layer and cannot rewrite season-long True Value by itself.',
    'Weekly context adjustments are capped at +/-25% and reported inactive players receive no usable weekly score or rank; injury designations persist until superseded.'
  ]
});
console.log(JSON.stringify(read('guardrails/in-season-ranking-layer-report.json'),null,2));
if(blocked.length) process.exit(1);
