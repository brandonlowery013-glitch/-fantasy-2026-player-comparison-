import fs from 'node:fs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,x)=>{fs.mkdirSync(p.split('/').slice(0,-1).join('/'),{recursive:true});fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n');};
const src=read('MODEL_SOURCE_OF_TRUTH.json');
const expected=Number(src.active_player_model);
const core=read(src.current_update_layer);
const players=Object.values(core.players||{});
if(players.length!==expected) throw new Error(`canonical player count ${players.length}/${expected}`);
if(new Set(players.map(p=>p.n)).size!==expected) throw new Error('duplicate canonical player names');
const overallRanks=players.map(p=>Number(p.o)).sort((a,b)=>a-b);
if(overallRanks.some((r,i)=>r!==i+1)) throw new Error('Overall ranks are not unique 1..N');

let oldFlags=[]; try{oldFlags=read('overall-rank-review-names.json');}catch{}
const oldFlagMap=new Map(oldFlags.map(x=>[x.name,x]));
let camp=null, transition=null;
try{camp=read('guardrails/retroactive-camp-backfill-report.json');}catch{}
try{transition=read('analysis/transition-intelligence-current.json');}catch{}
const campMap=new Map((camp?.rows||[]).map(x=>[x.player,x]));
const transitionMap=new Map((transition?.rows||[]).map(x=>[x.player,x]));

const pprSorted=[...players].sort((a,b)=>Number(b.mp||0)-Number(a.mp||0));
const pprRank=new Map(pprSorted.map((p,i)=>[p.n,i+1]));
const riskRe=/OUT|IR|PUP|NFI|SUSP|INJUR|LIMITED|SORE|REHAB|RECOVER|QUESTION|SETBACK|WATCH/i;
const negativeRe=/DOWN|REDUC|LOSE|LOSING|LIMIT|BACKUP|COMMITTEE|TIMESHARE|SPLIT|OUT|IR|PUP|NFI|SUSP|SETBACK/i;
const positiveRe=/UP|EXPAND|LEAD|START|FEATURED|FIRST TEAM|WITH THE ONES|RETURNED|CLEARED|FULL TEAM/i;

