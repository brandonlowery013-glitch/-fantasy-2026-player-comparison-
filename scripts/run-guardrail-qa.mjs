import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const exists=p=>fs.existsSync(path.join(root,p));
const cfg=read('guardrails/guardrails-config.json');
const truth=read('MODEL_SOURCE_OF_TRUTH.json');

const checks=[];
const block=(name,details)=>checks.push({name,status:'BLOCKED',details});
const review=(name,details)=>checks.push({name,status:'REVIEW_REQUIRED',details});
const pass=(name,details)=>checks.push({name,status:'PASS',details});

if(truth.active_player_model!==cfg.authoritative_player_count) block('source_of_truth_count',`MODEL_SOURCE_OF_TRUTH=${truth.active_player_model}, guardrail=${cfg.authoritative_player_count}`); else pass('source_of_truth_count',String(truth.active_player_model));
if(truth.runtime_player_shards!==cfg.authoritative_player_shards) block('source_of_truth_shards',`MODEL_SOURCE_OF_TRUTH=${truth.runtime_player_shards}, guardrail=${cfg.authoritative_player_shards}`); else pass('source_of_truth_shards',String(truth.runtime_player_shards));

let players=[];
for(let i=0;i<cfg.authoritative_player_shards;i++){
  const f=`players${i}.json`;
  if(!exists(f)){block('player_shards',`Missing ${f}`);continue;}
  const shard=read(f);
  if(!Array.isArray(shard)){block('player_shards',`${f} is not an array`);continue;}
  players.push(...shard);
}
const names=players.map(p=>p.n);
const unique=new Set(names);
if(players.length!==cfg.authoritative_player_count) block('active_player_count',`${players.length} != ${cfg.authoritative_player_count}`); else pass('active_player_count',String(players.length));
if(unique.size!==cfg.authoritative_player_count) block('unique_player_count',`${unique.size} unique != ${cfg.authoritative_player_count}`); else pass('unique_player_count',String(unique.size));
const dup=[...new Set(names.filter((n,i)=>names.indexOf(n)!==i))];
if(dup.length) block('duplicate_players',dup.join(', ')); else pass('duplicate_players','none');

const missing=[]; const badBounds=[];
for(const p of players){
  for(const k of cfg.required_player_numeric_fields){if(!Number.isFinite(Number(p[k]))) missing.push(`${p.n}:${k}`)}
  for(const [k,[lo,hi]] of Object.entries(cfg.numeric_bounds)){const v=Number(p[k]); if(Number.isFinite(v)&&(v<lo||v>hi)) badBounds.push(`${p.n}:${k}=${v}`)}
}
if(missing.length) block('required_numeric_fields',missing.slice(0,50).join(', ')); else pass('required_numeric_fields','complete');
if(badBounds.length) block('numeric_bounds',badBounds.slice(0,50).join(', ')); else pass('numeric_bounds','valid');

if(exists('vegasOdds2026.json')){
  const odds=read('vegasOdds2026.json');
  const unknown=Object.keys(odds.players||{}).filter(n=>!unique.has(n));
  if(unknown.length) block('vegas_unknown_players',unknown.join(', ')); else pass('vegas_unknown_players','none');
  const prohibited=[]; const invalid=[]; const devig=[];
  const implied=o=>{o=Number(o);if(!Number.isFinite(o)||o===0)return null;return o<0?(-o)/((-o)+100):100/(o+100)};
  for(const [name,obj] of Object.entries(odds.players||{})){
    for(const k of cfg.betting.prohibited_fields_in_market_layer){if(Object.hasOwn(obj,k)) prohibited.push(`${name}:${k}`)}
    for(const m of obj.markets||[]){
      const po=implied(m.over),pu=implied(m.under);
      if(!Number.isFinite(Number(m.line))||po==null||pu==null){invalid.push(`${name}:${m.label||m.stat||'market'}`);continue;}
      const sum=po+pu,fo=po/sum,fu=pu/sum;
      if(Math.abs((fo+fu)-1)>cfg.betting.vig_tolerance_after_devig) devig.push(`${name}:${m.label||m.stat}`);
    }
  }
  if(prohibited.length) block('market_layer_core_contamination',prohibited.join(', ')); else pass('market_layer_core_contamination','none');
  if(invalid.length) review('two_sided_odds_integrity',invalid.slice(0,50).join(', ')); else pass('two_sided_odds_integrity','valid where present');
  if(devig.length) block('devig_math',devig.join(', ')); else pass('devig_math','all priced markets normalize to 100%');
}else review('vegas_odds_layer','vegasOdds2026.json missing');

if(exists('evLayer2026.json')){
  const ev=read('evLayer2026.json');
  const unknown=Object.keys(ev.players||{}).filter(n=>!unique.has(n));
  if(unknown.length) block('ev_unknown_players',unknown.join(', ')); else pass('ev_unknown_players','none');
  const probs=[]; const rankOverrides=[]; const extreme=[];
  for(const [name,obj] of Object.entries(ev.players||{})){
    for(const k of cfg.betting.prohibited_fields_in_market_layer){if(Object.hasOwn(obj,k)) rankOverrides.push(`${name}:${k}`)}
    for(const [market,m] of Object.entries(obj.markets||{})){
      for(const k of ['model_over_probability','model_under_probability','market_over_probability','market_under_probability']){
        if(m[k]!=null){const v=Number(m[k]);if(!Number.isFinite(v)||v<cfg.probability.minimum||v>cfg.probability.maximum) probs.push(`${name}:${market}:${k}=${m[k]}`)}
      }
      const edge=Math.abs(Number(m.probability_edge));
      if(Number.isFinite(edge)&&edge>=cfg.probability.extreme_edge_review_threshold&&!['REVIEW_REQUIRED','CLEARED_AFTER_REVIEW'].includes(m.guardrail_status)) extreme.push(`${name}:${market}:${edge}`);
    }
  }
  if(rankOverrides.length) block('ev_core_contamination',rankOverrides.join(', ')); else pass('ev_core_contamination','none');
  if(probs.length) block('probability_bounds',probs.slice(0,50).join(', ')); else pass('probability_bounds','valid');
  if(extreme.length) block('extreme_edge_quarantine',extreme.slice(0,50).join(', ')); else pass('extreme_edge_quarantine','all extreme edges quarantined or cleared');
}else pass('ev_layer_status','not active yet; guardrails ready before EV build');

const blocked=checks.filter(x=>x.status==='BLOCKED');
const reviews=checks.filter(x=>x.status==='REVIEW_REQUIRED');
const report={
  generated_at:new Date().toISOString(),
  guardrail_version:cfg.version,
  active_model:cfg.authoritative_player_count,
  result:blocked.length?'BLOCKED':reviews.length?'REVIEW_REQUIRED':'PASS',
  blocked_count:blocked.length,
  review_count:reviews.length,
  checks
};
fs.writeFileSync(path.join(root,'guardrails/guardrail-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length) process.exit(1);
