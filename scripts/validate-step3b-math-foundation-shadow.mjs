import fs from 'node:fs';

const c=JSON.parse(fs.readFileSync('data/sources/step3b-math-foundation-shadow-2026.json','utf8'));
const need=(ok,msg)=>{if(!ok)throw new Error(msg)};

need(c.status==='SHADOW_ONLY_VALIDATION_REQUIRED','3B must remain shadow-only until validation');
need(c.governing_framework.family==='bayesian_predictive_updating','3B governing family must be Bayesian predictive updating');
need(c.governing_framework.distribution_first===true,'3B must be distribution-first');
need(c.separation_rules.sportsbook_inputs_forbidden_from_football_prior_or_posterior===true,'Sportsbook data cannot enter football prior/posterior');
need(c.separation_rules.adp_forbidden_from_football_prior_or_posterior===true,'ADP cannot enter football prior/posterior');
need(c.separation_rules.shadow_layer_may_not_write_live_rankings===true,'Shadow math cannot write live rankings');
need(c.separation_rules.shadow_layer_may_not_write_live_projections===true,'Shadow math cannot write live projections');
need(c.separation_rules.shadow_layer_may_not_write_live_recommendations===true,'Shadow math cannot write live recommendations');
need(c.separation_rules.manual_review_required_before_any_future_promotion===true,'Manual review gate required');

for(const d of ['recency','head_coach_continuity','coordinator_and_scheme_continuity','quarterback_continuity','team_continuity','role_similarity','sample_size_and_effective_sample_size']){
  need(c.historical_relevance_layer.dimensions.includes(d),`Missing historical relevance dimension: ${d}`);
}
need(c.historical_relevance_layer.rules.some(x=>/No fixed relevance weights/i.test(x)),'Historical relevance weights must remain unset before validation');
need(c.situational_history.default_if_not_validated==='DISPLAY_CONTEXT_ONLY_ZERO_PROJECTION_WEIGHT','Unvalidated situational history must carry zero projection weight');
need(c.football_value_shadow.weights_status==='UNSET_PENDING_BACKTEST','Football-value weights cannot be guessed before backtest');
need(c.extreme_disagreement_policy.action==='REVIEW_REQUIRED','Extreme disagreements must require review');
need(/NOT_GUESSED/.test(c.extreme_disagreement_policy.numeric_thresholds_status),'Disagreement thresholds must be empirically selected');
need(c.initial_influence_policy.live_weight===0,'Initial live math weight must be zero');
need(c.initial_influence_policy.live_rank_movement===0,'Initial live rank movement must be zero');
need(c.initial_influence_policy.live_projection_movement===0,'Initial live projection movement must be zero');
need(c.validation_plan.historical_backtest_targets.includes('projection_mae'),'MAE backtest required');
need(c.validation_plan.historical_backtest_targets.includes('probability_calibration'),'Probability calibration backtest required');
need(c.validation_plan.promotion_requirements.some(x=>/out of sample/i.test(x)),'Out-of-sample signal required for promotion');
need(c.downstream_betting_branch.kelly_status==='downstream_bankroll_tool_not_football_foundation','Kelly must remain downstream, not the football foundation');

console.log('Step 3B shadow math foundation contract PASS');
