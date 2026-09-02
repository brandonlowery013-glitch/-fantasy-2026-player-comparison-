import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>fs.writeFileSync(path.join(root,p),JSON.stringify(x,null,2)+'\n');
const ledgerPath='guardrails/current-football-review.json';
const summaryPath='guardrails/live-full-universe-review-summary.json';
const ledger=read(ledgerPath);
const source=read('MODEL_SOURCE_OF_TRUTH.json');
const textNorm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const materialRe=/\b(injur|injured|soreness|stiffness|pain|out|dnp|did not practice|didn t practice|ir|pup|nfi|exempt|suspend|trade|traded|waiv|release|released|cut|sign|signed|activate|activated|starter|starting|depth chart|practice|practiced|limited|questionable|doubtful|return|returned|role|workload|committee|timeshare|target|route|snap|carry|touch|reps|first team|goal line|red zone|rb1|wr1|te1|qb1)\b/i;
const now=Date.now(),maxAgeMs=14*24*60*60*1000;
function recent(m){if(!m?.published)return m?.source==='NFL.com';const t=Date.parse(m.published);return Number.isFinite(t)&&t<=now+24*60*60*1000&&now-t<=maxAgeMs;}

// NFL.com pages can carry site-wide related-story/navigation text. Track how many modeled
// players a single NFL URL appears to mention so broad shared pages cannot become body-based
// material triggers merely because unrelated player names and materiality words coexist.
const nflUrlPlayers=new Map();
for(const p of ledger.players||[])for(const m of p.news_mentions||[]){if(m?.source!=='NFL.com'||!m?.url)continue;const set=nflUrlPlayers.get(m.url)||new Set();set.add(p.player);nflUrlPlayers.set(m.url,set);}
const NFL_BODY_PLAYER_FANOUT_MAX=8;
let nflBroadBodySuppressions=0;

function localContext(player,m){
  const phrase=textNorm(player),header=textNorm(`${m?.headline||''} ${m?.description||''}`),body=textNorm(m?.body_text||'');
  if(phrase&&header.includes(phrase))return{context:header,match:'FULL_NAME_HEADER'};
  const broadNflBody=m?.source==='NFL.com'&&m?.url&&(nflUrlPlayers.get(m.url)?.size||0)>NFL_BODY_PLAYER_FANOUT_MAX;
  if(broadNflBody){nflBroadBodySuppressions++;return{context:'',match:'NFL_BROAD_BODY_SUPPRESSED'};}
  const words=body.split(' ').filter(Boolean),pwords=phrase.split(' ').filter(Boolean);
  if(pwords.length){for(let i=0;i<=words.length-pwords.length;i++){if(pwords.every((w,j)=>words[i+j]===w)){const a=Math.max(0,i-45),b=Math.min(words.length,i+pwords.length+45);return{context:words.slice(a,b).join(' '),match:'FULL_NAME_BODY_WINDOW'};}}}
  // ESPN_PLAYER is bound to the modeled athlete ID. That binding is stronger than text matching
  // and is allowed even when the headline/body uses only a surname or pronoun.
  if(m?.source==='ESPN_PLAYER')return{context:textNorm(`${m?.headline||''} ${m?.description||''} ${m?.body_text||''}`),match:'BOUND_ESPN_PLAYER'};
  // Shared NFL/ESPN feeds are never eligible through surname-only matching. Surname collisions
  // (for example Patrick Taylor -> Jonathan Taylor or Christian McCaffrey -> Luke McCaffrey)
  // are too dangerous for substantive model triggers.
  return{context:'',match:'NO_FULL_NAME_OR_ATHLETE_BINDING'};
}

// Production regression assertions: these exact collision classes previously polluted the
// substantive candidate set and must remain blocked.
const collisionTaylor=localContext('Jonathan Taylor',{source:'NFL.com',headline:'Roster update',description:'Patrick Taylor was waived after practice.',body_text:'Patrick Taylor was waived after practice.',url:'https://example.invalid/taylor'});
if(collisionTaylor.context)throw new Error(`NAME_COLLISION_REGRESSION: Jonathan Taylor matched Patrick Taylor via ${collisionTaylor.match}`);
const collisionMcCaffrey=localContext('Luke McCaffrey',{source:'NFL.com',headline:'Christian McCaffrey returns to practice',description:'Christian McCaffrey returned to practice.',body_text:'Christian McCaffrey returned to practice.',url:'https://example.invalid/mccaffrey'});
if(collisionMcCaffrey.context)throw new Error(`NAME_COLLISION_REGRESSION: Luke McCaffrey matched Christian McCaffrey via ${collisionMcCaffrey.match}`);
const boundPlayer=localContext('Example Player',{source:'ESPN_PLAYER',headline:'Expected back at practice',description:'He is expected back at practice.',body_text:'',url:'https://example.invalid/player'});
if(!boundPlayer.context||boundPlayer.match!=='BOUND_ESPN_PLAYER')throw new Error('NAME_COLLISION_REGRESSION: athlete-bound ESPN player evidence was rejected');

