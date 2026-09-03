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
const materialRe=/\b(injur|injured|soreness|stiffness|pain|out|dnp|did not practice|didn t practice|ir|pup|nfi|exempt|suspend|trade|traded|waiv|release|released|cut|sign|signed|activate|activated|starter|starting|depth chart|practice|practiced|limited|questionable|doubtful|return|returned|role|workload|committee|timeshare|target|route|snap|carry|touch|reps|first team|goal line|red zone|rb1|wr1|te1|qb1|chemistry|timing|connection|trust|offense|scheme|install|playbook|two minute|third down)\b/i;
const now=Date.now(),maxAgeMs=14*24*60*60*1000;
function recent(m){if(!m?.published)return m?.source==='NFL.com';const t=Date.parse(m.published);return Number.isFinite(t)&&t<=now+24*60*60*1000&&now-t<=maxAgeMs;}

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
  if(m?.source==='ESPN_PLAYER')return{context:textNorm(`${m?.headline||''} ${m?.description||''} ${m?.body_text||''}`),match:'BOUND_ESPN_PLAYER'};
  return{context:'',match:'NO_FULL_NAME_OR_ATHLETE_BINDING'};
}

const collisionTaylor=localContext('Jonathan Taylor',{source:'NFL.com',headline:'Roster update',description:'Patrick Taylor was waived after practice.',body_text:'Patrick Taylor was waived after practice.',url:'https://example.invalid/taylor'});
if(collisionTaylor.context)throw new Error(`NAME_COLLISION_REGRESSION: Jonathan Taylor matched Patrick Taylor via ${collisionTaylor.match}`);
const collisionMcCaffrey=localContext('Luke McCaffrey',{source:'NFL.com',headline:'Christian McCaffrey returns to practice',description:'Christian McCaffrey returned to practice.',body_text:'Christian McCaffrey returned to practice.',url:'https://example.invalid/mccaffrey'});
if(collisionMcCaffrey.context)throw new Error(`NAME_COLLISION_REGRESSION: Luke McCaffrey matched Christian McCaffrey via ${collisionMcCaffrey.match}`);
const boundPlayer=localContext('Example Player',{source:'ESPN_PLAYER',headline:'Expected back at practice',description:'He is expected back at practice.',body_text:'',url:'https://example.invalid/player'});
if(!boundPlayer.context||boundPlayer.match!=='BOUND_ESPN_PLAYER')throw new Error('NAME_COLLISION_REGRESSION: athlete-bound ESPN player evidence was rejected');

function qualify(player,m){if(!recent(m))return null;const {context,match}=localContext(player,m);if(!context||!materialRe.test(context))return null;return{...m,match_evidence:match,matched_context:context};}
function qualifyExternal(m){if(!recent(m)||!m?.player_bound)return null;const context=textNorm(`${m?.headline||''} ${m?.description||''}`);if(!context||!materialRe.test(context))return null;return{...m,match_evidence:'PLAYER_BOUND_EXTERNAL_DISCOVERY',matched_context:context};}
function qualifyTeamContext(m){if(!recent(m))return null;const context=textNorm(`${m?.headline||''} ${m?.description||''} ${m?.body_text||''}`);if(!context||!materialRe.test(context))return null;return{...m,match_evidence:'CURRENT_TEAM_OFFENSE_CONTEXT',matched_context:context};}
function dedupe(xs){const seen=new Set();return xs.filter(x=>{const k=`${x.context_scope||''}|${x.url||`${x.source}|${x.headline}|${x.description}`}`;if(seen.has(k))return false;seen.add(k);return true;});}
const isOfficialTeamSource=m=>/^OFFICIAL_TEAM/.test(String(m?.source||''));
let before=0,coreAfter=0,officialDirectAfter=0,externalAfter=0,teamContextAfter=0;
for(const p of ledger.players||[]){
  before+=(p.material_news_signals||[]).length;
  const coreDirect=dedupe((p.news_mentions||[]).filter(m=>!isOfficialTeamSource(m)&&m?.source!=='GOOGLE_NEWS_RSS').map(m=>qualify(p.player,m)).filter(Boolean));
  const officialDirect=dedupe((p.news_mentions||[]).filter(isOfficialTeamSource).map(m=>qualify(p.player,m)).filter(Boolean));
  const externalDirect=dedupe((p.external_news_mentions||[]).map(qualifyExternal).filter(Boolean));
  const teamContext=dedupe((p.team_context_mentions||[]).map(qualifyTeamContext).filter(Boolean));
  p.direct_material_news_signals=coreDirect;
  p.material_official_team_direct_signals=officialDirect;
  p.material_external_review_signals=externalDirect;
  p.material_team_context_signals=teamContext;
  p.material_news_signals=dedupe([...coreDirect,...officialDirect,...teamContext]);
  coreAfter+=coreDirect.length;officialDirectAfter+=officialDirect.length;externalAfter+=externalDirect.length;teamContextAfter+=teamContext.length;
}
let connectedBefore=0,connectedAfter=0;
for(const p of ledger.materially_implicated_untracked||[]){connectedBefore+=(p.material_news_signals||[]).length;const qualified=dedupe((p.news_mentions||[]).map(m=>qualify(p.player,m)).filter(Boolean));p.material_news_signals=qualified;connectedAfter+=qualified.length;}
const trackedSignals=(ledger.players||[]).filter(p=>(p.direct_material_news_signals||[]).length).map(p=>({player:p.player,team:p.current_team||p.team||null,mentions:p.direct_material_news_signals}));
const officialDirectSignals=(ledger.players||[]).filter(p=>(p.material_official_team_direct_signals||[]).length).map(p=>({player:p.player,team:p.current_team||p.team||null,mentions:p.material_official_team_direct_signals}));
const externalReviewSignals=(ledger.players||[]).filter(p=>(p.material_external_review_signals||[]).length).map(p=>({player:p.player,team:p.current_team||p.team||null,mentions:p.material_external_review_signals}));
const teamContextSignals=(ledger.players||[]).filter(p=>(p.material_team_context_signals||[]).length).map(p=>({player:p.player,team:p.current_team||p.team||null,mentions:p.material_team_context_signals}));
const connectedSignals=(ledger.materially_implicated_untracked||[]).filter(p=>(p.material_news_signals||[]).length).map(p=>({player:p.player,team:p.team||null,mentions:p.material_news_signals}));
if(trackedSignals.length>Math.ceil(Number(source.active_player_model)*0.50))throw new Error(`Materiality relevance failure: ${trackedSignals.length}/${source.active_player_model} modeled players still triggered in CORE direct NFL/ESPN lane after current-context filtering`);

