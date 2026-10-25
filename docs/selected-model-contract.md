# Selected live model contract

Spread stays on sportsbook-calibration-learning-v1, line-aware calculation spread-line-input-v2. Calibration may use sportsbook-price logit and the signed home spread only. Moneyline stays on football-sportsbook-learning-v1, using sportsbook-price logit, football-versus-market logit, both projected scores, score variability and the recorded score correlation where independently estimable.

Both retain the original postgame-logit-residual-ridge-v2 learning factors and 0.02 probability cap. Numeric weights may be refitted from earlier settled weeks; model families, allowed inputs, regularization choices and betting thresholds do not change automatically. Research context and Polymarket coefficients are rejected. A mismatched, stale or failed model is unavailable/WAIT, not replaced with a different forecast.

selected-model-policy.mjs is enforced in predictors and delivery overlays. Betting edge 0.03, EV 0.02 and minimum conditional win chance 0.52 are checked. Browser/server library parity and fixed calibration regression are required by test-selected-model-policy.mjs. Research scripts live outside the deployed app and are not imported by live predictors.

The recommendations response omits unused behavior_learning_context archives after reading the producer feed; selected evaluations, drivers, evidence, team/player information and probabilities are retained. Different producer-ref requests serialize large builds, preventing concurrent construction of duplicate multi-megabyte responses. Failures are not cached.
