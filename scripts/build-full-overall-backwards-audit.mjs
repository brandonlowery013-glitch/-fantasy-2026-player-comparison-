import fs from 'node:fs';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,x)=>{fs.mkdirSync(p.split('/').slice(0,-1).join('/'),{recursive:true});fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n');};
const src=read('MODEL_SOURCE_OF_TRUTH.json');
const expected=Number(src.active_player_model),core=read(src.current_update_layer),players=Object.values(core.players||{});
if(players.length!==expected)throw new Error(`canonical player count ${players.length}/${expected}`);if(new Set(players.map(p=>p.n)).size!==expected)throw new Error('duplicate canonical player names');
const ranks=players.map(p=>Number(p.o)).sort((a,b)=>a-b);if(ranks.some((r,i)=>r!==i+1))throw new Error('Overall ranks are not unique 1..N');
let oldFlags=[];try{oldFlags=read('overall-rank-review-names.json');}catch{}const oldFlagMap=new Map(oldFlags.map(x=>[x.name,x]));
let camp=null,transition=null;try{camp=read('guardrails/retroactive-camp-backfill-report.json');}catch{}try{transition=read('analysis/transition-intelligence-current.json');}catch{}
const campMap=new Map((camp?.rows||[]).map(x=>[x.player,x])),transitionMap=new Map((transition?.rows||[]).map(x=>[x.player,x]));
const pprSorted=[...players].sort((a,b)=>Number(b.mp||0)-Number(a.mp||0)),pprRank=new Map(pprSorted.map((p,i)=>[p.n,i+1]));
const canonicalRisk=/OUT|\bIR\b|PUP|NFI|SUSP|INJUR|LIMITED|SORE|REHAB|RECOVER|QUESTION|SETBACK|WATCH/i;
const stalePhase=/\bCAMP\b|PRESEASON|ROSTER CUT/i;
const meaningfulCats=new Set(['role_usage','competition','readiness','prior_season_injury_recovery','development','scheme_install','adaptation','chemistry']);
const usefulDirection=d=>['POSITIVE','NEGATIVE','MIXED'].includes(d);

const rows=[...players].sort((a,b)=>Number(b.o)-Number(a.o)).map((p,index)=>{
  const campRow=campMap.get(p.n)||null,tr=transitionMap.get(p.n)||null,chrono=tr?.chronological_development||{};
  const current=chrono.current_season_state||{},campAudit=chrono.camp_retroactive_audit||{},currentBasis=current.current_state_basis||null,campBasis=campAudit.latest_camp_basis||null;
  const prior=oldFlagMap.get(p.n)||null,overall=Number(p.o),tv=Number(p.tr),pr=pprRank.get(p.n),tvGap=overall-tv,pprGap=overall-pr;
  const sourceGap=campRow?.status==='SOURCE_COVERAGE_GAP',risk=canonicalRisk.test(String(p.st||'')),stale=stalePhase.test(String(p.st||''));
  const currentCats=new Set(currentBasis?.categories||[]),currentMaterial=current.status==='CURRENT_EVIDENCE_FOUND'&&usefulDirection(currentBasis?.direction)&&(currentCats.size===0||[...currentCats].some(c=>meaningfulCats.has(c)));
  const campDirection=campBasis?.direction||null;
  const campContradiction=(campDirection==='NEGATIVE'&&!risk)||(campDirection==='POSITIVE'&&risk);
  const reasons=[],diagnostics=[];let verdict='REVIEWED_HOLD',direction='NONE';
  if(sourceGap){verdict='EVIDENCE_COVERAGE_BLOCK';direction='BLOCKED';reasons.push('retroactive camp source coverage gap');}
  if(prior&&verdict!=='EVIDENCE_COVERAGE_BLOCK'){verdict='RECHECK_PLACEMENT';reasons.push('previously flagged placement requires explicit re-adjudication');}
  if(currentMaterial&&verdict!=='EVIDENCE_COVERAGE_BLOCK'){verdict='RECHECK_PLACEMENT';reasons.push(`new current-season ${currentBasis.direction.toLowerCase()} evidence`);direction=currentBasis.direction==='POSITIVE'?'UP':currentBasis.direction==='NEGATIVE'?'DOWN':'CONTEXT';}
  if(campContradiction&&verdict!=='EVIDENCE_COVERAGE_BLOCK'){verdict='RECHECK_PLACEMENT';reasons.push(`closed-camp ${campDirection.toLowerCase()} trajectory conflicts with canonical status ${p.st||'PASS'}`);if(direction==='NONE')direction=campDirection==='POSITIVE'?'UP':'DOWN';}
  if(stale&&verdict!=='EVIDENCE_COVERAGE_BLOCK'){verdict='RECHECK_PLACEMENT';reasons.push(`canonical status still uses closed-phase wording: ${p.st}`);if(direction==='NONE')direction='CONTEXT';}
  if(prior&&direction==='NONE')direction='CONTEXT';
  if(Math.abs(tvGap)>=12)diagnostics.push(`Overall↔TrueValue gap ${tvGap}`);
  if(Math.abs(pprGap)>=15)diagnostics.push(`Overall↔raw PPR projection gap ${pprGap} (diagnostic only; cross-position PPR does not set actionable rank)`);
  if(Number(campRow?.evidence_count||0)>0)diagnostics.push(`retroactive camp evidence ${campRow.evidence_count} event(s), not an automatic reopen trigger`);
  return{audit_sequence:index+1,overall_rank:overall,player:p.n,position:p.p,team:p.t,true_value_rank:tv,ppr_projection_rank:pr,overall_true_value_gap:tvGap,overall_projection_gap:pprGap,projected_ppr:p.mp,true_value_score:p.s,market_label:p.px,adp:p.ad,status:p.st,previous_flag:prior,retroactive_camp_status:campRow?.status||'NOT_GENERATED_IN_THIS_RUN',retroactive_camp_evidence_count:Number(campRow?.evidence_count||0),transition_evidence_count:Number(tr?.development_evidence?.length||0),camp_latest_basis:campBasis,current_season_basis:currentBasis,placement_verdict:verdict,review_direction:direction,reasons,diagnostics};
});
if(rows.length!==expected||rows[0].overall_rank!==expected||rows.at(-1).overall_rank!==1)throw new Error('Backwards coverage contract failed');
const counts=rows.reduce((a,r)=>(a[r.placement_verdict]=(a[r.placement_verdict]||0)+1,a),{}),directions=rows.reduce((a,r)=>(a[r.review_direction]=(a[r.review_direction]||0)+1,a),{});
const unresolvedPrior=rows.filter(r=>r.previous_flag&&!['RECHECK_PLACEMENT','EVIDENCE_COVERAGE_BLOCK'].includes(r.placement_verdict));if(unresolvedPrior.length)throw new Error(`prior flags silently skipped: ${unresolvedPrior.map(x=>x.player).join(', ')}`);
const report={generated_at:new Date().toISOString(),season:src.season,universe:expected,order:'OVERALL_166_TO_1',authority:'AUDIT_ONLY_NO_AUTOMATIC_RANK_MUTATION',methodology:{canonical_source:src.current_update_layer,required_inputs:['canonical Overall rank','True Value rank','projected PPR rank as diagnostic only','current status','all prior placement flags','retroactive camp evidence','post-camp/current-season evidence'],rule:'Every active player receives one row. Prior flags always reopen. New current-season material evidence reopens. Closed-camp evidence reopens only when it contradicts the canonical status or leaves stale camp/preseason wording. Raw PPR and TV gaps are diagnostics, never automatic actionable-rank mutations. No rank changes occur automatically.'},coverage:{reviewed:rows.length,expected,first_audited_rank:rows[0].overall_rank,last_audited_rank:rows.at(-1).overall_rank,complete:rows.length===expected},counts,directions,rows};
write('analysis/full-overall-backwards-audit-current.json',report);
const md=[`# Full Overall Backwards Audit — ${src.season}`,'',`Coverage: ${rows.length}/${expected} players, Overall #${expected} → #1.`,'','| Seq | Overall | Player | Pos | TV | PPR proj rank | Verdict | Direction |','|---:|---:|---|---|---:|---:|---|---|'];for(const r of rows)md.push(`| ${r.audit_sequence} | ${r.overall_rank} | ${r.player.replace(/\|/g,'/')} | ${r.position} | ${r.true_value_rank} | ${r.ppr_projection_rank} | ${r.placement_verdict} | ${r.review_direction} |`);fs.writeFileSync('analysis/full-overall-backwards-audit-current.md',md.join('\n')+'\n');
console.log(JSON.stringify({status:'PASS',coverage:`${rows.length}/${expected}`,order:`${expected}->1`,prior_flags:oldFlags.length,counts,directions},null,2));
