import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const exists=p=>fs.existsSync(path.join(root,p));
const write=(p,x)=>{const full=path.join(root,p);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,JSON.stringify(x,null,2)+'\n');};

const source=read('MODEL_SOURCE_OF_TRUTH.json');
const expected=Number(source.active_player_model),shards=Number(source.runtime_player_shards);
let players=[];for(let i=0;i<shards;i++)players.push(...read(`players${i}.json`));
if(players.length!==expected)throw new Error(`Universe mismatch: expected ${expected}, loaded ${players.length}`);
if(new Set(players.map(p=>p.n)).size!==expected)throw new Error('Duplicate canonical player names');

const weights={p:.35,c:.20,r:.15,e:.10,a:.10,w:.05,s:.05};
const aliases={p:'pd',c:'ce',r:'r',e:'e',a:'a',w:'rl',s:'su'};
const comp=(p,k)=>Number(p[aliases[k]]);
const calcScore=p=>Object.entries(weights).reduce((sum,[k,w])=>sum+comp(p,k)*w,0);
const scoreIntegrity=[];
for(const p of players){const calc=calcScore(p),stored=Number(p.s),delta=Number((stored-calc).toFixed(6));if(!Number.isFinite(calc)||!Number.isFinite(stored)||Math.abs(delta)>.001)scoreIntegrity.push({player:p.n,status:'WEIGHTED_SCORE_MISMATCH',stored:Number.isFinite(stored)?stored:null,calculated:Number.isFinite(calc)?Number(calc.toFixed(6)):null,delta:Number.isFinite(delta)?delta:null});}

const review=exists('guardrails/current-football-review.json')?read('guardrails/current-football-review.json'):null;
const recalculation=exists('analysis/substantive-component-recalculation-current.json')?read('analysis/substantive-component-recalculation-current.json'):null;
const recalcBy=new Map((recalculation?.rows||[]).map(x=>[x.player,x]));
const reviewPlayers=review?.players||[];
const reviewBy=new Map(reviewPlayers.map(x=>[x.player,x]));
const statusMaterial=new Set(reviewPlayers.filter(x=>x.status==='MATERIAL_CHANGE').map(x=>x.player));
const newsMaterial=new Set(reviewPlayers.filter(x=>Array.isArray(x.material_news_signals)&&x.material_news_signals.length).map(x=>x.player));
const triggers=new Set([...statusMaterial,...newsMaterial,...recalcBy.keys()]);
const connected=(review?.materially_implicated_untracked||[]).filter(x=>Array.isArray(x.material_news_signals)&&x.material_news_signals.length).map(x=>({player:x.player,team:x.team||null,position:x.position||null,depth_rank:x.depth_rank??null,decision:x.decision||null,reason:x.reason||null,material_news_signals:x.material_news_signals}));

const proposals=[],blocked=[],reviewedNoChange=[],holds=[];
for(const p of [...players].sort((a,b)=>a.o-b.o)){
  const r=reviewBy.get(p.n),rc=recalcBy.get(p.n);
  const base={player:p.n,pos:p.p,current_true_value_rank:p.tr,current_overall_rank:p.o,current_score:Number(p.s),projected_ppr:Number.isFinite(Number(p.mp))?Number(p.mp):null,components:{production:comp(p,'p'),ceiling:comp(p,'c'),role_volume:comp(p,'r'),offensive_environment:comp(p,'e'),availability:comp(p,'a'),weekly_reliability:comp(p,'w'),sustainability:comp(p,'s')},material_news_signals:Array.isArray(r?.material_news_signals)?r.material_news_signals:[]};
  if(!triggers.has(p.n)){holds.push({...base,status:'NO_SUBSTANTIVE_TRIGGER',evidence_status:r?.status||'NO_CURRENT_REVIEW_RECORD'});continue;}
  const triggerTypes=[];if(statusMaterial.has(p.n))triggerTypes.push('VERIFIED_MATERIAL_STATUS');if(newsMaterial.has(p.n))triggerTypes.push('MATERIAL_NEWS_SIGNAL');
  if(!rc){blocked.push({...base,status:'BLOCKED_RECALCULATION_NOT_RUN',trigger_types:triggerTypes,proposed_true_value_rank:null,proposed_overall_rank:null,approval_required:false});continue;}
  if(rc.status==='NUMERIC_TV_PROPOSAL'){
    proposals.push({...base,status:'RANK_MOVE_PROPOSED',trigger_types:triggerTypes,proposed_projected_ppr:rc.proposed_projected_ppr,proposed_components:rc.proposed_components,proposed_score:rc.proposed_score,proposed_true_value_rank:rc.proposed_true_value_rank,proposed_overall_rank:null,overall_status:'PENDING_APPROVED_STRATEGY_OVERLAY',implicated_components:rc.implicated_components,approval_required:true});
  }else if(rc.status==='REVIEW_NO_CHANGE'){
    reviewedNoChange.push({...base,status:'REVIEW_NO_CHANGE',trigger_types:triggerTypes,proposed_true_value_rank:p.tr,proposed_overall_rank:p.o,implicated_components:rc.implicated_components,approval_required:false});
  }else{
    blocked.push({...base,status:rc.status||'BLOCKED_MISSING_QUANTITATIVE_EVIDENCE',trigger_types:triggerTypes,implicated_components:rc.implicated_components||[],context_readiness:rc.context_readiness||null,projection_readiness:rc.projection_readiness||null,proposed_true_value_rank:null,proposed_overall_rank:null,approval_required:false});
  }
}

