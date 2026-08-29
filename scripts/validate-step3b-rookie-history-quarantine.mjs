import fs from 'node:fs';
const audit=JSON.parse(fs.readFileSync('guardrails/step3b-rookie-history-contamination-audit.json','utf8'));
const shadow=JSON.parse(fs.readFileSync('guardrails/step3b-shadow-projection-context-162.json','utf8'));
const rookies=JSON.parse(fs.readFileSync('data/sources/rookie-no-history-inputs-2026.json','utf8'));
const expected=(rookies.players||[]).map(p=>p.player).sort();
const actual=[...(shadow.no_direct_history_players||[])].sort();
const need=(ok,msg)=>{if(!ok)throw new Error(msg)};
need(audit.live_history_file_modified===false,'Live historicalStats2026.json must not be modified');
need(audit.locked_rookie_no_history_count===10,'Locked rookie/no-history set must remain 10');
need(audit.sanitized_rookie_history_count===0,'Sanitized shadow history still contains rookie NFL history');
need(shadow.players_checked===162,'Shadow recalculation must cover 162 players');
need(shadow.players_without_direct_history===10,`Expected 10 no-direct-history players after quarantine; found ${shadow.players_without_direct_history}`);
need(JSON.stringify(actual)===JSON.stringify(expected),`No-history set mismatch after quarantine. expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
for(const row of shadow.changes||[]){if(expected.includes(row.name))need(row.direct_history_seasons===0&&row.history_status==='NO_DIRECT_HISTORY_REQUIRES_ROOKIE_OR_COHORT_PRIOR',`${row.name} still treated as direct-history player`)}
console.log(`Step 3B rookie history quarantine PASS — ${audit.contaminated_player_count} contaminated rookie records quarantined; all 10 rookies restored to no-history status in 162 shadow recalculation`);
