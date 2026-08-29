import fs from 'node:fs';

const shardFiles=fs.readdirSync('.').filter(f=>/^players\d+\.json$/.test(f)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
const players=shardFiles.flatMap(f=>JSON.parse(fs.readFileSync(f,'utf8')));
if(players.length!==162||new Set(players.map(p=>p.n)).size!==162) throw new Error(`Step 3F requires 162 unique players; found ${players.length}/${new Set(players.map(p=>p.n)).size}`);
const byName=new Map(players.map(p=>[p.n,p]));
const overrides=JSON.parse(fs.readFileSync('injuryOverrides2026.json','utf8'));
const evidencePlayers=overrides.players||{};
const contract=JSON.parse(fs.readFileSync('data/sources/step3f-daily-evidence-model-2026.json','utf8'));

const category=(x)=>{
  const s=`${x.st||''} ${x.ns||''} ${x.nm||''} ${x.na||''}`.toUpperCase();
  if(/ACL|MCL|HAMSTRING|GROIN|ANKLE|KNEE|CALF|HIP|BACK|TOE|INJURY|RECOVERY|SPRAIN|PUP|NFI|SORENESS/.test(s)) return 'INJURY_AVAILABILITY';
  if(/ROLE|DEPTH|BACKFIELD|TARGET|REPS|WORKLOAD|STARTER|SPLIT/.test(s)) return 'ROLE_DEPTH_CHART';
  if(/QB|QUARTERBACK|OFFENSE|OFFENSIVE|TEAM|SCHEME|COORDINATOR|PLAY.?CALL/.test(s)) return 'TEAM_QB_ENVIRONMENT';
  return 'OTHER_FOOTBALL_CONTEXT';
};
const completeness=(x)=>{
  const fields=['st','ns','nm','na']; const present=fields.filter(k=>String(x[k]??'').trim()).length;
  return present===4?'COMPLETE':present>=2?'PARTIAL':'SPARSE';
};
const action=(cat)=>cat==='INJURY_AVAILABILITY'?'REVIEW_AVAILABILITY_AND_DOWNSIDE':cat==='ROLE_DEPTH_CHART'?'REVIEW_ROLE_AND_VOLUME':cat==='TEAM_QB_ENVIRONMENT'?'REVIEW_ENVIRONMENT':'REVIEW_CONTEXT';

const unknown=[]; const records=[];
for(const [name,x] of Object.entries(evidencePlayers)){
  const p=byName.get(name);
  if(!p){unknown.push(name);continue;}
  const cat=category(x);
  records.push({
    player:name,pos:p.p,team:p.t,live_projection:Number.isFinite(Number(p.mp))?Number(p.mp):null,live_overall_rank:p.o??null,live_true_value_rank:p.tr??null,
    evidence_category:cat,evidence_completeness:completeness(x),source_label:x.ns??null,status:x.st??null,evidence_note:x.nm??null,current_action_note:x.na??null,
    proposed_action:action(cat),proposed_numeric_projection_delta:0,proposed_numeric_rank_delta:0,automatic_apply:false,approval_required:true
  });
}
if(unknown.length) throw new Error(`Unknown Step 3F evidence players: ${unknown.join(', ')}`);
records.sort((a,b)=>(a.live_overall_rank??9999)-(b.live_overall_rank??9999)||a.player.localeCompare(b.player));
const evidenceNames=new Set(records.map(r=>r.player));
const universe=players.map(p=>({player:p.n,pos:p.p,team:p.t,has_current_evidence:evidenceNames.has(p.n),live_projection:Number.isFinite(Number(p.mp))?Number(p.mp):null}));
const categoryCounts={};const completenessCounts={};for(const r of records){categoryCounts[r.evidence_category]=(categoryCounts[r.evidence_category]||0)+1;completenessCounts[r.evidence_completeness]=(completenessCounts[r.evidence_completeness]||0)+1;}
const report={
  generated_at:new Date().toISOString(),step:'STEP_3F_DAILY_EVIDENCE_TO_MODEL_AUTOMATION',status:'READY_FOR_REVIEW',contract_version:contract.version,
  players_checked:162,evidence_records:records.length,unknown_players:[],sportsbook_or_adp_used:false,market_inputs_used:false,
  automatic_live_write:false,approval_required:true,live_projection_movement:0,live_rank_movement:0,
  numeric_authority_policy:'All currently unvalidated preseason injury severity, role-upshift, coach identity and generic-news effects remain zero. This job proposes review actions; it does not manufacture a numeric effect.',
  category_counts:categoryCounts,evidence_completeness_counts:completenessCounts,
  review_queue:records,player_universe:universe
};
fs.mkdirSync('guardrails',{recursive:true});
fs.writeFileSync('guardrails/step3f-daily-evidence-queue.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,players:162,evidence:records.length,categories:categoryCounts,completeness:completenessCounts,live_movement:0},null,2));
