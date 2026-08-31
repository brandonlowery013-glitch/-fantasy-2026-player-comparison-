import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const paths={
 config:'guardrails/guardrails-config.json',
 a:'data/sources/ui-step3a-feature-rule-contracts-2026.json',
 b:'guardrails/step3b-closure.json',
 c:'guardrails/step3c-shadow-recalculation-162.json',
 d:'guardrails/step3d-final-decisions.json',
 e:'guardrails/step3e-application-audit.json',
 approval:'guardrails/step3e-approved-changes-2026-08-30.json',
 patch:'current162patch-2026-08-24.json',
 market:'data/sources/market-repair-2026-08-30.json',
 f:'guardrails/step3f-daily-evidence-queue.json',
 fv:'guardrails/step3f-validation.json',
 bb:'data/sources/step3g-breakout-bust-validation-2026.json',
 hs:'data/sources/step3g-historical-situational-validation-2026.json',
 season:'data/features/season-long-player-features-2026.json',
 weekly:'data/features/weekly-sit-start-2026.json',
 games:'data/features/weekly-game-features-2026.json',
 hist:'data/features/historical-situational-indicators-2026.json',
 g:'guardrails/step3g-core-features-summary.json',
 gv:'guardrails/step3g-validation.json'
};
for(const p of Object.values(paths)) if(!fs.existsSync(p)) throw new Error(`Step 3H missing required artifact: ${p}`);
const config=read(paths.config),a=read(paths.a),b=read(paths.b),c=read(paths.c),d=read(paths.d),e=read(paths.e),approval=read(paths.approval),patch=read(paths.patch),market=read(paths.market),f=read(paths.f),fv=read(paths.fv),bb=read(paths.bb),hs=read(paths.hs),season=read(paths.season),weekly=read(paths.weekly),games=read(paths.games),hist=read(paths.hist),g=read(paths.g),gv=read(paths.gv);
const expected=Number(config.authoritative_player_count);
if(!Number.isInteger(expected)||expected<=0) throw new Error(`Invalid authoritative player count: ${config.authoritative_player_count}`);
const checks=[];const add=(name,ok,details)=>checks.push({name,status:ok?'PASS':'FAIL',details});
const rankPermutation=(values,count)=>values.length===count&&values.every((x,i)=>x===i+1);

add('authoritative_universe_config',expected===166,`authoritative=${expected}`);
add('3A_locked_six_features',a.status==='LOCKED_FOR_IMPLEMENTATION'&&Array.isArray(a.scope)&&a.scope.length===6,`${a.status}; scope=${a.scope?.length}`);
add('3B_substantive_closure_pass',b.result==='PASS'&&b.failed_count===0,`${b.result}; failed=${b.failed_count}`);

add('3C_current_shadow_contract',c.step==='STEP_3C_FULL_SHADOW_RECALCULATION'&&c.status==='SHADOW_ONLY_AWAITING_STEP3D_REVIEW',`${c.step}; ${c.status}`);
add('3C_full_authoritative_universe',c.universe_count===expected&&c.authoritative_player_count===expected&&Array.isArray(c.rows)&&c.rows.length===expected&&new Set(c.rows.map(x=>x.player)).size===expected,`universe=${c.universe_count}; authoritative=${c.authoritative_player_count}; rows=${c.rows?.length}`);
add('3C_zero_live_movement',c.live_change_authority===0,'3C shadow has zero live-change authority');
add('3C_market_separation',c.sportsbook_or_adp_used===false,'sportsbook/adp false');
add('3C_shadow_rows_complete',c.rows.every(x=>Number.isFinite(Number(x.shadow_q10))&&Number.isFinite(Number(x.shadow_q50))&&Number.isFinite(Number(x.shadow_q90))),'all authoritative rows contain finite shadow distributions');
add('3C_extreme_review_consistent',Number.isFinite(Number(c.extreme_disagreement_threshold_ppg))&&c.extreme_review_count===c.rows.filter(x=>x.extreme_review_required===true).length,`threshold=${c.extreme_disagreement_threshold_ppg}; declared=${c.extreme_review_count}`);

