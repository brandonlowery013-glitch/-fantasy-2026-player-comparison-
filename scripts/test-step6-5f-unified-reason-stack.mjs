import fs from 'node:fs';
import {compileReasonStack} from './step6-5f-unified-reason-stack.mjs';
const rows=[
 {surface:'FANTASY',subject_id:'P1',evidence_key:'injury:P1:knee',reason_class:'AVAILABILITY',source_layer:'CANONICAL_FOOTBALL_STATE',text:'Cleared to play; stale injury tag removed.',authority:'MATERIAL',confidence:.98,validated_numeric_effect:true},
 {surface:'FANTASY',subject_id:'P1',evidence_key:'injury:P1:knee',reason_class:'AVAILABILITY',source_layer:'CALIBRATED_MODEL_OUTPUT',text:'Duplicate downstream restatement.',authority:'CONTEXT_ONLY',confidence:.7},
 {surface:'FANTASY',subject_id:'P1',evidence_key:'role:P1',reason_class:'ROLE',source_layer:'CANONICAL_FOOTBALL_STATE',text:'Verified starting role.',authority:'MATERIAL',confidence:.95,validated_numeric_effect:true},
 {surface:'PLAYER_PROP',subject_id:'P1:receiving_yards',evidence_key:'market:P1:receiving_yards',reason_class:'MARKET_COMPARISON',source_layer:'DOWNSTREAM_MARKET_COMPARISON',text:'Model distribution can be compared with the available market after the football forecast is complete.',authority:'CONTEXT_ONLY',confidence:.9},
 {surface:'GAME',subject_id:'G1',evidence_key:'situational:G1:divisional',reason_class:'SITUATION',source_layer:'CALIBRATED_MODEL_OUTPUT',text:'Divisional context was tested but did not earn numeric authority.',authority:'QUARANTINED',confidence:.8},
 {surface:'DST',subject_id:'DST1',evidence_key:'defense:DST1:sacks',reason_class:'DEFENSE',source_layer:'CALIBRATED_MODEL_OUTPUT',text:'Validated DST scoring component.',authority:'MATERIAL',confidence:.9,validated_numeric_effect:true},
 {surface:'K',subject_id:'K1',evidence_key:'kicker:K1:baseline',reason_class:'UNCERTAINTY',source_layer:'CALIBRATED_MODEL_OUTPUT',text:'Richer kicker challenger failed promotion; retain simple baseline.',authority:'CONTEXT_ONLY',confidence:.95}
];
const out=compileReasonStack(rows,{surface:'FANTASY',subject_id:'P1'});
const bad=[];
if(out.reason_count!==2||out.independent_evidence_count!==2)bad.push('dedupe/count');
if(out.reasons[0]?.evidence_key!=='injury:P1:knee')bad.push('ordering');
if(out.sportsbook_inputs_used_for_forecast!==false||out.production_numeric_authority!==0||out.mode!=='SHADOW_ONLY')bad.push('authority/market');
for(const s of ['FANTASY','GAME','PLAYER_PROP','DST','K']){const subject=rows.find(r=>r.surface===s)?.subject_id;const q=compileReasonStack(rows,{surface:s,subject_id:subject});if(!q.reason_count)bad.push(`missing ${s}`)}
let caught=0;
for(const r of [
 {surface:'GAME',subject_id:'G2',evidence_key:'bad1',reason_class:'GAME_ENVIRONMENT',source_layer:'CALIBRATED_MODEL_OUTPUT',text:'bad',authority:'MATERIAL',projection:21},
 {surface:'GAME',subject_id:'G2',evidence_key:'bad2',reason_class:'MARKET_COMPARISON',source_layer:'CALIBRATED_MODEL_OUTPUT',text:'bad',authority:'CONTEXT_ONLY'},
 {surface:'GAME',subject_id:'G2',evidence_key:'bad3',reason_class:'GAME_ENVIRONMENT',source_layer:'DOWNSTREAM_MARKET_COMPARISON',text:'bad',authority:'CONTEXT_ONLY'},
 {surface:'GAME',subject_id:'G2',evidence_key:'bad4',reason_class:'SITUATION',source_layer:'CALIBRATED_MODEL_OUTPUT',text:'bad',authority:'MATERIAL',validated_numeric_effect:false}
]){try{compileReasonStack([r])}catch{caught++}}
if(caught!==4)bad.push(`negative tests ${caught}/4`);
if(process.argv.includes('--write-artifact')){
 const artifact={schema_version:'STEP6_5F_REASON_STACK_QA_1.0.0',status:bad.length?'FAIL':'PASS',mode:'SHADOW_ONLY',production_numeric_authority:0,sportsbook_inputs_used_for_forecast:false,surfaces_tested:['FANTASY','GAME','PLAYER_PROP','DST','K'],duplicate_evidence_collapsed:true,negative_tests_passed:caught,example:out};
 fs.mkdirSync('guardrails',{recursive:true});fs.writeFileSync('guardrails/step6-5f-unified-reason-stack-report.json',JSON.stringify(artifact,null,2)+'\n');
}
if(bad.length){console.error(JSON.stringify({result:'FAIL',bad},null,2));process.exit(1)}
console.log(JSON.stringify({result:'PASS',reason_count:out.reason_count,independent_evidence_count:out.independent_evidence_count,negative_tests:caught,surfaces:['FANTASY','GAME','PLAYER_PROP','DST','K']},null,2));
