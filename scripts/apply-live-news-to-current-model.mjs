// Acceptance proof 2: consecutive post-merge autonomous live-news production test.
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(x,null,2)+'\n');};
const lower=x=>String(x||'').toLowerCase();
const esc=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const splitClauses=t=>String(t||'').split(/(?<=[.!?;])\s+|\n+|\s+[—–-]\s+/).map(x=>x.trim()).filter(Boolean);
const mentionsFullName=(text,name)=>{const n=lower(name).trim();return !!n&&new RegExp(`(^|[^a-z])${esc(n)}([^a-z]|$)`,'i').test(lower(text));};
const structuredSubjectMatches=(signal,name)=>[signal?.player,signal?.player_name,signal?.subject,signal?.athlete].some(x=>x&&lower(x).trim()===lower(name).trim());
function boundSignalView(name,signal){
  const fields=[signal?.headline,signal?.description,signal?.body_text,signal?.matched_context].filter(Boolean);
  let excerpts=[];
  if(structuredSubjectMatches(signal,name))excerpts=fields;
  else for(const field of fields)for(const clause of splitClauses(field))if(mentionsFullName(clause,name))excerpts.push(clause);
  excerpts=[...new Set(excerpts.map(x=>String(x).trim()).filter(Boolean))];
  if(!excerpts.length)return null;
  return {summary:excerpts.slice(0,3).join(' | ').slice(0,700),source:signal?.url||signal?.source||null,published:signal?.published||null};
}

