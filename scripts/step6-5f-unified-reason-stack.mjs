export const AUTHORITY_ORDER = new Map([['MATERIAL',0],['CONTEXT_ONLY',1],['QUARANTINED',2],['UNKNOWN',3]]);
export const LAYER_ORDER = new Map([['CANONICAL_FOOTBALL_STATE',0],['CALIBRATED_MODEL_OUTPUT',1],['DOWNSTREAM_MARKET_COMPARISON',2]]);
const surfaces=new Set(['FANTASY','GAME','PLAYER_PROP','DST','K']);
const classes=new Set(['AVAILABILITY','ROLE','USAGE','OFFENSE','DEFENSE','MATCHUP','GAME_ENVIRONMENT','SITUATION','UNCERTAINTY','MARKET_COMPARISON']);
const authorities=new Set(AUTHORITY_ORDER.keys());
const layers=new Set(LAYER_ORDER.keys());
const prohibited=new Set(['projection','probability','true_value','fair_spread','fair_total','edge','ev','price']);

function cleanText(x){return String(x??'').replace(/\s+/g,' ').trim();}
function validateRecord(r){
  if(!surfaces.has(r.surface)) throw new Error(`invalid surface ${r.surface}`);
  if(!r.subject_id) throw new Error('missing subject_id');
  if(!r.evidence_key) throw new Error('missing evidence_key');
  if(!classes.has(r.reason_class)) throw new Error(`invalid reason_class ${r.reason_class}`);
  if(!layers.has(r.source_layer)) throw new Error(`invalid source_layer ${r.source_layer}`);
  if(!authorities.has(r.authority)) throw new Error(`invalid authority ${r.authority}`);
  if(!cleanText(r.text)) throw new Error('missing reason text');
  for(const k of prohibited) if(Object.hasOwn(r,k)) throw new Error(`reason record cannot carry ${k}`);
  if(r.reason_class==='MARKET_COMPARISON' && r.source_layer!=='DOWNSTREAM_MARKET_COMPARISON') throw new Error('market comparison must be downstream');
  if(r.source_layer==='DOWNSTREAM_MARKET_COMPARISON' && r.reason_class!=='MARKET_COMPARISON') throw new Error('downstream market layer may only emit market comparison reasons');
  if(r.authority==='MATERIAL' && r.validated_numeric_effect===false) throw new Error('unvalidated effect cannot be material');
}

export function compileReasonStack(records,{surface,subject_id}={}){
  const rows=(records||[]).filter(r=>(!surface||r.surface===surface)&&(!subject_id||r.subject_id===subject_id));
  for(const r of rows) validateRecord(r);
  const byKey=new Map();
  for(const r of rows){
    const prior=byKey.get(r.evidence_key);
    if(!prior){byKey.set(r.evidence_key,r);continue;}
    const lp=LAYER_ORDER.get(prior.source_layer), ln=LAYER_ORDER.get(r.source_layer);
    const ap=AUTHORITY_ORDER.get(prior.authority), an=AUTHORITY_ORDER.get(r.authority);
    if(ln<lp || (ln===lp && an<ap)) byKey.set(r.evidence_key,r);
  }
  const reasons=[...byKey.values()].sort((a,b)=>AUTHORITY_ORDER.get(a.authority)-AUTHORITY_ORDER.get(b.authority)||LAYER_ORDER.get(a.source_layer)-LAYER_ORDER.get(b.source_layer)||String(a.evidence_key).localeCompare(String(b.evidence_key))).map(r=>({
    evidence_key:r.evidence_key,
    reason_class:r.reason_class,
    source_layer:r.source_layer,
    text:cleanText(r.text),
    authority:r.authority,
    confidence:Number.isFinite(Number(r.confidence))?Math.max(0,Math.min(1,Number(r.confidence))):null
  }));
  const resolvedSurface=surface||rows[0]?.surface||null,resolvedSubject=subject_id||rows[0]?.subject_id||null;
  return {
    schema_version:'STEP6_5F_REASON_STACK_OUTPUT_1.0.0',
    surface:resolvedSurface,
    subject_id:resolvedSubject,
    reasons,
    reason_count:reasons.length,
    independent_evidence_count:new Set(reasons.map(r=>r.evidence_key)).size,
    sportsbook_inputs_used_for_forecast:false,
    mode:'SHADOW_ONLY',
    production_numeric_authority:0
  };
}