function qualify(player,m){if(!recent(m))return null;const {context,match}=localContext(player,m);if(!context||!materialRe.test(context))return null;return{...m,match_evidence:match,matched_context:context};}
function dedupe(xs){const seen=new Set();return xs.filter(x=>{const k=x.url||`${x.source}|${x.headline}|${x.description}`;if(seen.has(k))return false;seen.add(k);return true;});}
let before=0,after=0;
for(const p of ledger.players||[]){before+=(p.material_news_signals||[]).length;const qualified=dedupe((p.news_mentions||[]).map(m=>qualify(p.player,m)).filter(Boolean));p.material_news_signals=qualified;after+=qualified.length;}
let connectedBefore=0,connectedAfter=0;
for(const p of ledger.materially_implicated_untracked||[]){connectedBefore+=(p.material_news_signals||[]).length;const qualified=dedupe((p.news_mentions||[]).map(m=>qualify(p.player,m)).filter(Boolean));p.material_news_signals=qualified;connectedAfter+=qualified.length;}
const trackedSignals=(ledger.players||[]).filter(p=>(p.material_news_signals||[]).length).map(p=>({player:p.player,team:null,mentions:p.material_news_signals}));
const connectedSignals=(ledger.materially_implicated_untracked||[]).filter(p=>(p.material_news_signals||[]).length).map(p=>({player:p.player,team:p.team||null,mentions:p.material_news_signals}));
if(trackedSignals.length>Math.ceil(Number(source.active_player_model)*0.50))throw new Error(`Materiality relevance failure: ${trackedSignals.length}/${source.active_player_model} modeled players still triggered after full-name/athlete-bound current-context filtering`);

const modeledEspnIdsResolved=(ledger.players||[]).filter(p=>p.espn_athlete_id).length;
const unresolvedModeled=(ledger.players||[]).filter(p=>!p.espn_athlete_id).map(p=>p.player);
ledger.source_quality={...(ledger.source_quality||{}),espn_athlete_ids_resolved:modeledEspnIdsResolved,espn_modeled_athlete_ids_resolved:modeledEspnIdsResolved,espn_player_ids_unresolved:unresolvedModeled,nfl_broad_body_fanout_limit:NFL_BODY_PLAYER_FANOUT_MAX,nfl_broad_body_suppressions:nflBroadBodySuppressions,name_collision_regression_tests:true};
if(modeledEspnIdsResolved<150)throw new Error(`Modeled ESPN athlete-ID coverage too low after audit: ${modeledEspnIdsResolved}/${source.active_player_model}; unresolved=${unresolvedModeled.join(', ')}`);

ledger.schema_version='1.2.3';ledger.materiality_filter={method:'FULL_NAME_OR_ATHLETE_BOUND_CONTEXT_PLUS_14_DAY_FRESHNESS_AND_NFL_FANOUT_GUARD',material_mentions_before:before,material_mentions_after:after,tracked_players_triggered:trackedSignals.length,connected_mentions_before:connectedBefore,connected_mentions_after:connectedAfter,nfl_broad_body_fanout_limit:NFL_BODY_PLAYER_FANOUT_MAX,nfl_broad_body_suppressions:nflBroadBodySuppressions,name_collision_regression_tests:true,generated_at:new Date().toISOString()};
write(ledgerPath,ledger);
const old=fs.existsSync(path.join(root,summaryPath))?read(summaryPath):{};
const summary={...old,generated_at:new Date().toISOString(),tracked_reviewed:(ledger.players||[]).length,material_changes:(ledger.players||[]).filter(p=>p.status==='MATERIAL_CHANGE').map(p=>({player:p.player,reason:p.reason||null})),material_change_count:(ledger.players||[]).filter(p=>p.status==='MATERIAL_CHANGE').length,tracked_material_news_signals:trackedSignals,tracked_material_news_signal_count:trackedSignals.length,connected_material_news_signals:connectedSignals,connected_material_news_signal_count:connectedSignals.length,untracked_candidates:ledger.materially_implicated_untracked||[],untracked_candidate_count:(ledger.materially_implicated_untracked||[]).length,source_quality:ledger.source_quality,materiality_filter:ledger.materiality_filter,result:'BUILT'};
write(summaryPath,summary);
console.log(JSON.stringify({result:'PASS',tracked_players:(ledger.players||[]).length,modeled_espn_ids_resolved:modeledEspnIdsResolved,tracked_material_players:trackedSignals.length,material_mentions_before:before,material_mentions_after:after,connected_material_players:connectedSignals.length,connected_mentions_before:connectedBefore,connected_mentions_after:connectedAfter,nfl_broad_body_suppressions:nflBroadBodySuppressions,name_collision_regression_tests:true,players:trackedSignals.map(x=>x.player)},null,2));