add('3D_historical_review_complete',d.status==='COMPLETE',`${d.status}; original review outcome preserved as history`);
add('3D_market_separation',d.sportsbook_or_adp_used===false,'sportsbook/adp false');

add('3E_aug30_approval_ledger',approval.supersedes_prior_noop===true&&approval.review_queue===5&&approval.direct_changes===2&&approval.connected_changes_count===1&&approval.holds===3,'five historical cases; 2 direct; 1 connected; 3 holds; prior no-op superseded');
add('3E_approved_state_retained',e.status==='COMPLETE_APPROVED_CHANGES_RETAINED_IN_CURRENT_UNIVERSE'&&e.authoritative_player_count===expected&&e.direct_changes===2&&e.connected_changes===1&&e.holds===3&&e.prior_noop_superseded===true,`${e.status}; authoritative=${e.authoritative_player_count}; direct=${e.direct_changes}; connected=${e.connected_changes}; holds=${e.holds}`);
add('3E_live_application_present',e.live_player_overlay_modified===true&&e.adjudicated_players_present===true,'approved Step 3E adjudications remain represented in the current live overlay');
add('3E_market_independence',e.market_independence===true&&approval.market_independence?.includes('ADP/ECR did not create'),'Step 3E football changes are market-independent');
add('3E_rank_integrity_declared',e.contiguous_overall_ranks===true&&e.contiguous_true_value_ranks===true,'Step 3E audit declares contiguous Overall and True Value ranks');
add('3E_runtime_overlay_authoritative',Object.keys(patch.players||{}).length===expected,`${patch.updated}; players=${Object.keys(patch.players||{}).length}; authoritative=${expected}`);
const overall=Object.values(patch.players||{}).map(x=>Number(x.o)).sort((x,y)=>x-y),trueValue=Object.values(patch.players||{}).map(x=>Number(x.tr)).sort((x,y)=>x-y);
add('3E_rank_integrity_authoritative',rankPermutation(overall,expected)&&rankPermutation(trueValue,expected),`Overall and True Value each form exact 1..${expected} permutations`);
add('historical_market_repair_no_football_authority',market.football_projection_authority===0&&market.intrinsic_rank_mutations_from_market===0&&Object.keys(market.players||{}).length===9,`historical repair coverage=${market.coverage_after_repair}; nine repaired price records; zero football authority`);

add('3F_validation_pass',fv.result==='PASS'&&fv.failed_count===0&&fv.authoritative_player_count===expected,`${fv.result}; failed=${fv.failed_count}; authoritative=${fv.authoritative_player_count}`);
add('3F_full_authoritative_universe',f.players_checked===expected,`players=${f.players_checked}; authoritative=${expected}`);
add('3F_no_market',f.sportsbook_or_adp_used===false&&f.market_inputs_used===false,'market excluded');
add('3F_review_before_apply',f.automatic_live_write===false&&f.approval_required===true,'proposal/review only; cannot create a new live change without approval');
add('3F_zero_new_live_movement',f.live_projection_movement===0&&f.live_rank_movement===0,'3F adds no movement beyond the separately approved Step 3E overlay');

