import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const source=read('data/sources/weekly-football-context-2026.json');
const truth=read('MODEL_SOURCE_OF_TRUTH.json');
const blocked=[];
const review=[];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');

if(source.season!==2026)blocked.push(`season must remain 2026: ${source.season}`);
if(source.sportsbook_inputs_allowed!==false)blocked.push('sportsbook inputs must remain forbidden');
if(!same(source.scope,['role','injury','team_environment','opponent','qb_context']))blocked.push('weekly context scope changed unexpectedly');
for(const s of source.scope||[]){
  if(!source.sources?.[s])blocked.push(`missing source contract: ${s}`);
  const h=source.normalization_contract?.capture_freshness_hours?.[s];
  if(!Number.isFinite(Number(h))||Number(h)<=0)blocked.push(`missing/invalid freshness window: ${s}`);
}
if(source.normalization_contract?.missing_is_zero!==false)blocked.push('missing context must never become zero');
if(source.normalization_contract?.capture_freshness_hours?.injury!==12)blocked.push('injury freshness must remain 12 hours');
if(!String(source.promotion_rule||'').includes('SHADOW_ONLY'))blocked.push('SHADOW_ONLY promotion guard missing');

// Production weekly context is a canonical-set materialization, not a best-effort subset.
const canonicalCount=Number(truth.active_player_model);
const shardCount=Number(truth.runtime_player_shards);
if(canonicalCount!==166)blocked.push(`canonical player universe must be exactly 166, found ${canonicalCount}`);
if(!Number.isInteger(shardCount)||shardCount<=0)blocked.push(`invalid runtime_player_shards: ${truth.runtime_player_shards}`);
const canonical=[];
for(let i=0;i<shardCount;i++){
  const shardPath=`players${i}.json`;
  if(!fs.existsSync(path.join(root,shardPath))){blocked.push(`missing canonical shard ${shardPath}`);continue;}
  const shard=read(shardPath);
  if(!Array.isArray(shard)){blocked.push(`${shardPath} must be an array`);continue;}
  canonical.push(...shard.map(p=>String(p.n||'').trim()).filter(Boolean));
}
const canonicalByNorm=new Map();
for(const name of canonical){
  const key=norm(name);
  if(canonicalByNorm.has(key))blocked.push(`duplicate normalized canonical player: ${name}`);
  canonicalByNorm.set(key,name);
}
if(canonical.length!==166||canonicalByNorm.size!==166)blocked.push(`canonical shard population must be 166/166, found ${canonical.length}/${canonicalByNorm.size}`);

function validateMaterialization(file,label,{normalized=false}={}){
  const full=path.join(root,file);
  if(!fs.existsSync(full)){blocked.push(`${label} missing: ${file}`);return null;}
  const data=read(file);
  if(data.season!==2026)blocked.push(`${label} season must be 2026: ${data.season}`);
  if(data.sportsbook_inputs_used!==false)blocked.push(`${label} sportsbook_inputs_used must be false`);
  const players=data.players;
  if(!players||typeof players!=='object'||Array.isArray(players)){blocked.push(`${label} players must be an object`);return data;}
  const entries=Object.entries(players);
  const seen=new Map();
  for(const [key,p] of entries){
    const declared=normalized?String(p?.player||key):key;
    const nk=norm(declared);
    if(seen.has(nk))blocked.push(`${label} duplicate normalized player: ${declared}`);
    seen.set(nk,declared);
    if(!canonicalByNorm.has(nk))blocked.push(`${label} extra non-canonical player: ${declared}`);
    const active=p?.expected_active;
    if(active!==true&&active!==false&&active!==null)blocked.push(`${label} ${declared} expected_active must be true, false, or explicit null UNKNOWN`);
    if(active===null&&p?.availability_status!=='UNKNOWN')blocked.push(`${label} ${declared} null availability must remain explicit UNKNOWN`);
    if(active===null){
      review.push(`${label} ${declared} availability UNKNOWN — review required; no active state inferred`);
      if(normalized&&p?.context_status!=='REVIEW_REQUIRED')blocked.push(`${label} ${declared} UNKNOWN availability must be REVIEW_REQUIRED after normalization`);
    }
  }
  const missing=[...canonicalByNorm.entries()].filter(([k])=>!seen.has(k)).map(([,name])=>name);
  if(entries.length!==166||seen.size!==166||missing.length)blocked.push(`${label} must equal exact canonical 166-player set: rows=${entries.length}, unique=${seen.size}, missing=[${missing.join(', ')}]`);
  return data;
}

const raw=validateMaterialization('data/probability/weekly-football-context-raw-2026.json','raw weekly context');
const normalized=validateMaterialization('data/probability/weekly-football-context-inputs-2026.json','normalized weekly context',{normalized:true});
if(raw&&normalized&&raw.week!=null&&normalized.week!=null&&Number(raw.week)!==Number(normalized.week))blocked.push(`weekly context week mismatch: raw=${raw.week}, normalized=${normalized.week}`);

const report={
  generated_at:new Date().toISOString(),
  result:blocked.length?'BLOCKED':(review.length?'REVIEW_REQUIRED':'PASS'),
  status:source.status,
  season:source.season,
  scope:source.scope,
  step_2e_status:source.step_2e_status,
  canonical_players:canonicalByNorm.size,
  raw_players:raw?.players?Object.keys(raw.players).length:0,
  normalized_players:normalized?.players?Object.keys(normalized.players).length:0,
  unknown_availability_review_count:review.length,
  review,
  blocked,
  safeguards:[
    'Weekly context is football-side only.',
    'Missing values remain missing.',
    'Injury capture freshness is capped at 12 hours.',
    'Every signal category has a declared freshness window.',
    'Weekly context may only adjust SHADOW_ONLY projections after validation.',
    'Raw and normalized weekly context must each equal the exact canonical 166-player set.',
    'UNKNOWN availability remains explicit and review-required; it is never silently inferred active.'
  ]
};
fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});
fs.writeFileSync(path.join(root,'guardrails/weekly-football-context-source-contract-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);