const report={schema_version:'2.0.0',generated_at:new Date().toISOString(),authoritative:false,mutation_policy:'PROPOSAL_ONLY_NO_CANONICAL_WRITES',universe:{expected_players:expected,loaded_players:players.length,runtime_player_shards:shards,source_state:source.status||source.state||null},evidence:{current_football_review_present:Boolean(review),review_scope:review?.review_scope||null,review_completed_at:review?.sweep_completed_at||null,verified_material_status_players:statusMaterial.size,tracked_material_news_signal_players:newsMaterial.size,triggered_players:triggers.size,connected_material_news_signal_players:connected.length,recalculation_present:Boolean(recalculation),recalculation_counts:recalculation?.counts||null},score_formula:{weights,integrity_issue_count:scoreIntegrity.length,integrity_issues:scoreIntegrity},rules:['Market movement alone cannot change intrinsic True Value or Overall rank.','Verified material developments and material news signals force substantive evaluation.','Triggered players with incomplete structured evidence are BLOCKED, never silently HOLD.','Numeric True-Value proposals require actionable quantitative football evidence.','Overall proposals remain pending until the approved strategy overlay is applied.','Consequential existing-player changes require exact current-to-proposed approval before canonical apply.'],proposals,proposal_count:proposals.length,reviewed_no_change:reviewedNoChange,reviewed_no_change_count:reviewedNoChange.length,blocked,blocked_count:blocked.length,connected_impact_candidates:connected,connected_impact_candidate_count:connected.length,holds,holds_count:holds.length};
write('analysis/substantive-rank-proposals-current.json',report);

const lines=['# Substantive Rank Proposal Audit','',`Generated: ${report.generated_at}`,`Universe: ${expected} players / ${shards} shards`,'Authoritative: NO — proposal-only; canonical boards are not written.',`Triggered players: ${report.evidence.triggered_players}`,`Numeric TV proposals: ${report.proposal_count}`,`Reviewed no-change: ${report.reviewed_no_change_count}`,`Blocked missing/incomplete quantitative evidence: ${report.blocked_count}`,`Connected-player impact candidates: ${report.connected_impact_candidate_count}`,`Weighted-score integrity issues: ${report.score_formula.integrity_issue_count}`,''];
if(proposals.length){lines.push('| Player | Current TV | Proposed TV | Current Overall | Proposed Overall | Components changed |','|---|---:|---:|---:|---:|---|');for(const x of proposals)lines.push(`| ${x.player} | ${x.current_true_value_rank} | ${x.proposed_true_value_rank} | ${x.current_overall_rank} | PENDING | ${(x.implicated_components||[]).join(', ')} |`);}else lines.push('No triggered player currently has enough actionable quantitative evidence to produce a numeric True-Value rank proposal.');
if(blocked.length){lines.push('','## Blocked substantive evaluations','', '| Player | Why blocked | Implicated components |','|---|---|---|');for(const x of blocked)lines.push(`| ${x.player} | ${x.projection_readiness?.reason||x.context_readiness?.reason||x.status} | ${(x.implicated_components||[]).join(', ')} |`);}
if(reviewedNoChange.length){lines.push('','## Reviewed no-change','',reviewedNoChange.map(x=>`- ${x.player}: trigger reviewed; quantitative change below material threshold.`).join('\n'));}
if(connected.length){lines.push('','## Connected-player impact candidates','', '| Connected player | Team | Pos | Depth | Trigger |','|---|---|---|---:|---|');for(const x of connected){const n=x.material_news_signals?.[0];lines.push(`| ${x.player} | ${x.team||''} | ${x.position||''} | ${x.depth_rank??''} | ${String(n?.headline||x.reason||'Material connected-player news').replace(/\|/g,'/')} |`);}}
lines.push('','Blocked means the system detected a substantive trigger but does not yet have enough validated quantitative evidence to calculate a defensible rank change. It is not a HOLD.');
fs.writeFileSync(path.join(root,'analysis/substantive-rank-proposals-current.md'),lines.join('\n')+'\n');
console.log(JSON.stringify({players:expected,triggers:triggers.size,numeric_proposals:proposals.length,reviewed_no_change:reviewedNoChange.length,blocked:blocked.length,connected:connected.length,score_integrity_issues:scoreIntegrity.length,canonical_writes:false},null,2));