const source=read('MODEL_SOURCE_OF_TRUTH.json');
const expected=Number(source.active_player_model);
if(expected!==166) throw new Error(`Canonical universe must be 166; found ${expected}`);
let active=[];for(let i=0;i<Number(source.runtime_player_shards);i++) active.push(...read(`players${i}.json`));
const names=active.map(p=>p.n);
if(active.length!==166||new Set(names).size!==166) throw new Error(`Loaded canonical universe is not 166 unique players: ${active.length}/${new Set(names).size}`);
const review=read('guardrails/current-football-review.json');
const taxonomy=read('analysis/full-universe-reconciliation-taxonomy-current.json');
const recalc=read('analysis/substantive-component-recalculation-current.json');
const adjudication=read('analysis/live-news-decision-audit-current.json');
const patchPath=source.current_update_layer||'current162patch-2026-08-24.json';
const patch=read(patchPath);
if(!patch.players||typeof patch.players!=='object') throw new Error('Current update layer missing players map');
for(const n of names) if(!patch.players[n]) throw new Error(`Current update layer missing canonical player: ${n}`);
const taxBy=new Map((taxonomy.rows||[]).map(x=>[x.player,x]));
const calcBy=new Map((recalc.rows||[]).map(x=>[x.player,x]));
const reviewBy=new Map((review.players||[]).map(x=>[x.player,x]));
const decisionBy=new Map((adjudication.decisions||[]).map(x=>[x.player,x]));
if(reviewBy.size!==166) throw new Error(`Review coverage ${reviewBy.size}/166`);
if(decisionBy.size!==166||adjudication.counts?.self_audit_errors!==0) throw new Error(`Decision/self-audit coverage failed: ${decisionBy.size}/166`);
const now=new Date().toISOString();
let material=0,numeric=0,noChange=0,preservedNews=0,adjudicatedCount=0,unboundSuppressed=0;
for(const name of names){
  const p=patch.players[name],r=reviewBy.get(name),t=taxBy.get(name)||null,c=calcBy.get(name)||null,d=decisionBy.get(name);
  if(!d) throw new Error(`Missing adjudicated current-model decision for ${name}`);
  const previousNews=p.newsFeedState&&typeof p.newsFeedState==='object'?p.newsFeedState:null;
  const signals=Array.isArray(r?.material_news_signals)?r.material_news_signals:[];
  const candidateMaterial=r?.status==='MATERIAL_CHANGE'||signals.length>0||(t&&t.taxonomy!=='NO_MATERIAL_UPDATE');
  const boundViews=signals.map(s=>boundSignalView(name,s)).filter(Boolean);
  const acceptedMaterial=candidateMaterial&&d.binding_status==='PLAYER_SPECIFIC'&&boundViews.length>0;
  const summaries=boundViews.slice(0,5).map(x=>x.summary).filter(Boolean);
  const sources=boundViews.slice(0,5).map(x=>x.source).filter(Boolean);
  if(candidateMaterial&&d.status!=='ADJUDICATED') throw new Error(`${name}: candidate material evidence reached apply layer without an adjudicated decision`);
  if(d.binding_status==='UNBOUND_MATERIAL_EVIDENCE'&&(d.player_effect!=='HOLD'||d.season_long_effect!=='HOLD')) throw new Error(`${name}: unbound evidence attempted a model move`);

  p.currentModelDecision={updated_at:now,status:d.status,horizon:d.horizon,player_effect:d.player_effect,near_term_projection:d.near_term_projection||'HOLD',season_long_effect:d.season_long_effect,confidence:d.confidence,binding_status:d.binding_status||null,reason:d.reason,connected_player_effects:d.connected_player_effects||[],self_audit:'PASS'};
  p.currentModelImpact={updated_at:now,review_status:r?.status||'REVIEWED_NO_CHANGE',taxonomy:t?.taxonomy||'NO_MATERIAL_UPDATE',candidate_material:!!candidateMaterial,material:!!acceptedMaterial,binding_status:d.binding_status||null,reason:acceptedMaterial?(r?.reason||null):null,source_summary:acceptedMaterial?(r?.source_summary||null):null,headlines:summaries,sources,implicated_components:acceptedMaterial?(c?.implicated_components||[]):[],projection_readiness:acceptedMaterial?(c?.projection_readiness||null):null,numeric_status:acceptedMaterial?(c?.status||'NOT_TRIGGERED'):'NOT_TRIGGERED',proposed_projected_ppr:acceptedMaterial?(c?.proposed_projected_ppr??null):null,proposed_score:acceptedMaterial?(c?.proposed_score??null):null,proposed_true_value_rank:acceptedMaterial?(c?.proposed_true_value_rank??null):null,score_delta:acceptedMaterial?(c?.score_delta??0):0,decision:p.currentModelDecision};

  if(acceptedMaterial){
    material++;adjudicatedCount++;
    p.newsFeedState={updated_at:now,last_reviewed_at:now,reviewed:true,material:true,latest_headlines:summaries,sources};
    p.ns=`${now.slice(0,10)} LIVE NEWS MODEL DECISION`;
    p.nm=(summaries.join(' | ')||'Player-specific material current football evidence detected.').slice(0,700);
    p.na=`${d.horizon}: ${d.player_effect}; near-term projection ${d.near_term_projection||'HOLD'}; season-long ${d.season_long_effect}. ${d.reason}`.slice(0,700);
  } else {
    noChange++;
    if(candidateMaterial&&d.binding_status==='UNBOUND_MATERIAL_EVIDENCE')unboundSuppressed++;
    if(previousNews&&(previousNews.material||Array.isArray(previousNews.latest_headlines)&&previousNews.latest_headlines.length)){
      p.newsFeedState={...previousNews,last_reviewed_at:now,reviewed:true,preserved_due_to_no_new_material:true,unbound_candidate_suppressed:candidateMaterial&&d.binding_status==='UNBOUND_MATERIAL_EVIDENCE'};
      preservedNews++;
    } else {
      p.newsFeedState={updated_at:previousNews?.updated_at||now,last_reviewed_at:now,reviewed:true,material:false,latest_headlines:previousNews?.latest_headlines||[],sources:previousNews?.sources||[],preserved_due_to_no_new_material:false,unbound_candidate_suppressed:candidateMaterial&&d.binding_status==='UNBOUND_MATERIAL_EVIDENCE'};
    }
  }
  if(acceptedMaterial&&c&&c.status==='NUMERIC_TV_PROPOSAL') numeric++;
}
patch.updated=now.slice(0,10);
patch.model=`single 166-player active board — live news/model decisions synced ${now}`;
patch.live_news_model_sync={updated_at:now,players:166,material_players:material,adjudicated_material_players:adjudicatedCount,numeric_proposals:numeric,no_material_update:noChange,preserved_latest_news_players:preservedNews,unbound_candidates_suppressed:unboundSuppressed,decision_policy:'PLAYER_SPECIFIC_BINDING_THEN_DECIDE_THEN_SELF_AUDIT',source_review:'guardrails/current-football-review.json',taxonomy:'analysis/full-universe-reconciliation-taxonomy-current.json',recalculation:'analysis/substantive-component-recalculation-current.json',adjudication:'analysis/live-news-decision-audit-current.json'};
write(patchPath,patch);
write('guardrails/live-news-model-application-report.json',{result:'PASS',generated_at:now,universe:166,patch:patchPath,material_players:material,adjudicated_material_players:adjudicatedCount,numeric_proposals:numeric,no_material_update:noChange,preserved_latest_news_players:preservedNews,unbound_candidates_suppressed:unboundSuppressed,decision_self_audit:'PASS',static_evaluation_mutated:false});
console.log(JSON.stringify({result:'PASS',universe:166,material_players:material,adjudicated_material_players:adjudicatedCount,numeric_proposals:numeric,no_material_update:noChange,preserved_latest_news_players:preservedNews,unbound_candidates_suppressed:unboundSuppressed,decision_self_audit:'PASS',patch:patchPath},null,2));