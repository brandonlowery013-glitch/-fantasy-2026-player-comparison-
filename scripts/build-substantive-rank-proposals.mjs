import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const readJson=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const exists=p=>fs.existsSync(path.join(root,p));
const writeJson=(p,x)=>{const full=path.join(root,p);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,JSON.stringify(x,null,2)+'\n');};

const source=readJson('MODEL_SOURCE_OF_TRUTH.json');
const expected=Number(source.active_player_model);
const shardCount=Number(source.runtime_player_shards);
if(!Number.isInteger(expected)||expected<1) throw new Error('Invalid MODEL_SOURCE_OF_TRUTH active_player_model');
if(!Number.isInteger(shardCount)||shardCount<1) throw new Error('Invalid MODEL_SOURCE_OF_TRUTH runtime_player_shards');

let players=[];
for(let i=0;i<shardCount;i++){
  const file=`players${i}.json`;
  if(!exists(file)) throw new Error(`Missing canonical shard ${file}`);
  players.push(...readJson(file));
}
if(players.length!==expected) throw new Error(`Canonical universe mismatch: expected ${expected}, loaded ${players.length}`);
if(new Set(players.map(p=>p.n)).size!==expected) throw new Error('Duplicate canonical player names');

const weights={p:.35,c:.20,r:.15,e:.10,a:.10,w:.05,s:.05};
const componentValue=(p,key)=>{
  if(p.sc && Number.isFinite(Number(p.sc[key]))) return Number(p.sc[key]);
  const aliases={p:'pd',c:'ce',r:'r',e:'e',a:'a',w:'rl',s:'su'};
  const v=Number(p[aliases[key]]);
  return Number.isFinite(v)?v:null;
};
const weightedScore=p=>{
  const vals=Object.fromEntries(Object.keys(weights).map(k=>[k,componentValue(p,k)]));
  if(Object.values(vals).some(v=>v===null)) return null;
  return Object.entries(weights).reduce((sum,[k,w])=>sum+vals[k]*w,0);
};

const scoreIntegrity=[];
for(const p of players){
  const calc=weightedScore(p);
  const stored=Number(p.s);
  if(calc===null||!Number.isFinite(stored)){
    scoreIntegrity.push({player:p.n,status:'MISSING_COMPONENT_OR_SCORE',stored:Number.isFinite(stored)?stored:null,calculated:calc});
    continue;
  }
  const delta=Number((stored-calc).toFixed(6));
  if(Math.abs(delta)>.001) scoreIntegrity.push({player:p.n,status:'WEIGHTED_SCORE_MISMATCH',stored,calculated:Number(calc.toFixed(6)),delta});
}

const reviewPath='guardrails/current-football-review.json';
let review=null;
if(exists(reviewPath)) review=readJson(reviewPath);
const reviewByName=new Map((review?.players||[]).map(x=>[x.player,x]));
const materialNames=new Set((review?.players||[]).filter(x=>x.status==='MATERIAL_CHANGE').map(x=>x.player));

// Proposal-only by design: verified material evidence creates an evaluation candidate,
// never an invented component delta or automatic ranking mutation.
const proposals=[];
const holds=[];
for(const p of [...players].sort((a,b)=>a.o-b.o)){
  const r=reviewByName.get(p.n);
  const base={player:p.n,pos:p.p,current_true_value_rank:p.tr,current_overall_rank:p.o,current_score:p.s,projected_ppr:p.mp??null,components:{production:componentValue(p,'p'),ceiling:componentValue(p,'c'),role_volume:componentValue(p,'r'),offensive_environment:componentValue(p,'e'),availability:componentValue(p,'a'),weekly_reliability:componentValue(p,'w'),sustainability:componentValue(p,'s')}};
  if(materialNames.has(p.n)){
    proposals.push({...base,status:'REQUIRES_SUBSTANTIVE_EVALUATION',evidence_status:r.status,reason:r.reason||null,source_summary:r.source_summary||null,proposed_true_value_rank:null,proposed_overall_rank:null,proposed_components:null,approval_required:true});
  } else {
    holds.push({...base,status:'NO_VERIFIED_MATERIAL_TRIGGER',evidence_status:r?.status||'NO_CURRENT_REVIEW_RECORD'});
  }
}

const report={
  schema_version:'1.0.0',generated_at:new Date().toISOString(),authoritative:false,
  mutation_policy:'PROPOSAL_ONLY_NO_CANONICAL_WRITES',
  universe:{expected_players:expected,loaded_players:players.length,runtime_player_shards:shardCount,source_state:source.state||null},
  evidence:{current_football_review_present:Boolean(review),review_scope:review?.review_scope||null,review_completed_at:review?.sweep_completed_at||null,material_tracked_players:materialNames.size},
  score_formula:{weights,integrity_issue_count:scoreIntegrity.length,integrity_issues:scoreIntegrity},
  rules:[
    'Market movement alone cannot change intrinsic True Value or Overall rank.',
    'Verified football developments may trigger component/projection re-evaluation.',
    'This builder never infers arbitrary component deltas from a headline.',
    'True-Value and Overall proposals remain null until explicit component/projection evidence is supplied.',
    'Any consequential existing-player rank change requires exact current-to-proposed review and approval before apply.'
  ],
  proposals,proposal_count:proposals.length,holds_count:holds.length,holds
};
writeJson('analysis/substantive-rank-proposals-current.json',report);

const lines=['# Substantive Rank Proposal Audit','',`Generated: ${report.generated_at}`,`Universe: ${expected} players / ${shardCount} shards`,'Authoritative: NO — proposal-only; canonical boards are not written.',`Current football review present: ${report.evidence.current_football_review_present?'YES':'NO'}`,`Verified material tracked triggers: ${report.proposal_count}`,`Weighted-score integrity issues: ${report.score_formula.integrity_issue_count}`,''];
if(proposals.length){
  lines.push('| Player | Current TV | Proposed TV | Current Overall | Proposed Overall | Trigger |','|---|---:|---:|---:|---:|---|');
  for(const x of proposals) lines.push(`| ${x.player} | ${x.current_true_value_rank} | PENDING | ${x.current_overall_rank} | PENDING | ${(x.reason||'Material football evidence').replace(/\|/g,'/')} |`);
}else lines.push('No verified material tracked-player trigger is present in the available current-football review, so this audit proposes **zero intrinsic rank changes**.');
lines.push('','A future material trigger must first produce explicit component/projection changes; only then can this layer calculate and present exact current → proposed True-Value and Overall moves for approval.');
fs.writeFileSync(path.join(root,'analysis/substantive-rank-proposals-current.md'),lines.join('\n')+'\n');
console.log(JSON.stringify({players:expected,shards:shardCount,review_present:Boolean(review),material_triggers:proposals.length,score_integrity_issues:scoreIntegrity.length,canonical_writes:false},null,2));
