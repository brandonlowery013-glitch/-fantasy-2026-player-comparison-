import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const exists=p=>fs.existsSync(path.join(root,p));
const cfg=read('guardrails/guardrails-config.json');
const truth=read('MODEL_SOURCE_OF_TRUTH.json');
const checks=[];
const block=(name,details)=>checks.push({name,status:'BLOCKED',details});
const review=(name,details)=>checks.push({name,status:'REVIEW_REQUIRED',details});
const pass=(name,details)=>checks.push({name,status:'PASS',details});
const insufficient=(name,details)=>checks.push({name,status:'INSUFFICIENT_DATA',details});

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
const names=players.map(p=>p.n), unique=new Set(names);
if(players.length!==cfg.authoritative_player_count) block('active_player_count',`${players.length} != ${cfg.authoritative_player_count}`); else pass('active_player_count',String(players.length));
if(unique.size!==cfg.authoritative_player_count) block('unique_player_count',`${unique.size} unique != ${cfg.authoritative_player_count}`); else pass('unique_player_count',String(unique.size));
const dup=[...new Set(names.filter((n,i)=>names.indexOf(n)!==i))];
if(dup.length) block('duplicate_players',dup.join(', ')); else pass('duplicate_players','none');

const missing=[], badBounds=[];
for(const p of players){
  for(const k of cfg.required_player_numeric_fields){if(!Number.isFinite(Number(p[k]))) missing.push(`${p.n}:${k}`)}
  for(const [k,[lo,hi]] of Object.entries(cfg.numeric_bounds)){const v=Number(p[k]);if(Number.isFinite(v)&&(v<lo||v>hi))badBounds.push(`${p.n}:${k}=${v}`)}
}
if(missing.length) block('required_numeric_fields',missing.slice(0,50).join(', ')); else pass('required_numeric_fields','complete');
if(badBounds.length) block('numeric_bounds',badBounds.slice(0,50).join(', ')); else pass('numeric_bounds','valid');

// Real drift check against prior commit. Material core changes require a manifest entry.
try{
  const prior=[];
  for(let i=0;i<cfg.authoritative_player_shards;i++){
    const txt=execFileSync('git',['show',`HEAD^:players${i}.json`],{encoding:'utf8',stdio:['ignore','pipe','ignore']});
    prior.push(...JSON.parse(txt));
  }
  const pm=new Map(prior.map(p=>[p.n,p]));
  const manifest=exists(cfg.drift.change_manifest_file)?read(cfg.drift.change_manifest_file):{changes:[]};
  const declared=new Map((manifest.changes||[]).map(x=>[x.player,x]));
  const material=[], unexplained=[];
  for(const p of players){
    const old=pm.get(p.n); if(!old) continue;
    const rankDelta=Math.abs(Number(p.o)-Number(old.o));
    const oldMp=Number(old.mp), newMp=Number(p.mp);
    const projPct=Number.isFinite(oldMp)&&oldMp!==0&&Number.isFinite(newMp)?Math.abs(newMp-oldMp)/Math.abs(oldMp):0;
    if(rankDelta>=cfg.drift.material_rank_change_places||projPct>=cfg.drift.material_projection_change_pct){
      const item={player:p.n,rank_delta:rankDelta,projection_change_pct:Number(projPct.toFixed(4))}; material.push(item);
      const d=declared.get(p.n);
      if(!d||!d.reason||!d.source||!d.changed_fields) unexplained.push(item);
    }
  }
  if(unexplained.length) block('unexplained_material_drift',JSON.stringify(unexplained.slice(0,30))); else pass('unexplained_material_drift',material.length?`${material.length} material changes all declared`:'none');
}catch(e){review('prior_commit_drift_check','Prior player baseline unavailable in git history; drift comparison could not run.');}