const modeledEspnIdsResolved=(ledger.players||[]).filter(p=>p.espn_athlete_id).length;
const unresolvedModeled=(ledger.players||[]).filter(p=>!p.espn_athlete_id).map(p=>p.player);
ledger.source_quality={...(ledger.source_quality||{}),espn_athlete_ids_resolved:modeledEspnIdsResolved,espn_modeled_athlete_ids_resolved:modeledEspnIdsResolved,espn_player_ids_unresolved:unresolvedModeled,nfl_broad_body_fanout_limit:NFL_BODY_PLAYER_FANOUT_MAX,nfl_broad_body_suppressions:nflBroadBodySuppressions,name_collision_regression_tests:true,official_team_direct_material_mentions:officialDirectAfter,official_team_context_material_mentions:teamContextAfter,external_review_material_mentions:externalAfter,external_review_governance:'SEPARATE_PROPOSAL_ONLY_LANE_EXCLUDED_FROM_CORE_CARDINALITY_GUARD'};
if(modeledEspnIdsResolved<150)throw new Error(`Modeled ESPN athlete-ID coverage too low after audit: ${modeledEspnIdsResolved}/${source.active_player_model}; unresolved=${unresolvedModeled.join(', ')}`);

ledger.schema_version='1.2.5';ledger.materiality_filter={method:'CORE_DIRECT_NFL_ESPN_GUARD_PLUS_SEPARATE_OFFICIAL_TEAM_EXTERNAL_AND_TEAM_CONTEXT_LANES',material_mentions_before:before,core_direct_material_mentions_after:coreAfter,official_team_direct_mentions_after:officialDirectAfter,external_review_mentions_after:externalAfter,team_context_mentions_after:teamContextAfter,tracked_players_core_direct_triggered:trackedSignals.length,tracked_players_official_team_direct_triggered:officialDirectSignals.length,tracked_players_external_review_triggered:externalReviewSignals.length,tracked_players_team_context_triggered:teamContextSignals.length,connected_mentions_before:connectedBefore,connected_mentions_after:connectedAfter,nfl_broad_body_fanout_limit:NFL_BODY_PLAYER_FANOUT_MAX,nfl_broad_body_suppressions:nflBroadBodySuppressions,name_collision_regression_tests:true,generated_at:new Date().toISOString()};
write(ledgerPath,ledger);
const old=fs.existsSync(path.join(root,summaryPath))?read(summaryPath):{};
const summary={...old,generated_at:new Date().toISOString(),tracked_reviewed:(ledger.players||[]).length,material_changes:(ledger.players||[]).filter(p=>p.status==='MATERIAL_CHANGE').map(p=>({player:p.player,reason:p.reason||null})),material_change_count:(ledger.players||[]).filter(p=>p.status==='MATERIAL_CHANGE').length,tracked_material_news_signals:trackedSignals,tracked_material_news_signal_count:trackedSignals.length,tracked_official_team_direct_signals:officialDirectSignals,tracked_official_team_direct_signal_count:officialDirectSignals.length,tracked_external_review_signals:externalReviewSignals,tracked_external_review_signal_count:externalReviewSignals.length,tracked_team_context_signals:teamContextSignals,tracked_team_context_signal_count:teamContextSignals.length,connected_material_news_signals:connectedSignals,connected_material_news_signal_count:connectedSignals.length,untracked_candidates:ledger.materially_implicated_untracked||[],untracked_candidate_count:(ledger.materially_implicated_untracked||[]).length,source_quality:ledger.source_quality,materiality_filter:ledger.materiality_filter,result:'BUILT'};
write(summaryPath,summary);
console.log(JSON.stringify({result:'PASS',tracked_players:(ledger.players||[]).length,modeled_espn_ids_resolved:modeledEspnIdsResolved,tracked_core_direct_material_players:trackedSignals.length,tracked_official_team_direct_players:officialDirectSignals.length,tracked_external_review_players:externalReviewSignals.length,tracked_team_context_players:teamContextSignals.length,core_direct_material_mentions_after:coreAfter,official_team_direct_mentions_after:officialDirectAfter,external_review_mentions_after:externalAfter,team_context_mentions_after:teamContextAfter,connected_material_players:connectedSignals.length,nfl_broad_body_suppressions:nflBroadBodySuppressions,name_collision_regression_tests:true},null,2));
