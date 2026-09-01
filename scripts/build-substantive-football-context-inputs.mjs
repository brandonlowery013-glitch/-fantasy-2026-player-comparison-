import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),JSON.stringify(x,null,2)+'\n');};
const source=read('MODEL_SOURCE_OF_TRUTH.json');
const expected=Number(source.active_player_model), shards=Number(source.runtime_player_shards);
const snapshots=read('data/ingestion/weekly-football-source-snapshots-2026.json');
const valid=new Set(['role','injury','team_environment','opponent','qb_context']);
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
const now=Date.now();
let players=[];
for(let i=0;i<shards;i++)players.push(...read(`players${i}.json`));
if(players.length!==expected)throw new Error(`Universe mismatch ${players.length} != ${expected}`);
const byNorm=new Map(players.map(p=>[norm(p.n),p]));
const latest=new Map();
for(const s of snapshots.snapshots||[]){
  if(!valid.has(String(s.signal_type||'')))continue;
  const p=byNorm.get(norm(s.player)); if(!p)continue;
  const t=Date.parse(String(s.captured_at||'')); if(!Number.isFinite(t)||t>now+300000)continue;
  const k=`${p.n}|${s.signal_type}`; const old=latest.get(k); if(!old||t>old.t) latest.set(k,{t,s,p});
}
const out={};
for(const {s,p,t} of latest.values()){
  const name=p.n;
  if(!out[name])out[name]={player:name,position:String(p.p||'').toUpperCase(),expected_active:null,availability_status:'UNRESOLVED',context_status:'PASS',signals:{}};
  const ageHours=(now-t)/3600000;
  out[name].signals[s.signal_type]={source:s.source,captured_at:s.captured_at,status:'CURRENT',age_hours:Number(ageHours.toFixed(3)),cohort:s.cohort??null,stat_adjustments:s.stat_adjustments||{},evidence:s.evidence??null};
  if(typeof s.expected_active==='boolean'){
    out[name].expected_active=s.expected_active;
    out[name].availability_status=s.expected_active?'EXPECTED_ACTIVE':'EXPECTED_INACTIVE';
  }
}
const signalCount=Object.values(out).reduce((n,p)=>n+Object.keys(p.signals||{}).length,0);
if(Object.keys(out).length<80)throw new Error(`Substantive structured context coverage too low: ${Object.keys(out).length}/${expected}`);
if(signalCount<80)throw new Error(`Substantive structured signal coverage too low: ${signalCount}`);
const result={schema_version:'1.0.0',season:2026,status:'SUBSTANTIVE_CURRENT_CONTEXT',generated_at:new Date().toISOString(),sportsbook_inputs_used:false,players:out};
write('data/probability/substantive-football-context-inputs-2026.json',result);
write('guardrails/substantive-football-context-inputs-report.json',{generated_at:result.generated_at,result:'PASS',players:Object.keys(out).length,signals:signalCount,availability_resolved:Object.values(out).filter(p=>p.expected_active!==null).length,availability_unresolved:Object.values(out).filter(p=>p.expected_active===null).length,sportsbook_inputs_used:false});
console.log(JSON.stringify({result:'PASS',players:Object.keys(out).length,signals:signalCount,availability_resolved:Object.values(out).filter(p=>p.expected_active!==null).length,availability_unresolved:Object.values(out).filter(p=>p.expected_active===null).length},null,2));
