import fs from 'node:fs';

const players=[];
for(let i=0;i<=12;i++){
  const p=`players${i}.json`;
  if(fs.existsSync(p)) players.push(...JSON.parse(fs.readFileSync(p,'utf8')).map(x=>({...x,_file:p})));
}
if(players.length!==162) throw new Error(`Expected 162 players, found ${players.length}`);
const target=players.find(p=>p.n==='Jayden Higgins');
if(!target) throw new Error('Jayden Higgins missing from authoritative universe');
const history=JSON.parse(fs.readFileSync('historicalStats2026.json','utf8'));
const rows=history.players?.['Jayden Higgins']||[];
const numericFields={mp:target.mp,cp:target.cp,s:target.s,pd:target.pd,ce:target.ce,r:target.r,e:target.e,a:target.a,rl:target.rl,su:target.su};
const zeroNumeric=Object.entries(numericFields).filter(([,v])=>Number(v)===0).map(([k])=>k);
const out={
  schema_version:'STEP4_HELD_INTEGRITY_AUDIT_1.0.0',
  status:'PASS',
  authoritative_player_count:players.length,
  player:'Jayden Higgins',
  source_file:target._file,
  position:target.p,
  team:target.t,
  overall_rank:target.o,
  numeric_fields:numericFields,
  zero_numeric_fields:zeroNumeric,
  projection_context:target.projection_context||null,
  median_text:target.m||null,
  ceiling_text:target.cl||null,
  legitimate_history_rows:rows,
  history_row_count:rows.length,
  missing_is_unknown:true,
  data_integrity_classification: Number(target.mp)===0 ? 'LIVE_MODEL_PROJECTION_ZERO_REQUIRES_REPAIR' : 'NO_CURRENT_ZERO_PROJECTION_ANOMALY'
};
fs.mkdirSync('data/sources',{recursive:true});
fs.writeFileSync('data/sources/step4-held-integrity-audit-2026.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out,null,2));
