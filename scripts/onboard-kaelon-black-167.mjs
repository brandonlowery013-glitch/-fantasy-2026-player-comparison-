import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(x,null,2)+'\n');};
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const today='2026-09-14';
const playerName='Kaelon Black';
const candidateId='kaelon-black';

const truth=read('MODEL_SOURCE_OF_TRUTH.json');
const shards=Number(truth.runtime_player_shards);
let all=[];for(let i=0;i<shards;i++)all.push(...read(`players${i}.json`));
const already=all.find(p=>p.n===playerName);
if(already){
  if(Number(truth.active_player_model)!==all.length) throw new Error('Kaelon present but source-of-truth count mismatches loaded universe');
  console.log(JSON.stringify({result:'PASS',status:'ALREADY_ONBOARDED',active_players:all.length},null,2));
  process.exit(0);
}
if(Number(truth.active_player_model)!==166||all.length!==166) throw new Error(`Expected 166-player pre-state, got truth=${truth.active_player_model}, loaded=${all.length}`);

const maxPos=(field,pos)=>Math.max(0,...all.filter(p=>p.p===pos).map(p=>Number(String(p[field]||'').replace(/^[A-Z]+/,''))).filter(Number.isFinite));
const pd=6.4,ce=7.4,r=6.8,e=8.8,a=9.5,rl=6.5,su=7.5;
const score=Number((.35*pd+.20*ce+.15*r+.10*e+.10*a+.05*rl+.05*su).toFixed(5));
const row={
  n:playerName,p:'RB',pr:`RB${maxPos('pr','RB')+1}`,o:167,t:'San Francisco 49ers',tr:167,tp:`RB${maxPos('tp','RB')+1}`,
  s:score,pd,ce,r,e,a,rl,su,ad:null,s6:'IN_SEASON',s7:'ACCEPTABLE',px:'IN_SEASON',fw:'waivers / contingency add',
  st:'WEEK 1 COMMITTEE ROLE CONFIRMED',
  m:'ROS median: 420-540 rush yd / 2-4 TD · 10-16 rec / 70-120 yd / 0-1 TD',
  cl:'ROS ceiling: 700-850 rush yd / 6-8 TD · 20-28 rec / 150-220 yd / 1-2 TD if role expands or McCaffrey misses time',
  mp:104,cp:null,dp:null,
  cn:'Week 1: 14 carries, 65 rush yd; 1 reception, 5 rec yd',
  vl:'FantasyPros PPR ROS: overall #243 / RB59 (captured 2026-09-14; thin expert sample)',
  vs:null,vr:'Market places him outside the active 167-player model; model admits him for demonstrated standalone committee usage plus contingent upside.',
  en:'Elite San Francisco rushing environment. Week 1 showed an intentional committee element behind Christian McCaffrey, but Black remains secondary and must earn repeatable weekly volume before a higher season-long rank is justified.',
  ns:'2026-09-14 REGULAR-SEASON ADMISSION',
  nm:'Black handled 14 carries for 65 yards and one reception in Week 1 while San Francisco intentionally shared rushing work with Christian McCaffrey. The role creates both standalone committee value and meaningful contingent upside.',
  na:'ADMIT at conservative initial rank 167. Preserve all existing player ranks; re-open Role/Expected Production only when additional regular-season usage supports a reflow.',
  projection_context:{history_seasons:0,history_baseline_ppr:null,context_factor:1,prior_projected_ppr:null,recalibrated_projected_ppr:104,note:'Initial in-season projection uses demonstrated Week 1 committee usage but discounts a one-game sample and preserves McCaffrey as the primary back.',material_downstream_change:true,old_production_tier:'Not ranked',new_production_tier:'Deep contingency / committee'},
  sync_note:'Player 167 onboarding triggered by verified Week 1 committee usage and standalone/contingent fantasy relevance.',
  current_recommendation:'IN-SEASON WAIVER / CONTINGENCY ADD — monitor Week 2 snap share, carries, two-minute and red-zone usage',
  market_ros_overall_rank:243,market_ros_position_rank:'RB59',market_as_of:'2026-09-14',market_source:'FantasyPros PPR rest-of-season consensus'
};

const last=`players${shards-1}.json`;const shard=read(last);shard.push(row);write(last,shard);

truth.active_player_model=167;
truth.status='authoritative_current_2026_09_14_in_season_kaelon_black_admitted';
truth.effective_date=today;
truth.current_update_layer_effective_date=today;
truth.current_cost_coverage='ARCHIVAL_DRAFT_ONLY — ADP/draft-cost layer disabled after regular season start';
truth.current_ros_rank_coverage='167/167 internal ROS ranks; Kaelon Black FantasyPros PPR ROS overall #243 / RB59 captured 2026-09-14';
truth.in_season_ranking_mode='ROS overall + ROS positional + matchup-sensitive weekly rankings; ADP disabled';
truth.step3e_state=(truth.step3e_state||'')+'; Kaelon Black admitted as player 167 from verified Week 1 committee usage';
write('MODEL_SOURCE_OF_TRUTH.json',truth);

const cfg=read('guardrails/guardrails-config.json');cfg.authoritative_player_count=167;write('guardrails/guardrails-config.json',cfg);