add('3G_empirical_validator_pass',gv.result==='PASS'&&gv.failed_count===0&&gv.authoritative_player_count===expected,`${gv.result}; failed=${gv.failed_count}; authoritative=${gv.authoritative_player_count}`);
add('3G_breakout_bust_resolved',bb.status==='EMPIRICAL_DECISION_COMPLETE'&&bb.results.every(x=>['PROMOTED_VALIDATED','NO_PROMOTION_EMPIRICALLY_REJECTED'].includes(x.promotion_decision)),`breakout=${bb.breakout_decision}; bust=${bb.bust_decision}`);
add('3G_no_market_in_cohorts',bb.sportsbook_or_adp_used===false,'sportsbook/adp false');
add('3G_all_nine_situations_resolved',hs.status==='EMPIRICAL_AND_SOURCE_DECISIONS_COMPLETE'&&hs.all_indicators.length===9&&hs.all_indicators.every(x=>['PROMOTED_VALIDATED','NO_PROMOTION_EMPIRICALLY_REJECTED','NO_PROMOTION_SOURCE_UNAVAILABLE'].includes(x.decision)),`tested=${hs.tested_indicators.length}; blocked=${hs.source_blocked_indicators.length}; promoted=${hs.promoted_indicators.length}`);
add('3G_source_blocked_zero_weight',hs.source_blocked_indicators.every(x=>x.projection_weight===0&&x.model_promotion_eligible===false),'all source-blocked indicators zero weight');
add('3G_full_authoritative_season_universe',season.players_checked===expected&&season.players.length===expected&&new Set(season.players.map(x=>x.player)).size===expected,`${expected} unique season rows`);
add('3G_classification_only',season.live_projection_movement===0&&season.live_rank_movement===0&&season.players.every(x=>x.live_projection_movement===0&&x.live_rank_movement===0),'3G adds no live projection/rank authority');
add('3G_market_separation',season.sportsbook_inputs_used===false&&season.adp_used_in_football_labels===false,'football labels market-independent');
add('3G_football_value_zero_authority',season.players.every(x=>x.football_value.lambda===null&&x.football_value.rho===null&&x.football_value.gamma===null&&x.football_value.score===null&&x.football_value.numeric_authority===0),'lambda/rho/gamma null and zero-authority');
add('3G_weekly_universe_authoritative',weekly.players.length===expected&&new Set(weekly.players.map(x=>x.player)).size===expected,`weekly rows=${weekly.players.length}; authoritative=${expected}`);
add('3G_weekly_fail_safe',weekly.status!=='AWAITING_WEEKLY_PREREQUISITES'||weekly.players.every(x=>x.label==='NO_CALL'),'missing weekly prerequisites => NO_CALL');
const gameAwaiting=String(games.status).startsWith('AWAITING_');
const gameSummarySafe=g.features?.games_of_the_week?.featured===0&&g.features?.trap_games?.alerts===0&&g.features?.trap_games?.watches===0;
add('3G_game_fail_safe',!gameAwaiting||gameSummarySafe,gameAwaiting?`awaiting prerequisites with featured=${g.features?.games_of_the_week?.featured}, alerts=${g.features?.trap_games?.alerts}, watches=${g.features?.trap_games?.watches}`:'game prerequisites present');
add('3G_historical_output_9',hist.indicators.length===9,'nine historical indicators represented');
add('3G_summary_authoritative',g.authoritative_player_count===expected,`summary authoritative=${g.authoritative_player_count}`);
add('3G_summary_zero_new_live_movement',g.live_projection_movement===0&&g.live_rank_movement===0,'3G summary adds zero movement beyond explicit Step 3E application');
add('weekly_state_named_not_fabricated',weekly.status==='AWAITING_WEEKLY_PREREQUISITES'||weekly.status==='INPUTS_PRESENT',weekly.status);

const failed=checks.filter(x=>x.status==='FAIL');
const report={generated_at:new Date().toISOString(),step:'STEP_3H_FULL_STEP3_QA',result:failed.length?'FAIL':'PASS',failed_count:failed.length,authoritative_player_count:expected,checks,approved_step3e_projection_changes:['Kaytron Allen','Chuba Hubbard','Jonathon Brooks'],unauthorized_live_movement_allowed:0,step3_completion:failed.length?'NOT_COMPLETE':'COMPLETE_REAUDITED_AFTER_APPROVED_STEP3E',next_step:failed.length?null:'REVALIDATE_DOWNSTREAM_STEP4_THROUGH_STEP6_5'};
fs.mkdirSync('guardrails',{recursive:true});fs.writeFileSync('guardrails/step3h-full-step3-qa.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(failed.length)process.exit(1);
