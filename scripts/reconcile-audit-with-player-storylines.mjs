import fs from 'node:fs';
const R=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const audit=R('analysis/full-universe-accumulated-context-audit-current.json');
const story=R('analysis/player-storyline-state-current.json');
if((audit.rows||[]).length!==166||(story.rows||[]).length!==166)throw new Error('coverage');
const byStory=new Map(story.rows.map(x=>[x.player,x]));
const hardDeviation=/\b(injur|ankle|knee|hamstring|shoulder|foot|acl|pup|injured reserve|\bir\b|questionable|doubtful|out\b|surgery|target share|first[- ]read|routes?|snaps?|touches?|carries|goal[- ]line|red[- ]zone|starter|starting role|workload|committee|featured|lead back|chemistry|connection|timing)\b/i;
const key=x=>`${x.headline||''}|${x.source_url||''}`;
let downgraded=0;
for(const row of audit.rows){
  const s=byStory.get(row.player);if(!s)throw new Error(`missing storyline ${row.player}`);
  const relevant=new Set((s.recent_story_beats||[]).map(key));
  const beats=row.accumulated_context?.material_beats||[];
  const matched=beats.filter(b=>relevant.has(key(b))||hardDeviation.test(b.headline||''));
  row.player_storyline={storyline_type:s.storyline_type,starting_storyline:s.starting_storyline,primary_risk:s.primary_risk,connected_players:s.connected_players,watch_for:s.watch_for,move_up_if:s.move_up_if,move_down_if:s.move_down_if,model_components_to_reconsider:s.model_components_to_reconsider,matched_story_beats:matched.length};
  if(row.disposition==='REVIEW_RECALIBRATION'&&matched.length===0){
    row.disposition='CONTEXT_CONFIRMATION_ONLY';row.priority='LOW';row.audit_reason='evidence did not answer this player’s active scouting storyline or represent a material health/role deviation';downgraded++;
  } else if(row.disposition==='REVIEW_RECALIBRATION'){
    row.audit_reason=`player-specific storyline matched ${matched.length} material beat(s); compare the saved thesis with current evidence before any numeric change`;
  }
}
const priorityOrder={HIGH:0,MEDIUM:1,LOW:2,NONE:3};
audit.candidates=audit.rows.filter(r=>r.disposition==='REVIEW_RECALIBRATION').sort((a,b)=>(priorityOrder[a.priority]??9)-(priorityOrder[b.priority]??9)||a.overall_rank-b.overall_rank);
audit.candidate_count=audit.candidates.length;
audit.confirmation_only_count=audit.rows.filter(r=>r.disposition==='CONTEXT_CONFIRMATION_ONLY').length;
audit.no_signal_count=audit.rows.filter(r=>r.disposition==='NO_MATERIAL_RECALIBRATION_SIGNAL').length;
audit.storyline_reconciliation={applied:true,downgraded_candidates:downgraded,policy:'A candidate must map to the player’s persistent scouting storyline/watch items or represent a material health/role deviation. This layer identifies which model components to reconsider; it does not auto-apply score or rank changes.'};
audit.policy='Read-only full-universe audit with persistent player storyline context. Evidence must be player-bound, substantive, and relevant to the saved scouting thesis/watch items before recalibration review. No automatic numeric or rank changes.';
fs.writeFileSync('analysis/full-universe-accumulated-context-audit-current.json',JSON.stringify(audit,null,2)+'\n');
const md=['# Full 166-player accumulated-context audit — storyline reconciled','',`Players: 166`,`Fresh recalibration candidates: ${audit.candidate_count}`,`Context/confirmation only: ${audit.confirmation_only_count}`,`No accepted material signal: ${audit.no_signal_count}`,`Candidates downgraded because they did not match the player storyline: ${downgraded}`,'','## Recalibration candidates','', '| Player | Pos | OVR | TV | Priority | Storyline type | Matched beats | Watch |','|---|---:|---:|---:|---|---|---:|---|',...audit.candidates.map(r=>`| ${r.player} | ${r.position} | ${r.overall_rank} | ${r.true_value_rank} | ${r.priority} | ${r.player_storyline.storyline_type} | ${r.player_storyline.matched_story_beats} | ${r.player_storyline.watch_for.join('; ').replaceAll('|','/')} |`)];
fs.writeFileSync('analysis/full-universe-accumulated-context-audit-current.md',md.join('\n')+'\n');
console.log(JSON.stringify({result:'PASS',players:166,candidates:audit.candidate_count,downgraded},null,2));
