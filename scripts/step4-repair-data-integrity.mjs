import fs from 'node:fs';

const historyPath='historicalStats2026.json';
const rookiePath='data/sources/rookie-no-history-inputs-2026.json';
const statusPath='data/sources/step3b-history-integrity-status-2026.json';
const history=JSON.parse(fs.readFileSync(historyPath,'utf8'));
const rookies=JSON.parse(fs.readFileSync(rookiePath,'utf8'));
const status=JSON.parse(fs.readFileSync(statusPath,'utf8'));
const names=(rookies.players||[]).map(p=>p.player);
if(rookies.season!==2026||names.length!==10) throw new Error('Locked 2026 rookie/no-history universe mismatch');
const contaminatedBefore=names.filter(name=>(history.players?.[name]||[]).length>0);
for(const name of names) delete history.players[name];
const contaminatedAfter=names.filter(name=>(history.players?.[name]||[]).length>0);
if(contaminatedAfter.length) throw new Error(`Persistent rookie history remains: ${contaminatedAfter.join(', ')}`);
const priorRemoved=history.integrity?.removed_player_keys||status.step4_repair?.removed_players||status.contamination_finding?.players||[];
const removed=[...new Set([...priorRemoved,...contaminatedBefore])];
const repairedAt=history.integrity?.repaired_at||new Date().toISOString();
history.integrity={
  ...(history.integrity||{}),
  step4_repaired:true,
  repaired_at:repairedAt,
  repair_rule:'Locked 2026 rookie/no-history players must not have direct NFL regular-season history in this file.',
  removed_player_keys:removed,
  locked_no_history_players:names
};
const historicalInvalidCount=Math.max(Number(status.contamination_finding?.previously_invalid_player_count||0),Number(status.contamination_finding?.invalid_player_count||0),removed.length);
status.version='STEP4_HISTORY_INTEGRITY_STATUS_2.0.0';
status.status='PERSISTENT_HISTORY_SOURCE_REPAIRED';
status.contamination_finding={
  ...status.contamination_finding,
  result:'REPAIRED_AT_PERSISTENT_SOURCE',
  previously_invalid_player_count:historicalInvalidCount,
  previously_invalid_rows_count:historicalInvalidCount,
  remaining_invalid_player_count:0,
  remaining_invalid_rows_count:0,
  live_history_file_mutated_by_step4:true,
  shadow_quarantine_required:false,
  repair_commit_required:false
};
status.promotion_allowed=false;
status.step4_repair={
  persistent_source:'historicalStats2026.json',
  repaired:true,
  repaired_at:repairedAt,
  removed_players:removed,
  all_10_locked_no_history_players_absent_from_direct_history:true,
  missing_history_remains_unknown_not_zero:true,
  sportsbook_or_adp_used:false
};
fs.writeFileSync(historyPath,JSON.stringify(history,null,2)+'\n');
fs.writeFileSync(statusPath,JSON.stringify(status,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',newly_contaminated:contaminatedBefore,removed_players:removed,remaining:contaminatedAfter},null,2));
