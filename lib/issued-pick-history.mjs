import crypto from 'node:crypto';
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const time=x=>Date.parse(x||'');
const valid=x=>typeof x==='number'&&Number.isFinite(x);
const PATHS={game:'data/market/weekly-game-market-recommendations-2026.json',prop:'data/market/player-prop-recommendations-2026.json'};
// Capture publication candidates, never reconstruct older issued picks from today's model.
export function captureHistory({ledger, schedule, gameRecs, propRecs, propSnapshots, now, sourceCommit=null}) {
 if(!Number.isFinite(time(now)))throw Error('Invalid history capture timestamp');
 if(ledger&&(ledger.schema_version!=='1.0.0'||!Array.isArray(ledger.records)))throw Error('Invalid existing pick history');
 const records=[...(ledger?.records||[])],latest=new Map(),skipped=[];
 for(const r of records)latest.set(r.stream_id,r);
 const week=Number(schedule.week),season=Number(schedule.season),games=schedule.games||{};
 const snapshots=new Map((propSnapshots?.snapshots||[]).map(s=>[s.snapshot_id,s]));
 const seen=new Set();
 const sourceHashes=new Map();
 function provenance(source, evidence){
  if(!sourceHashes.has(source))sourceHashes.set(source,hash(source));
  return {version:1,source_code_commit:sourceCommit,artifact_json_sha256:sourceHashes.get(source),hash_encoding:'SHA256(JSON.stringify(parsed artifact)); not raw file bytes',evidence:structuredClone(evidence)};
 }
 function append(row, capturedEvidence=null){
  const g=games[row.game_id],kickoff=g?.event_start||g?.kickoff;
  if(!g||Number(g.week??week)!==week||!Number.isFinite(time(kickoff))||time(now)>=time(kickoff)){skipped.push({stream_id:row.stream_id,reason:'MISSING_OR_STARTED_GAME'});return;}
  if(row.decision!=='WITHDRAWN'&&(!Number.isFinite(time(row.source_generated_at))||time(row.source_generated_at)>time(now)||!Number.isFinite(time(row.quote_observed_at))||time(row.quote_observed_at)>time(now)||time(row.quote_observed_at)>time(row.source_generated_at))){skipped.push({stream_id:row.stream_id,reason:'INVALID_SOURCE_TIME'});return;}
  if(row.decision==='PICK'&&(!valid(row.odds)||row.odds===0||!valid(row.win_probability)||row.win_probability<0||row.win_probability>1||!row.selection)){skipped.push({stream_id:row.stream_id,reason:'INCOMPLETE_PICK'});return;}
  seen.add(row.stream_id);
  const {snapshot_id,source_generated_at,quote_observed_at,...state}=row;
  const fingerprint=hash(state),old=latest.get(row.stream_id);
  if(old?.fingerprint===fingerprint)return;
  const record={...row,season,week,kickoff,source_event_id:g.event_id||null,home_team:g.home_team,away_team:g.away_team,captured_at:now,source_commit:sourceCommit,source_provenance:capturedEvidence,record_kind:'PUBLISHED_FEED_CANDIDATE',mode:'SHADOW_ONLY',actionable:false,fingerprint,revision:(old?.revision||0)+1,previous_record_id:old?.record_id||null};
  record.record_id=hash([row.stream_id,record.revision,fingerprint,now]);records.push(record);latest.set(row.stream_id,record);
 }
 if(Number(gameRecs.week)===week)for(const [game_id,g] of Object.entries(gameRecs.games||{})){
  if(Number(g.week)!==week)continue;
  const current=g.current_recommendations||{},snapshot=(g.snapshot_evaluations||[]).find(s=>s.snapshot_id===current.snapshot_id);
  if(!snapshot)continue;
  for(const market of ['spread','total','moneyline']){
   const r=current[market];if(!r)continue;
   const a=market==='total'?r.selection?.startsWith('OVER'):r.selection?.startsWith(g.home_team+' ');
   const side=snapshot.markets?.[market]?.[a?'side_a':'side_b'];
   append({stream_id:`${season}|${game_id}|${market}`,game_id,market,player:null,decision:r.decision,selection:r.selection||null,line:market==='total'?snapshot.market.total:market==='spread'&&r.selection?Number(snapshot.market.home_spread)*(a?1:-1):null,odds:r.decision==='PICK'?side?.offered_odds??null:null,win_probability:r.decision==='PICK'?side?.win_probability??null:null,conditional_win_probability:r.model_conditional_win_probability??null,push_probability:r.decision==='PICK'?side?.push_probability??null:null,book:snapshot.book,model_version:g.model_version||null,model_version_status:g.model_version?'KNOWN':'NOT_PUBLISHED',availability:null,reason:r.reason||null,snapshot_id:snapshot.snapshot_id,quote_observed_at:snapshot.captured_at,source_generated_at:gameRecs.generated_at,source_artifact:PATHS.game}, provenance(gameRecs,{model_version:g.model_version||null,football_projection:g.football_projection||null,scoring_evidence:g.scoring_evidence||null,sportsbook_inputs_used_for_football_projection:g.sportsbook_inputs_used_for_football_projection??null,snapshot_id:snapshot.snapshot_id,quote:snapshot.market,evaluation:snapshot.markets?.[market]||null,recommendation:r}));
  }
 }
 if(Number(propRecs.week)===week)for(const [player,p] of Object.entries(propRecs.players||{}))for(const [market,e] of Object.entries(p.weekly?.current_by_stat||{})){
  if(Number(e.week)!==week)continue;
  const snapshot=snapshots.get(e.snapshot_id),game_id=snapshot?.game_id,r=e.recommendation;
  if(!game_id||!r){skipped.push({player,market,reason:'MISSING_PROP_EVENT'});continue;}
  const side=e.sides?.find(s=>s.side===r.side);
  append({stream_id:`${season}|${game_id}|${player}|${market}`,game_id,market,player,decision:r.decision,selection:r.side||null,line:e.line,odds:side?.offered_odds??null,win_probability:side?.model_win_probability??null,conditional_win_probability:side?.model_conditional_win_probability??null,push_probability:side?.model_push_probability??null,book:e.book,model_version:propRecs.model_version||null,model_version_status:propRecs.model_version?'KNOWN':'NOT_PUBLISHED',availability:e.eligibility||null,reason:r.reason||null,snapshot_id:e.snapshot_id,quote_observed_at:e.captured_at,source_generated_at:propRecs.generated_at,source_artifact:PATHS.prop}, provenance(propRecs,{model_version:propRecs.model_version||null,player,stat:market,evaluation:e,quote_snapshot:snapshot}));
 }
 // A missing pick is an explicit withdrawal, not deletion of its previous record.
 for(const old of [...latest.values()])if(old.week===week&&!seen.has(old.stream_id)&&old.decision==='PICK'){
  const {record_id,fingerprint,revision,previous_record_id,captured_at,source_commit,source_provenance,record_kind,mode,actionable,kickoff,source_event_id,home_team,away_team,...row}=old;
  append({...row,decision:'WITHDRAWN',selection:null,odds:null,win_probability:null,conditional_win_probability:null,push_probability:null,reason:'NOT_PRESENT_IN_CURRENT_PUBLISHED_OUTPUT',snapshot_id:null,quote_observed_at:null,source_generated_at:now});
 }
 return {ledger:{schema_version:'1.0.0',scope:'Publication candidates retained alongside committed feed; not wagers or proof of individual viewer exposure',records},added:records.length-(ledger?.records?.length||0),skipped};
}

