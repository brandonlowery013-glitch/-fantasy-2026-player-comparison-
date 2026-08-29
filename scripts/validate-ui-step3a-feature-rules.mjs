import fs from 'node:fs';

const rules=JSON.parse(fs.readFileSync('data/sources/ui-step3a-feature-rule-contracts-2026.json','utf8'));
const game=JSON.parse(fs.readFileSync('data/sources/game-market-recommendation-layer-2026.json','utf8'));
const need=(ok,msg)=>{if(!ok)throw new Error(msg)};

need(rules.status==='LOCKED_FOR_IMPLEMENTATION','Step 3A rules must be locked for implementation');
for(const key of ['sit_start','sleepers','trap_games','games_of_the_week','historical_situational_indicators']) need(rules[key],`Missing Step 3A contract: ${key}`);

const g=rules.games_of_the_week;
need(g.eligibility.must_already_be_valid_pick===true,'Games of the Week must be a subset of valid PICKS');
need(g.thresholds.LEAN_VALUE.minimum_probability_edge===game.recommendation_policy.minimum_probability_edge,'LEAN_VALUE probability threshold must inherit the existing game PICK minimum');
need(g.thresholds.LEAN_VALUE.minimum_expected_value===game.recommendation_policy.minimum_expected_value,'LEAN_VALUE EV threshold must inherit the existing game PICK minimum');
need(g.thresholds.STRONG_VALUE.minimum_probability_edge===game.recommendation_policy.confidence.MODERATE.minimum_probability_edge,'STRONG_VALUE probability threshold must match MODERATE game confidence');
need(g.thresholds.STRONG_VALUE.minimum_expected_value===game.recommendation_policy.confidence.MODERATE.minimum_expected_value,'STRONG_VALUE EV threshold must match MODERATE game confidence');
need(g.thresholds.GAME_OF_THE_WEEK.minimum_probability_edge===game.recommendation_policy.confidence.HIGH.minimum_probability_edge,'GAME_OF_THE_WEEK probability threshold must match HIGH game confidence');
need(g.thresholds.GAME_OF_THE_WEEK.minimum_expected_value===game.recommendation_policy.confidence.HIGH.minimum_expected_value,'GAME_OF_THE_WEEK EV threshold must match HIGH game confidence');
need(g.eligibility.minimum_model_conditional_win_probability===game.recommendation_policy.minimum_model_conditional_win_probability,'Games of the Week must keep the existing conditional win probability floor');

const trap=rules.trap_games;
need(trap.minimum_independent_supporting_signals_for_alert>=2,'Trap alert must require at least two independent supporting signals');
need(trap.material_disagreement.favorite_no_vig_probability_over_model_min>=0.05,'Trap alert material disagreement cannot be weaker than 5 percentage points');
need(trap.locked_rules.some(x=>/not an automatic bet/i.test(x)),'Trap contract must forbid automatic opponent bets');
need(trap.locked_rules.some(x=>/double-count/i.test(x)),'Trap contract must forbid double-counting correlated signals');

const hist=rules.historical_situational_indicators;
need(hist.sample_policy.minimum_raw_games_to_display_context>=30,'Historical context display sample floor too small');
need(hist.sample_policy.minimum_raw_games_for_model_candidate>=100,'Historical model candidate raw sample floor too small');
need(hist.sample_policy.minimum_effective_games_for_model_candidate>=75,'Historical model candidate effective sample floor too small');
need(hist.sample_policy.minimum_distinct_seasons>=3,'Historical model candidate must span at least three seasons');
need(hist.promotion_policy.out_of_sample_validation_required===true,'Historical model promotion requires out-of-sample validation');
need(hist.promotion_policy.directional_replication_required===true,'Historical model promotion requires replication');
need(hist.promotion_policy.shrinkage_required===true,'Historical model promotion requires shrinkage');
need(hist.promotion_policy.single_indicator_max_margin_adjustment_points<=0.75,'Single historical indicator adjustment cap is too large');
need(hist.promotion_policy.combined_situational_max_margin_adjustment_points<=1.5,'Combined situational adjustment cap is too large');
need(/zero projection weight/i.test(hist.display_policy),'Unpromoted historical indicators must receive zero projection weight');

const ss=rules.sit_start;
need(ss.labels.includes('NO_CALL'),'Sit/Start requires NO_CALL state');
need(ss.gates.no_call_if_prerequisite_failed===true,'Sit/Start must block calls when prerequisites fail');
need(ss.anti_rules.some(x=>/draft rank alone/i.test(x)),'Sit/Start cannot be driven by season-long draft rank alone');

const sl=rules.sleepers;
need(sl.labels.includes('NO_CALL'),'Sleepers require NO_CALL state');
need(sl.eligibility.must_be_outside_clear_starter_tier===true,'Sleeper must be outside the clear starter tier');
need(sl.eligibility.must_have_actionable_ceiling===true,'Sleeper requires actionable ceiling');
need(sl.eligibility.must_have_role_or_environment_path===true,'Sleeper requires a role or environment path');

console.log('UI Step 3A feature-rule QA PASS');
