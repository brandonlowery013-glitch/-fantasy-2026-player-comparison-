import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = p => JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const exists = p => fs.existsSync(path.join(root,p));
const cfg = read('guardrails/guardrails-config.json');
const source = read('MODEL_SOURCE_OF_TRUTH.json');
const authoritativePlayerCount = Number(source.active_player_model);
const authoritativePlayerShards = Number(source.runtime_player_shards);
if (!Number.isInteger(authoritativePlayerCount) || authoritativePlayerCount <= 0) throw new Error('MODEL_SOURCE_OF_TRUTH active_player_model is invalid');
if (!Number.isInteger(authoritativePlayerShards) || authoritativePlayerShards <= 0) throw new Error('MODEL_SOURCE_OF_TRUTH runtime_player_shards is invalid');
const ledgerPath = process.env.FULL_UNIVERSE_REVIEW_LEDGER || cfg.full_universe_review?.ledger_file || 'guardrails/current-football-review.json';
const allowedTracked = new Set(cfg.full_universe_review?.tracked_statuses || ['NO_MATERIAL_CHANGE','MATERIAL_CHANGE','REVIEWED_NO_CHANGE']);
const allowedUntracked = new Set(cfg.full_universe_review?.untracked_decisions || ['ADMIT','HOLD_OUT','WAIT']);
const errors=[];

let players=[];
for(let i=0;i<authoritativePlayerShards;i++){
  const f=`players${i}.json`;
  if(!exists(f)){errors.push(`missing shard ${f}`);continue;}
  const shard=read(f);
  if(!Array.isArray(shard)){errors.push(`${f} is not an array`);continue;}
  players.push(...shard);
}
const activeNames=players.map(p=>p.n);
const activeSet=new Set(activeNames);
if(activeNames.length!==authoritativePlayerCount) errors.push(`active player count ${activeNames.length} != canonical ${authoritativePlayerCount}`);
if(activeSet.size!==activeNames.length) errors.push('duplicate active player names in shards');

if(!exists(ledgerPath)){
  errors.push(`missing required full-universe football review ledger: ${ledgerPath}`);
}else{
  const ledger=read(ledgerPath);
  const reviewed=Array.isArray(ledger.players)?ledger.players:[];
  const reviewedNames=reviewed.map(x=>x.player);
  const reviewedSet=new Set(reviewedNames);
  const dup=[...new Set(reviewedNames.filter((n,i)=>reviewedNames.indexOf(n)!==i))];
  if(dup.length) errors.push(`duplicate reviewed players: ${dup.join(', ')}`);
  const missing=activeNames.filter(n=>!reviewedSet.has(n));
  const extra=reviewedNames.filter(n=>!activeSet.has(n));
  if(missing.length) errors.push(`active players missing football review (${missing.length}): ${missing.slice(0,40).join(', ')}`);
  if(extra.length) errors.push(`review ledger contains non-active tracked players (${extra.length}): ${extra.slice(0,40).join(', ')}`);
  for(const r of reviewed){
    if(!r.player) errors.push('review entry missing player');
    if(!allowedTracked.has(r.status)) errors.push(`${r.player||'UNKNOWN'} invalid tracked review status: ${r.status}`);
    if(!r.reviewed_at) errors.push(`${r.player||'UNKNOWN'} missing reviewed_at`);
    if(!Array.isArray(r.categories_checked)||r.categories_checked.length===0) errors.push(`${r.player||'UNKNOWN'} missing categories_checked`);
    if(r.status==='MATERIAL_CHANGE' && (!r.reason || !r.source_summary)) errors.push(`${r.player} MATERIAL_CHANGE missing reason/source_summary`);
  }
  const untracked=Array.isArray(ledger.materially_implicated_untracked)?ledger.materially_implicated_untracked:[];
  for(const u of untracked){
    if(!u.player) errors.push('untracked decision missing player');
    if(!allowedUntracked.has(u.decision)) errors.push(`${u.player||'UNKNOWN'} invalid untracked decision: ${u.decision}`);
    if(!u.reason) errors.push(`${u.player||'UNKNOWN'} untracked decision missing reason`);
    const materialSignals=Array.isArray(u.material_news_signals)?u.material_news_signals.length:0;
    const depth=Number(u.depth_rank);
    const pos=String(u.position||'').toUpperCase();
    const admissionLevelRole=(pos==='QB'&&depth===1)||(pos==='RB'&&depth===1)||(pos==='WR'&&depth<=2)||(pos==='TE'&&depth===1);
    const materialContingentRole=materialSignals>0 && ((pos==='RB'&&depth<=2)||(pos==='WR'&&depth<=3)||(pos==='TE'&&depth<=2)||(pos==='QB'&&depth===1));
    if(u.decision==='WAIT' && (admissionLevelRole||materialContingentRole)) errors.push(`${u.player} is defaulted to WAIT despite admission-level standalone/contingent role evidence; disposition must be ADMIT or an explicit HOLD_OUT with evidence`);
    if(u.decision==='ADMIT' && u.onboarding_complete!==true) errors.push(`${u.player} is ADMIT but onboarding_complete is not true`);
    if(u.decision==='ADMIT' && !u.onboarding_manifest) errors.push(`${u.player} is ADMIT but onboarding_manifest is missing`);
  }
  if(!ledger.sweep_started_at || !ledger.sweep_completed_at) errors.push('ledger missing sweep_started_at/sweep_completed_at');
  if(Number(ledger.active_player_count)!==authoritativePlayerCount) errors.push(`ledger active_player_count ${ledger.active_player_count} != canonical ${authoritativePlayerCount}`);
  if(Number(ledger.active_player_shards)!==authoritativePlayerShards) errors.push(`ledger active_player_shards ${ledger.active_player_shards} != canonical ${authoritativePlayerShards}`);
  if(ledger.review_scope!=='FULL_ACTIVE_UNIVERSE_PLUS_CONNECTED') errors.push('review_scope must be FULL_ACTIVE_UNIVERSE_PLUS_CONNECTED');
  if(ledger.camp_preseason_mode===true && ledger.phase==='REGULAR_SEASON') errors.push('camp_preseason_mode must be false once phase is REGULAR_SEASON');
}

const result={generated_at:new Date().toISOString(),ledger_file:ledgerPath,authoritative_player_count:authoritativePlayerCount,authoritative_player_shards:authoritativePlayerShards,canonical_source:'MODEL_SOURCE_OF_TRUTH.json',result:errors.length?'BLOCKED':'PASS',errors};
fs.writeFileSync(path.join(root,'guardrails/full-universe-news-review-report.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
if(errors.length) process.exit(1);
