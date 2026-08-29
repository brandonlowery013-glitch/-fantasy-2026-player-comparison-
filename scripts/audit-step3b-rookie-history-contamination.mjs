import fs from 'node:fs';

const historyPath='historicalStats2026.json';
const rookiePath='data/sources/rookie-no-history-inputs-2026.json';
const history=JSON.parse(fs.readFileSync(historyPath,'utf8'));
const rookies=JSON.parse(fs.readFileSync(rookiePath,'utf8'));
const rookieNames=(rookies.players||[]).map(p=>p.player);
if(rookies.season!==2026)throw new Error(`Expected 2026 rookie source; found ${rookies.season}`);
if(rookieNames.length!==10)throw new Error(`Expected locked 10-player rookie/no-history source; found ${rookieNames.length}`);

const contaminated=[];
for(const name of rookieNames){
  const rows=history.players?.[name]||[];
  if(rows.length){
    contaminated.push({
      player:name,
      row_count:rows.length,
      seasons:rows.map(r=>Number(r.Season??r.Year)).filter(Number.isFinite),
      rows
    });
  }
}

const sanitized=JSON.parse(JSON.stringify(history));
for(const name of rookieNames)delete sanitized.players[name];
const residual=rookieNames.filter(name=>(sanitized.players?.[name]||[]).length>0);
if(residual.length)throw new Error(`Rookie history quarantine failed for: ${residual.join(', ')}`);

fs.mkdirSync('guardrails',{recursive:true});
fs.writeFileSync('guardrails/step3b-sanitized-historicalStats2026.json',JSON.stringify({
  ...sanitized,
  step3b_shadow_metadata:{
    generated_at:new Date().toISOString(),
    shadow_only:true,
    source_file:historyPath,
    quarantine_reason:'2026 rookies cannot have NFL regular-season history before the 2026 NFL Draft; any such rows are invalid for player-history modeling.',
    quarantined_players:rookieNames,
    original_file_modified:false
  }
},null,2)+'\n');

const report={
  generated_at:new Date().toISOString(),
  step:'STEP_3B_ROOKIE_HISTORY_CONTAMINATION_QUARANTINE',
  status:contaminated.length?'CONTAMINATION_FOUND_AND_QUARANTINED_IN_SHADOW':'NO_CONTAMINATION_FOUND',
  live_history_file_modified:false,
  locked_rookie_no_history_count:rookieNames.length,
  locked_rookie_no_history_players:rookieNames,
  contaminated_player_count:contaminated.length,
  contaminated_players:contaminated.map(x=>({player:x.player,row_count:x.row_count,seasons:x.seasons})),
  invalid_rows:contaminated,
  sanitized_shadow_path:'guardrails/step3b-sanitized-historicalStats2026.json',
  sanitized_rookie_history_count:rookieNames.filter(name=>(sanitized.players?.[name]||[]).length>0).length,
  safeguards:[
    'The repository historicalStats2026.json file is not mutated by this quarantine step.',
    'All locked 2026 rookie/no-history players are removed from the shadow player-history view before recalculation.',
    'Rookie numeric priors must come from the separately validated historical rookie-cohort pipeline, not fabricated 2025 NFL rows.',
    'Sportsbook and ADP are not used.'
  ]
};
fs.writeFileSync('guardrails/step3b-rookie-history-contamination-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(report.sanitized_rookie_history_count!==0)process.exit(1);