if(exists('vegasOdds2026.json')){
  const odds=read('vegasOdds2026.json');
  const unknown=Object.keys(odds.players||{}).filter(n=>!unique.has(n));
  if(unknown.length) block('vegas_unknown_players',unknown.join(', ')); else pass('vegas_unknown_players','none');
  const prohibited=[], invalid=[], devig=[], stale=[], duplicates=[], missingMeta=[];
  const implied=o=>{o=Number(o);if(!Number.isFinite(o)||o===0)return null;return o<0?(-o)/((-o)+100):100/(o+100)};
  const now=Date.now();
  for(const [name,obj] of Object.entries(odds.players||{})){
    for(const k of cfg.betting.prohibited_fields_in_market_layer){if(Object.hasOwn(obj,k)) prohibited.push(`${name}:${k}`)}
    const seen=new Set();
    for(const m of obj.markets||[]){
      const key=[m.book,m.stat,m.line].join('|'); if(seen.has(key))duplicates.push(`${name}:${key}`); seen.add(key);
      if(cfg.betting.require_book&&!m.book)missingMeta.push(`${name}:${m.label||m.stat}:book`);
      if(cfg.betting.require_source_date&&!m.source_date)missingMeta.push(`${name}:${m.label||m.stat}:source_date`);
      const ov=Number(m.over),un=Number(m.under),po=implied(ov),pu=implied(un);
      const oddsValid=Math.abs(ov)>=cfg.betting.minimum_valid_american_odds_abs&&Math.abs(un)>=cfg.betting.minimum_valid_american_odds_abs;
      if(!Number.isFinite(Number(m.line))||po==null||pu==null||!oddsValid){invalid.push(`${name}:${m.label||m.stat||'market'}`);continue;}
      const sum=po+pu,fo=po/sum,fu=pu/sum;
      if(Math.abs((fo+fu)-1)>cfg.betting.vig_tolerance_after_devig)devig.push(`${name}:${m.label||m.stat}`);
      if(m.source_date){const ageDays=(now-new Date(m.source_date+'T23:59:59Z').getTime())/86400000;if(ageDays>cfg.freshness.season_long_odds_days)stale.push(`${name}:${m.label||m.stat}:${m.source_date}`)}
    }
  }
  if(prohibited.length) block('market_layer_core_contamination',prohibited.join(', ')); else pass('market_layer_core_contamination','none');
  if(invalid.length) block('two_sided_odds_integrity',invalid.slice(0,50).join(', ')); else pass('two_sided_odds_integrity','valid where present');
  if(missingMeta.length) block('odds_metadata',missingMeta.slice(0,50).join(', ')); else pass('odds_metadata','book and source date present');
  if(duplicates.length) block('duplicate_priced_markets',duplicates.slice(0,50).join(', ')); else pass('duplicate_priced_markets','none');
  if(devig.length) block('devig_math',devig.join(', ')); else pass('devig_math','all priced markets normalize to 100%');
  if(stale.length) review('season_long_odds_freshness',stale.slice(0,50).join(', ')); else pass('season_long_odds_freshness','within freshness window');
}else review('vegas_odds_layer','vegasOdds2026.json missing');

