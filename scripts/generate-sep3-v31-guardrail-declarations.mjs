// PR-scoped guardrail declarations: prefer the evidence-gated Sep. 5 material-hold payload when present; retain Sep. 3 compatibility otherwise.
import fs from 'node:fs';
const R=p=>JSON.parse(fs.readFileSync(p,'utf8')),W=(p,x)=>fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n');
const src=R('MODEL_SOURCE_OF_TRUTH.json'),patch=R(src.current_update_layer);
let players=[];for(let i=0;i<src.runtime_player_shards;i++)players.push(...R(`players${i}.json`));players=players.map(p=>({...p,...(patch.players?.[p.n]||{})}));
if(players.length!==src.active_player_model)throw new Error('declaration universe gate');
const by=new Map(players.map(p=>[p.n,p]));
const sep5Input='analysis/material-hold-canonical-apply-input-2026-09-05.json';
const sep5Qa='analysis/material-hold-canonical-apply-qa-2026-09-05.json';
const useSep5=fs.existsSync(sep5Input)&&fs.existsSync(sep5Qa)&&src.status==='authoritative_current_2026_09_05_material_hold_recalibrated';
let model_changes=[],asOf,sourceRun=null,sourceArtifact=null,purposeSuffix,structuralReason,structuralSource;
if(useSep5){
  const inp=R(sep5Input),qa=R(sep5Qa);
  if(inp.approval!=='USER_APPROVED_MATERIAL_HOLD_CALIBRATION'||inp.reviewed_holds!==19||inp.changed_players!==7||inp.rows.length!==7)throw new Error('Sep5 declaration input gate');
  if(qa.players!==src.active_player_model||qa.changed!==7||qa.reviewed_holds!==19||qa.errors?.length||!qa.overall_unchanged||!qa.market_unchanged||!qa.projections_unchanged)throw new Error('Sep5 declaration QA gate');
  const qBy=new Map(qa.changes.map(x=>[x.player,x]));
  model_changes=inp.rows.map(x=>{
    const p=by.get(x.player),q=qBy.get(x.player);if(!p||!q)throw new Error(`missing Sep5 declaration row ${x.player}`);
    const expected_values={s:p.s};
    for(const k of Object.keys(x.component_targets))expected_values[k]=p[k];
    const [tvBefore,tvAfter]=String(q.tv).split('->').map(Number);if(tvBefore!==tvAfter)expected_values.tr=p.tr;
    return{player:x.player,reason:x.reason,source:`2026-09-05 material-hold quantitative recalibration from PR #${inp.source_pr}, merged evidence ${inp.source_merge}; user-approved canonical apply`,expected_values};
  });
  asOf=inp.as_of;purposeSuffix='Sep. 5 material-hold quantitative recalibration';
  structuralReason='Advance authoritative metadata and synchronized canonical boards after the evidence-gated Sep. 5 material-hold quantitative recalibration (19 reviewed, 7 changed, 12 zero-delta).';
  structuralSource=`2026-09-05 material-hold calibration QA; source PR #${inp.source_pr}; source merge ${inp.source_merge}`;
}else{
  const inp=R('analysis/sep3-v31-canonical-apply-input.json');
  if(players.length!==166||inp.rows.length!==35)throw new Error('legacy Sep3 declaration universe/input gate');
  const core=['o','tr','tp','pr','s','pd','ce','r','e','a','rl','su','mp'];
  model_changes=inp.rows.map(x=>{const p=by.get(x.player);if(!p)throw new Error(`missing ${x.player}`);return{player:x.player,reason:x.reason,source:`2026-09-03 V3.1 full-universe reconciliation run ${inp.source_run}; user-approved canonical apply`,expected_values:Object.fromEntries(core.map(k=>[k,p[k]??null]))}});
  asOf=inp.as_of;sourceRun=inp.source_run;sourceArtifact=inp.source_artifact;purposeSuffix='Sep. 3 V3.1 35-player evidence reconciliation';
  structuralReason='Advance authoritative metadata and synchronized canonical boards after the user-approved Sep. 3 V3.1 35-player evidence reconciliation.';
  structuralSource=`2026-09-03 V3.1 run ${inp.source_run} + canonical apply QA`;
}
const oldUniverse=R('guardrails/universe-change-manifest.json');
const historical_changes=(oldUniverse.changes||[]).filter(x=>x.action!=='MODEL_CHANGE');
const compatibility_model_changes=model_changes.map(x=>({action:'MODEL_CHANGE',player:x.player,reason:x.reason,source:x.source,changed_fields:Object.keys(x.expected_values),expected_values:x.expected_values}));
W('guardrails/universe-change-manifest.json',{version:'1.4.0',purpose:`Historical admissions plus PR-scoped exact model-change declarations for ${purposeSuffix}. Exact declarations are mirrored into changes for backward-compatible hard Guardrail QA; after merge they are inert until replaced by a new reviewed payload.`,changes:[...historical_changes,...compatibility_model_changes],model_change_lifecycle:{status:'PR_SCOPED_EXACT_VALUES',as_of:asOf,source_run:sourceRun,source_artifact:sourceArtifact,changed_players:model_changes.length,calibration:useSep5?'SEP5_MATERIAL_HOLDS':'SEP3_V31'},model_changes,admission_updates:[]});
const canonical=R('canonicalBoards2026.json');
if(canonical.active_players!==src.active_player_model||canonical.overall?.length!==src.active_player_model||canonical.trueValue?.length!==src.active_player_model)throw new Error('spreadsheet sync canonical gate');
const syncFields=['n','p','t','o','pr','tr','tp','s','pd','ce','r','e','a','rl','su','mp','px','fw','st','ad'];
const esc=v=>String(v??'').replaceAll('\t',' ').replaceAll('\n',' ');
const sync=[syncFields.join('\t'),...canonical.overall.map(p=>syncFields.map(k=>esc(p[k])).join('\t'))].join('\n')+'\n';
fs.writeFileSync('analysis/sep3-v31-spreadsheet-sync.tsv',sync);
const oldStructural=R('guardrails/structural-change-manifest.json');let keep=(oldStructural.changes||[]).filter(x=>!['MODEL_SOURCE_OF_TRUTH.json','canonicalBoards2026.json'].includes(x.file));
keep.push({file:'MODEL_SOURCE_OF_TRUTH.json',reason:structuralReason,source:structuralSource});
keep.push({file:'canonicalBoards2026.json',reason:structuralReason,source:structuralSource});
W('guardrails/structural-change-manifest.json',{version:'1.3.0',purpose:`Explicit declarations for intentional protected structural-file changes. Current declarations cover ${purposeSuffix}.`,changes:keep});
console.log(JSON.stringify({result:'PASS',mode:useSep5?'SEP5_MATERIAL_HOLDS':'SEP3_V31',exact_model_declarations:model_changes.length,compatibility_guardrail_declarations:compatibility_model_changes.length,declared_players:model_changes.map(x=>({player:x.player,fields:Object.keys(x.expected_values)})),spreadsheet_sync_rows:canonical.overall.length,structural_declarations:keep.map(x=>x.file)},null,2));
