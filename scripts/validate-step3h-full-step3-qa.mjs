import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const required=[
 'data/sources/ui-step3a-feature-rule-contracts-2026.json',
 'guardrails/step3c-full-162-shadow.json',
 'guardrails/step3d-user-review-final.json',
 'guardrails/step3e-application-audit.json',
 'guardrails/step3f-daily-evidence-queue.json',
 'guardrails/step3f-validation.json',
 'data/sources/step3g-breakout-bust-validation-2026.json',
 'data/sources/step3g-historical-situational-validation-2026.json',
 'data/features/season-long-player-features-2026.json',
 'data/features/weekly-sit-start-2026.json',
 'data/features/weekly-game-features-2026.json',
 'data/features/historical-situational-indicators-2026.json',
 'guardrails/step3g-core-features-summary.json',
 'guardrails/step3g-validation.json'
];
for(const p of required) if(!fs.existsSync(p)) throw new Error(`Step 3H missing required artifact: ${p}`);
const a=read(required[0]),c=read(required[1]),d=read(required[2]),e=read(required[3]),f=read(required[4]),fv=read(required[5]),bb=read(required[6]),hs=read(required[7]),season=read(required[8]),weekly=read(required[9]),games=read(required[10]),hist=read(required[11]),g=read(required[12]),gv=read(required[13]);
const checks=[];const add=(name,ok,details)=>checks.push({name,status:ok?'PASS':'FAIL',details});
add('3A_locked_six_features',a.status==='LOCKED_FOR_IMPLEMENTATION'&&Array.isArray(a.scope)&&a.scope.length===6,`${a.status}; scope=${a.scope?.length}`);
add('3C_complete_162',c.players_checked===162&&c.status==='COMPLETE_AWAITING_STEP_3D_USER_REVIEW',`${c.status}; players=${c.players_checked}`);
add('3C_zero_live_movement',c.live_projection_movement===0&&c.live_rank_movement===0,'projection/rank movement zero');
add('3C_market_separation',c.sportsbook_or_adp_used===false&&c.market_inputs_used===false,'sportsbook/adp/market false');
add('3C_rookie_sanitization',Array.isArray(c.rookie_no_history_players)&&c.rookie_no_history_players.length===10&&Array.isArray(c.persistent_contamination_players)&&c.persistent_contamination_players.length===7,'10 sanitized rookies; 7 persistent source rows excluded');
add('3D_complete',d.status==='COMPLETE',d.status);
add('3D_no_approved_changes',d.approved===0,`approved=${d.approved}`);
add('3E_audited_noop',e.status==='COMPLETE_NO_APPROVED_CHANGES'&&e.approved_changes===0&&e.applied_changes===0,`${e.status}; approved=${e.approved_changes}; applied=${e.applied_changes}`);
add('3E_zero_live_movement',e.live_projection_movement===0&&e.live_rank_movement===0,'zero live movement');
add('3F_validation_pass',fv.result==='PASS'&&fv.failed_count===0,`${fv.result}; failed=${fv.failed_count}`);
add('3F_full_162',f.players_checked===162,`players=${f.players_checked}`);
add('3F_no_market',f.sportsbook_or_adp_used===false&&f.market_inputs_used===false,'market excluded');
add('3F_review_before_apply',f.automatic_live_write===false&&f.approval_required===true,'proposal/review only');
add('3F_zero_live_movement',f.live_projection_movement===0&&f.live_rank_movement===0,'zero live movement');
add('3G_empirical_validator_pass',gv.result==='PASS'&&gv.failed_count===0,`${gv.result}; failed=${gv.failed_count}`);
add('3G_breakout_bust_resolved',bb.status==='EMPIRICAL_DECISION_COMPLETE'&&bb.results.every(x=>['PROMOTED_VALIDATED','NO_PROMOTION_EMPIRICALLY_REJECTED'].includes(x.promotion_decision)),`breakout=${bb.breakout_decision}; bust=${bb.bust_decision}`);
add('3G_no_market_in_cohorts',bb.sportsbook_or_adp_used===false,'sportsbook/adp false');
add('3G_all_nine_situations_resolved',hs.status==='EMPIRICAL_AND_SOURCE_DECISIONS_COMPLETE'&&hs.all_indicators.length===9&&hs.all_indicators.every(x=>['PROMOTED_VALIDATED','NO_PROMOTION_EMPIRICALLY_REJECTED','NO_PROMOTION_SOURCE_UNAVAILABLE'].includes(x.decision)),`tested=${hs.tested_indicators.length}; blocked=${hs.source_blocked_indicators.length}; promoted=${hs.promoted_indicators.length}`);
add('3G_source_blocked_zero_weight',hs.source_blocked_indicators.every(x=>x.projection_weight===0&&x.model_promotion_eligible===false),'all source-blocked indicators zero weight');
add('3G_season_universe_162',season.players_checked===162&&season.players.length===162&&new Set(season.players.map(x=>x.player)).size===162,'162 unique season rows');
add('3G_classification_only',season.live_projection_movement===0&&season.live_rank_movement===0&&season.players.every(x=>x.live_projection_movement===0&&x.live_rank_movement===0),'all 3G classifications zero live authority');
add('3G_market_separation',season.sportsbook_inputs_used===false&&season.adp_used_in_football_labels===false,'football labels market-independent');
add('3G_football_value_zero_authority',season.players.every(x=>x.football_value.lambda===null&&x.football_value.rho===null&&x.football_value.gamma===null&&x.football_value.score===null&&x.football_value.numeric_authority===0),'lambda/rho/gamma unresolved by design and zero-authority');
add('3G_weekly_fail_safe',weekly.status!=='AWAITING_WEEKLY_PREREQUISITES'||weekly.players.every(x=>x.label==='NO_CALL'),'missing weekly prerequisites => NO_CALL');
add('3G_game_fail_safe',!String(games.status).startsWith('AWAITING_')||games.games.length===0,'missing game prerequisites => no fabricated calls');
add('3G_historical_output_9',hist.indicators.length===9,'nine historical indicators represented');
add('3G_summary_zero_live_movement',g.live_projection_movement===0&&g.live_rank_movement===0,'summary zero live movement');
add('Step4_named_rookie_repair_gate',e.persistent_history_repair_performed===false&&String(e.persistent_history_repair_note||'').includes('Data Integrity'),'persistent source repair explicitly remains Data Integrity gate');
add('weekly_state_named_not_fabricated',weekly.status==='AWAITING_WEEKLY_PREREQUISITES'||weekly.status==='INPUTS_PRESENT',weekly.status);
const blocked=checks.filter(x=>x.status==='FAIL');const report={generated_at:new Date().toISOString(),step:'STEP_3H_FULL_STEP3_QA',result:blocked.length?'FAIL':'PASS',failed_count:blocked.length,checks,step3_completion:blocked.length?'NOT_COMPLETE':'COMPLETE_READY_FOR_STEP_4_DATA_INTEGRITY',next_step:blocked.length?null:'STEP_4_DATA_INTEGRITY'};
fs.mkdirSync('guardrails',{recursive:true});fs.writeFileSync('guardrails/step3h-full-step3-qa.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(blocked.length)process.exit(1);