const rows=[...players].sort((a,b)=>Number(b.o)-Number(a.o)).map((p,index)=>{
  const campRow=campMap.get(p.n)||null;
  const tr=transitionMap.get(p.n)||null;
  const pr=pprRank.get(p.n);
  const tv=Number(p.tr);
  const overall=Number(p.o);
  const tvGap=overall-tv;
  const pprGap=overall-pr;
  const prior=oldFlagMap.get(p.n)||null;
  const text=[p.st,p.nm,p.na,tr?.current_state?.summary,tr?.current_state_basis,tr?.timeline_summary].filter(Boolean).join(' | ');
  const materialCamp=Number(campRow?.evidence_count||0)>0;
  const sourceGap=campRow?.status==='SOURCE_COVERAGE_GAP';
  const explicitRisk=riskRe.test(String(p.st||''));
  const negative=negativeRe.test(text);
  const positive=positiveRe.test(text);
  let verdict='HOLD_PLACEMENT';
  const reasons=[];
  if(sourceGap){verdict='EVIDENCE_COVERAGE_BLOCK';reasons.push('retroactive camp source coverage gap');}
  if(prior){reasons.push('previously flagged placement'); if(verdict==='HOLD_PLACEMENT') verdict='RECHECK_PLACEMENT';}
  if(Math.abs(tvGap)>=12){reasons.push(`Overall↔TrueValue gap ${tvGap}`); if(verdict==='HOLD_PLACEMENT') verdict='RECHECK_PLACEMENT';}
  if(Math.abs(pprGap)>=15){reasons.push(`Overall↔PPR projection gap ${pprGap}`); if(verdict==='HOLD_PLACEMENT') verdict='RECHECK_PLACEMENT';}
  if(materialCamp){reasons.push(`retroactive camp material evidence ${campRow.evidence_count}`); if(verdict==='HOLD_PLACEMENT') verdict='RECHECK_PLACEMENT';}
  if(explicitRisk){reasons.push(`current status risk: ${p.st}`); if(verdict==='HOLD_PLACEMENT') verdict='RECHECK_PLACEMENT';}
  let direction='NONE';
  if(verdict==='RECHECK_PLACEMENT'){
    const intrinsicUp=tvGap>=10&&pprGap>=5;
    const intrinsicDown=tvGap<=-10&&pprGap<=-5;
    if((intrinsicUp||positive)&&!negative) direction='UP';
    else if(intrinsicDown||negative||explicitRisk) direction='DOWN';
    else direction='CONTEXT';
  }
  if(verdict==='EVIDENCE_COVERAGE_BLOCK') direction='BLOCKED';
  return {
    audit_sequence:index+1,
    overall_rank:overall,
    player:p.n,
    position:p.p,
    team:p.t,
    true_value_rank:tv,
    ppr_projection_rank:pr,
    overall_true_value_gap:tvGap,
    overall_projection_gap:pprGap,
    projected_ppr:p.mp,
    true_value_score:p.s,
    market_label:p.px,
    adp:p.ad,
    status:p.st,
    previous_flag:prior,
    retroactive_camp_status:campRow?.status||'NOT_GENERATED_IN_THIS_RUN',
    retroactive_camp_evidence_count:Number(campRow?.evidence_count||0),
    transition_evidence_count:Number(tr?.development_evidence?.length||0),
    placement_verdict:verdict,
    review_direction:direction,
    reasons
  };
});
if(rows.length!==expected||rows[0].overall_rank!==expected||rows.at(-1).overall_rank!==1) throw new Error('Backwards coverage contract failed');
const counts=rows.reduce((a,r)=>{a[r.placement_verdict]=(a[r.placement_verdict]||0)+1;return a;},{});
const directions=rows.reduce((a,r)=>{a[r.review_direction]=(a[r.review_direction]||0)+1;return a;},{});
const report={
  generated_at:new Date().toISOString(),
  season:src.season,
  universe:expected,
  order:'OVERALL_166_TO_1',
  authority:'AUDIT_ONLY_NO_AUTOMATIC_RANK_MUTATION',
  methodology:{
    canonical_source:src.current_update_layer,
    required_inputs:['canonical Overall rank','True Value rank','projected PPR rank','current status','prior placement flags','retroactive camp evidence when generated','transition evidence when generated'],
    rule:'Every active player receives one row. Prior flags are evidence, not scope. Coverage gaps block a final hold. Material evidence or large cross-signal gaps reopen placement for adjudication; no rank changes occur automatically.'
  },
  coverage:{reviewed:rows.length,expected,first_audited_rank:rows[0].overall_rank,last_audited_rank:rows.at(-1).overall_rank,complete:rows.length===expected},
  counts,
  directions,
  rows
};
write('analysis/full-overall-backwards-audit-current.json',report);
const md=[];
md.push(`# Full Overall Backwards Audit — ${src.season}`,'',`Coverage: ${rows.length}/${expected} players, Overall #${expected} → #1.`,'','| Seq | Overall | Player | Pos | TV | PPR proj rank | Verdict | Direction |','|---:|---:|---|---|---:|---:|---|---|');
for(const r of rows) md.push(`| ${r.audit_sequence} | ${r.overall_rank} | ${r.player.replace(/\|/g,'/')} | ${r.position} | ${r.true_value_rank} | ${r.ppr_projection_rank} | ${r.placement_verdict} | ${r.review_direction} |`);
fs.writeFileSync('analysis/full-overall-backwards-audit-current.md',md.join('\n')+'\n');
console.log(JSON.stringify({status:'PASS',coverage:`${rows.length}/${expected}`,order:`${expected}->1`,counts,directions},null,2));