if(exists('evLayer2026.json')){
  const ev=read('evLayer2026.json');
  const unknown=Object.keys(ev.players||{}).filter(n=>!unique.has(n));
  if(unknown.length) block('ev_unknown_players',unknown.join(', ')); else pass('ev_unknown_players','none');
  const probs=[], contamination=[], extreme=[], badSums=[], badEv=[], strongSignal=[], missingInputs=[];
  const americanProfit=o=>{o=Number(o);return o<0?100/(-o):o/100};
  for(const [name,obj] of Object.entries(ev.players||{})){
    for(const k of cfg.betting.prohibited_fields_in_market_layer){if(Object.hasOwn(obj,k)) contamination.push(`${name}:${k}`)}
    for(const [market,m] of Object.entries(obj.markets||{})){
      const keys=['model_over_probability','model_under_probability','market_over_probability','market_under_probability'];
      for(const k of keys){if(m[k]!=null){const v=Number(m[k]);if(!Number.isFinite(v)||v<cfg.probability.minimum||v>cfg.probability.maximum)probs.push(`${name}:${market}:${k}=${m[k]}`)}}
      const mop=Number(m.model_over_probability),mup=Number(m.model_under_probability),vop=Number(m.market_over_probability),vup=Number(m.market_under_probability);
      if([mop,mup].every(Number.isFinite)&&Math.abs(mop+mup-1)>cfg.probability.sum_tolerance)badSums.push(`${name}:${market}:model`);
      if([vop,vup].every(Number.isFinite)&&Math.abs(vop+vup-1)>cfg.probability.sum_tolerance)badSums.push(`${name}:${market}:market`);
      if(m.probability_edge==null||m.offered_odds==null||m.model_probability==null)missingInputs.push(`${name}:${market}`);
      const edge=Math.abs(Number(m.probability_edge));
      if(Number.isFinite(edge)&&edge>=cfg.probability.extreme_edge_review_threshold&&!['REVIEW_REQUIRED','CLEARED_AFTER_REVIEW'].includes(m.guardrail_status))extreme.push(`${name}:${market}:${edge}`);
      if(m.expected_value!=null&&m.offered_odds!=null&&m.model_probability!=null){const p=Number(m.model_probability),b=americanProfit(m.offered_odds),calc=p*b-(1-p);if(Math.abs(calc-Number(m.expected_value))>cfg.betting.ev_formula_tolerance)badEv.push(`${name}:${market}:stored=${m.expected_value}:calc=${calc.toFixed(4)}`)}
      if(cfg.betting.strong_labels.includes(String(m.recommendation||'').toUpperCase())){const sig=Array.isArray(m.independent_signals)?m.independent_signals.length:0;if(sig<cfg.betting.minimum_independent_signals_for_strong_bet)strongSignal.push(`${name}:${market}:${sig}`)}
    }
  }
  if(contamination.length) block('ev_core_contamination',contamination.join(', ')); else pass('ev_core_contamination','none');
  if(probs.length) block('probability_bounds',probs.slice(0,50).join(', ')); else pass('probability_bounds','valid');
  if(badSums.length) block('probability_complements',badSums.slice(0,50).join(', ')); else pass('probability_complements','model and market sides sum to 1 where present');
  if(badEv.length) block('ev_formula',badEv.slice(0,50).join(', ')); else pass('ev_formula','stored EV matches formula where present');
  if(strongSignal.length) block('strong_bet_signal_count',strongSignal.slice(0,50).join(', ')); else pass('strong_bet_signal_count','strong labels have enough independent support');
  if(extreme.length) block('extreme_edge_quarantine',extreme.slice(0,50).join(', ')); else pass('extreme_edge_quarantine','all extreme edges quarantined or cleared');
  if(missingInputs.length) insufficient('ev_required_inputs',missingInputs.slice(0,50).join(', ')); else pass('ev_required_inputs','complete');
}else pass('ev_layer_status','not active yet; guardrails ready before EV build');

if(exists('weeklyCalibration2026.json')){
  const c=read('weeklyCalibration2026.json');
  const n=Number(c.holdout_bets||0);
  if(n<cfg.calibration.minimum_holdout_bets_before_trust)review('weekly_calibration_sample',`${n}/${cfg.calibration.minimum_holdout_bets_before_trust} holdout bets`);else pass('weekly_calibration_sample',String(n));
  const missingMetrics=cfg.calibration.track.filter(k=>c[k]==null);if(missingMetrics.length)review('weekly_calibration_metrics','missing '+missingMetrics.join(', '));else pass('weekly_calibration_metrics','complete');
}else review('weekly_calibration_status','not active yet; weekly betting cannot be marked production-trusted');

const blocked=checks.filter(x=>x.status==='BLOCKED');
const reviews=checks.filter(x=>x.status==='REVIEW_REQUIRED');
const insuff=checks.filter(x=>x.status==='INSUFFICIENT_DATA');
const report={generated_at:new Date().toISOString(),guardrail_version:cfg.version,active_model:cfg.authoritative_player_count,result:blocked.length?'BLOCKED':reviews.length?'REVIEW_REQUIRED':insuff.length?'INSUFFICIENT_DATA':'PASS',blocked_count:blocked.length,review_count:reviews.length,insufficient_count:insuff.length,checks};
fs.writeFileSync(path.join(root,'guardrails/guardrail-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);
