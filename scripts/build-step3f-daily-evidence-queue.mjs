import fs from 'node:fs';

const shardFiles=fs.readdirSync('.').filter(f=>/^players\d+\.json$/.test(f)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
const players=shardFiles.flatMap(f=>JSON.parse(fs.readFileSync(f,'utf8')));
const universeCfg=JSON.parse(fs.readFileSync('guardrails/guardrails-config.json','utf8'));
const expectedPlayerCount=Number(universeCfg.authoritative_player_count);
const uniquePlayerCount=new Set(players.map(p=>p.n)).size;
if(players.length!==expectedPlayerCount||uniquePlayerCount!==expectedPlayerCount) throw new Error(`Step 3F requires ${expectedPlayerCount} unique players; found ${players.length}/${uniquePlayerCount}`);
const byName=new Map(players.map(p=>[p.n,p]));
const contract=JSON.parse(fs.readFileSync('data/sources/step3f-daily-evidence-model-2026.json','utf8'));
const overrides=JSON.parse(fs.readFileSync('injuryOverrides2026.json','utf8'));
const snapshots=fs.existsSync('data/ingestion/weekly-football-source-snapshots-2026.json')?JSON.parse(fs.readFileSync('data/ingestion/weekly-football-source-snapshots-2026.json','utf8')):{snapshots:[]};
const rawWeekly=fs.existsSync('data/probability/weekly-football-context-raw-2026.json')?JSON.parse(fs.readFileSync('data/probability/weekly-football-context-raw-2026.json','utf8')):{players:{}};

const canonicalCategory=(signalType,text='')=>{
  const type=String(signalType||'').toLowerCase();
  if(type==='role')return 'ROLE_DEPTH_CHART';
  if(type==='injury')return 'INJURY_AVAILABILITY';
  if(type==='team_environment'||type==='qb_context')return 'TEAM_QB_ENVIRONMENT';
  if(type==='opponent')return 'OPPONENT_CONTEXT';
  const s=String(text).toUpperCase();
  if(/CURRENT CAMP ROLE UPDATE|ROLE|DEPTH|BACKFIELD|TARGET|REPS|WORKLOAD|STARTER|SPLIT/.test(s)) return 'ROLE_DEPTH_CHART';
  if(/ACL|MCL|HAMSTRING|GROIN|ANKLE|KNEE|CALF|HIP|BACK|TOE|INJURY|RECOVERY|SPRAIN|PUP|NFI|SORENESS/.test(s)) return 'INJURY_AVAILABILITY';
  if(/QB|QUARTERBACK|OFFENSE|OFFENSIVE|TEAM|SCHEME|COORDINATOR|PLAY.?CALL/.test(s)) return 'TEAM_QB_ENVIRONMENT';
  return 'OTHER_FOOTBALL_CONTEXT';
};
const action=(cat)=>cat==='INJURY_AVAILABILITY'?'REVIEW_AVAILABILITY_AND_DOWNSIDE':cat==='ROLE_DEPTH_CHART'?'REVIEW_ROLE_AND_VOLUME':cat==='TEAM_QB_ENVIRONMENT'?'REVIEW_ENVIRONMENT':cat==='OPPONENT_CONTEXT'?'REVIEW_OPPONENT_CONTEXT':'REVIEW_CONTEXT';
const unknown=[];const records=[];
const add=(name,sourceKind,data={})=>{
  const p=byName.get(name);if(!p){unknown.push(`${sourceKind}:${name}`);return;}
  const text=`${data.status||''} ${data.source_label||''} ${data.evidence_note||''} ${data.current_action_note||''}`;
  const cat=canonicalCategory(data.signal_type,text);
  const completeness=data.completeness||([data.source_label,data.evidence_note,data.status].filter(x=>String(x??'').trim()).length>=2?'COMPLETE':'PARTIAL');
  records.push({player:name,pos:p.p,team:p.t,live_projection:Number.isFinite(Number(p.mp))?Number(p.mp):null,live_overall_rank:p.o??null,live_true_value_rank:p.tr??null,
    evidence_source_kind:sourceKind,evidence_category:cat,evidence_completeness:completeness,signal_type:data.signal_type??null,source_label:data.source_label??null,captured_at:data.captured_at??null,status:data.status??null,evidence_note:data.evidence_note??null,current_action_note:data.current_action_note??null,
    source_stat_adjustments:data.stat_adjustments??null,proposed_action:action(cat),proposed_numeric_projection_delta:0,proposed_numeric_rank_delta:0,automatic_apply:false,approval_required:true});
};

for(const [name,x] of Object.entries(overrides.players||{})){
  const present=['st','ns','nm','na'].filter(k=>String(x[k]??'').trim()).length;
  add(name,'CURRENT_OVERRIDE',{source_label:x.ns,status:x.st,evidence_note:x.nm,current_action_note:x.na,completeness:present===4?'COMPLETE':present>=2?'PARTIAL':'SPARSE'});
}
for(const s of snapshots.snapshots||[]){if(s?.player)add(s.player,'WEEKLY_SOURCE_SNAPSHOT',{signal_type:s.signal_type,source_label:s.source,captured_at:s.captured_at,evidence_note:s.note||s.restriction_note||null,status:s.status||null,stat_adjustments:s.stat_adjustments});}
for(const [name,x] of Object.entries(rawWeekly.players||{})){
  const signals=Array.isArray(x?.signals)?x.signals:[];
  if(signals.length){for(const s of signals)add(name,'WEEKLY_NORMALIZED_RAW',{signal_type:s.signal_type||s.type,source_label:s.source,captured_at:s.captured_at,evidence_note:s.note||null,status:x.expected_active===false?'EXPECTED_INACTIVE':null,stat_adjustments:s.stat_adjustments});}
  else add(name,'WEEKLY_NORMALIZED_RAW',{source_label:'weekly-football-context-raw-2026',captured_at:rawWeekly.captured_at,status:x?.expected_active===false?'EXPECTED_INACTIVE':null,evidence_note:'Weekly player context row present; no signal array supplied.'});
}
if(unknown.length) throw new Error(`Unknown Step 3F evidence players: ${[...new Set(unknown)].join(', ')}`);
records.sort((a,b)=>(a.live_overall_rank??9999)-(b.live_overall_rank??9999)||a.player.localeCompare(b.player)||a.evidence_source_kind.localeCompare(b.evidence_source_kind));
const evidenceNames=new Set(records.map(r=>r.player));
const universe=players.map(p=>({player:p.n,pos:p.p,team:p.t,has_current_evidence:evidenceNames.has(p.n),live_projection:Number.isFinite(Number(p.mp))?Number(p.mp):null}));
const categoryCounts={};const completenessCounts={};const sourceCounts={};for(const r of records){categoryCounts[r.evidence_category]=(categoryCounts[r.evidence_category]||0)+1;completenessCounts[r.evidence_completeness]=(completenessCounts[r.evidence_completeness]||0)+1;sourceCounts[r.evidence_source_kind]=(sourceCounts[r.evidence_source_kind]||0)+1;}
const report={generated_at:new Date().toISOString(),step:'STEP_3F_DAILY_EVIDENCE_TO_MODEL_AUTOMATION',status:'READY_FOR_REVIEW',contract_version:contract.version,
  players_checked:expectedPlayerCount,authoritative_player_count:expectedPlayerCount,evidence_records:records.length,players_with_evidence:evidenceNames.size,unknown_players:[],sportsbook_or_adp_used:false,market_inputs_used:false,
  source_feed_status:{current_overrides:{updated:overrides.updated??null,records:Object.keys(overrides.players||{}).length},weekly_snapshots:{status:snapshots.status??null,records:(snapshots.snapshots||[]).length},weekly_raw:{status:rawWeekly.status??null,week:rawWeekly.week??null,players:Object.keys(rawWeekly.players||{}).length}},
  automatic_live_write:false,approval_required:true,live_projection_movement:0,live_rank_movement:0,
  numeric_authority_policy:'All currently unvalidated preseason injury severity, role-upshift, coach identity and generic-news effects remain zero. Source-provided stat adjustments are preserved as evidence only and receive zero automatic authority here.',
  category_counts:categoryCounts,evidence_completeness_counts:completenessCounts,source_counts:sourceCounts,review_queue:records,player_universe:universe};
fs.mkdirSync('guardrails',{recursive:true});fs.writeFileSync('guardrails/step3f-daily-evidence-queue.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,players:expectedPlayerCount,evidence:records.length,players_with_evidence:evidenceNames.size,sources:sourceCounts,categories:categoryCounts,feed_status:report.source_feed_status,live_movement:0},null,2));