const manifest=read('guardrails/universe-change-manifest.json');
manifest.version='1.6.0';manifest.purpose='Historical admissions/model changes plus 2026-09-14 in-season Kaelon Black admission.';
manifest.changes=Array.isArray(manifest.changes)?manifest.changes:[];
manifest.changes.push({action:'ADMIT',player:playerName,from_count:166,to_count:167,initial_overall_rank:167,initial_true_value_rank:167,reason:'Verified Week 1 San Francisco committee usage (14 carries, 65 yards, one catch) established plausible standalone weekly touches plus material contingent upside behind Christian McCaffrey.',source:'2026-09-10 SF-LAR Week 1 game usage; FantasyPros PPR ROS RB59 / overall 243 captured 2026-09-14'});
manifest.admission_updates=Array.isArray(manifest.admission_updates)?manifest.admission_updates:[];
manifest.admission_updates.push({player:playerName,date:today,decision:'ADMIT',status:'COMPLETE',overall_rank:167,true_value_rank:167,market_ros_overall_rank:243,market_ros_position_rank:'RB59'});
write('guardrails/universe-change-manifest.json',manifest);

const boards=read('canonicalBoards2026.json');boards.updated=today;boards.active_players=167;
const boardRow={n:row.n,p:row.p,t:row.t,o:row.o,pr:row.pr,tr:row.tr,tp:row.tp,s:row.s,pd:row.pd,ce:row.ce,r:row.r,e:row.e,a:row.a,rl:row.rl,su:row.su,mp:row.mp,m:row.m,cl:row.cl,px:row.px,fw:row.fw,st:row.st,en:row.en,ad:null,cp:null,cn:row.cn,vl:row.vl,vs:null,vr:row.vr,market_ros_overall_rank:243,market_ros_position_rank:'RB59'};
for(const key of ['overall','overallBoard','trueValue','true_value','trueValueBoard']){
  if(Array.isArray(boards[key])&&!boards[key].some(x=>x?.n===playerName)) boards[key].push(boardRow);
}
write('canonicalBoards2026.json',boards);

const pkg={version:1,candidate_id:candidateId,player_name:playerName,calibration:{reviewed:true,method:'REGULAR_SEASON_USAGE_PLUS_CONTINGENT_VALUE',generated_at:new Date().toISOString(),source_run:'2026-09-14 unified full-development sweep'},integration:{expected_before_count:166,expected_after_count:167,expected_before_shards:shards,expected_after_shards:shards,canonical_files:{[last]:shard,'MODEL_SOURCE_OF_TRUTH.json':truth,'guardrails/guardrails-config.json':cfg,'guardrails/universe-change-manifest.json':manifest,'canonicalBoards2026.json':boards}}};
const packagePath=`admissions/packages/${candidateId}.json`;write(packagePath,pkg);const digest=hash(pkg);
const queue=read('admissions/queue.json');queue.updated_at=new Date().toISOString();queue.entries=(queue.entries||[]).filter(x=>x.candidate_id!==candidateId);queue.entries.push({candidate_id:candidateId,player_name:playerName,team:'San Francisco 49ers',position:'RB',decision:'ADMIT',status:'COMPLETE',package_path:packagePath,evidence:[{date:'2026-09-10',summary:'14 carries for 65 yards plus one reception in Week 1; intentional committee usage behind Christian McCaffrey'},{date:'2026-09-14',summary:'FantasyPros PPR ROS consensus: overall #243 / RB59; contingent and standalone role clears admission threshold'}],onboarding_complete:true,completed_at:new Date().toISOString(),package_sha256:digest});write('admissions/queue.json',queue);
write(`admissions/completed/${candidateId}.json`,{version:1,candidate_id:candidateId,player_name:playerName,completed_at:queue.entries.at(-1).completed_at,package_path:packagePath,package_sha256:digest,post_count:167});

// Remove the known live weekly-outlook 166 hard lock so the next cycle resolves the source-of-truth count.
const outlookPath='scripts/build-weekly-player-outlook.mjs';
if(fs.existsSync(outlookPath)){
  let s=fs.readFileSync(outlookPath,'utf8');
  s=s.replace(/if\(expected!==166\)[^\n]*\n/,'if(!Number.isInteger(expected)||expected<=0) throw new Error(`Invalid canonical universe: ${expected}`);\n');
  s=s.replaceAll('players.length!==166','players.length!==expected').replaceAll('new Set(players.map(p=>p.n)).size!==166','new Set(players.map(p=>p.n)).size!==expected').replaceAll('universe:166','universe:expected').replaceAll('Object.keys(out.players).length!==166','Object.keys(out.players).length!==expected').replaceAll('players:166','players:expected');
  fs.writeFileSync(outlookPath,s);
}

write('guardrails/kaelon-black-onboarding-report.json',{generated_at:new Date().toISOString(),result:'PASS',decision:'ADMIT',player:playerName,pre_count:166,post_count:167,overall_rank:167,true_value_rank:167,position_rank:row.pr,true_value_position_rank:row.tp,true_value_score:row.s,components:{expected_production:pd,ceiling:ce,role:r,environment:e,availability:a,reliability:rl,sustainability:su},market:{ppr_ros_overall:243,ppr_ros_position:'RB59',as_of:'2026-09-14'},rank_reflow:'NONE — appended at 167; existing ranks preserved',week2_rollover:'BLOCK UNTIL FINAL WEEK 1 GAME IS FINAL'});
console.log(JSON.stringify(read('guardrails/kaelon-black-onboarding-report.json'),null,2));
