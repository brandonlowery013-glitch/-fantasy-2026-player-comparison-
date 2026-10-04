import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(p,base=root)=>JSON.parse(fs.readFileSync(path.join(base,p),'utf8'));
const write=(p,x,base=root)=>{const f=path.join(base,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(x,null,2)+'\n');};
const clone=x=>JSON.parse(JSON.stringify(x));

export function buildAdmissionPackage({candidateId,base=root}){
  const queue=read('admissions/queue.json',base);
  const entry=queue.entries.find(x=>x.candidate_id===candidateId);
  if(!entry) throw new Error(`candidate not found: ${candidateId}`);
  const calPath=`admissions/calibrations/${candidateId}.json`;
  if(!fs.existsSync(path.join(base,calPath))) throw new Error(`reviewed calibration missing: ${calPath}`);
  const cal=read(calPath,base);
  if(cal.reviewed!==true) throw new Error('calibration.reviewed must be true');
  if(cal.player_name!==entry.player_name) throw new Error('calibration player_name mismatch');
  if(!cal.player_record||typeof cal.player_record!=='object') throw new Error('calibration.player_record required');
  for(const k of ['o','tr','s','pd','ce','r','e','a','rl','su','mp']) if(!Number.isFinite(Number(cal.player_record[k]))) throw new Error(`calibration.player_record.${k} must be numeric`);

  const truth=read('MODEL_SOURCE_OF_TRUTH.json',base);
  const beforeCount=Number(truth.active_player_model),beforeShards=Number(truth.runtime_player_shards);
  const shards=[]; let players=[];
  for(let i=0;i<beforeShards;i++){const s=read(`players${i}.json`,base);shards.push(s);players.push(...s);}
  if(players.length!==beforeCount) throw new Error(`canonical count mismatch: truth=${beforeCount} loaded=${players.length}`);
  if(players.some(p=>p.n===entry.player_name)) throw new Error(`${entry.player_name} already active`);

  const desiredO=Math.max(1,Math.min(beforeCount+1,Number(cal.player_record.o)));
  const desiredTr=Math.max(1,Math.min(beforeCount+1,Number(cal.player_record.tr)));
  for(const p of players){if(Number(p.o)>=desiredO)p.o=Number(p.o)+1;if(Number(p.tr)>=desiredTr)p.tr=Number(p.tr)+1;}
  const candidate={...clone(cal.player_record),n:entry.player_name,p:entry.position,t:entry.team,o:desiredO,tr:desiredTr};
  players.push(candidate);
  players.sort((a,b)=>Number(a.o)-Number(b.o));

  const shardSize=Number(cal.shard_size||12);
  const afterCount=beforeCount+1,afterShards=Math.ceil(afterCount/shardSize);
  const files={};
  for(let i=0;i<afterShards;i++) files[`players${i}.json`]=players.slice(i*shardSize,(i+1)*shardSize);

  const nextTruth={...truth,active_player_model:afterCount,runtime_player_shards:afterShards,effective_date:cal.effective_date||new Date().toISOString().slice(0,10),status:`authoritative_fluid_universe_${afterCount}_players`,current_ros_rank_coverage:`${afterCount}/${afterCount} internal ROS ranks; latest admission ${entry.player_name}`};
  files['MODEL_SOURCE_OF_TRUTH.json']=nextTruth;

  const manifest=read('guardrails/universe-change-manifest.json',base);
  manifest.changes=Array.isArray(manifest.changes)?manifest.changes:[];
  manifest.changes.push({action:'ADMIT',player:entry.player_name,from_count:beforeCount,to_count:afterCount,initial_overall_rank:desiredO,initial_true_value_rank:desiredTr,reason:entry.reason||cal.reason,source:cal.source||entry.evidence?.map(x=>x.source).filter(Boolean).join('; ')||'reviewed full-universe admission'});
  manifest.purpose=`Fluid-universe admission history through ${entry.player_name} (${afterCount} active players).`;
  files['guardrails/universe-change-manifest.json']=manifest;

  const cfg=read('guardrails/guardrails-config.json',base);
  cfg.authoritative_player_count=afterCount;cfg.authoritative_player_shards=afterShards;
  files['guardrails/guardrails-config.json']=cfg;

  const pkg={version:1,candidate_id:candidateId,player_name:entry.player_name,calibration:{reviewed:true,method:cal.method||'FULL_DEVELOPMENT_SWEEP_REVIEWED_CALIBRATION',generated_at:new Date().toISOString(),source_run:cal.source_run||'full-development-sweep'},integration:{expected_before_count:beforeCount,expected_after_count:afterCount,expected_before_shards:beforeShards,expected_after_shards:afterShards,canonical_files:files}};
  write(entry.package_path,pkg,base);
  entry.status='CALIBRATED_PACKAGE_READY';
  queue.updated_at=new Date().toISOString();
  write('admissions/queue.json',queue,base);
  return {candidate_id:candidateId,before_count:beforeCount,after_count:afterCount,before_shards:beforeShards,after_shards:afterShards,package_path:entry.package_path};
}

function main(){const args=process.argv.slice(2);const id=args.find(x=>!x.startsWith('--'));if(!id)throw new Error('usage: node scripts/build-admission-package.mjs <candidate_id>');console.log(JSON.stringify(buildAdmissionPackage({candidateId:id}),null,2));}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname))main();

// branch-protection refresh: admission logic unchanged; re-run required merge-queue status on current head.
