# Current-season influence trace

This research reuses the existing recency-v1 candidate. It does not introduce or activate a new Bayesian equation. Run:

python3 research/game-context/trace-current-season-influence.py SCORES_CSV WEEK2_SCOREBOARD_JSON NEW_OUTPUT_JSON

Inputs use the nflverse games.csv schema and the existing /api/live/scoreboard?week=2 response. Exact input and code hashes are recorded in the result. The inputs themselves are not bundled; verification requires matching snapshots. Target week is explicitly Week 2 of 2026. No production feed is written; existing output files cannot be overwritten.

All 16 matchups were evaluated. A same-week injected 999-point score cannot alter any forecast. The Week 1 effect compares the same recency model with and without Week 1, including league/home-field updates; it does not isolate a causal team effect. Context such as coach identity, pace, injuries and player usage is still not numerical input.

Foundation audit: data/sources/step3b-multiyear-shrinkage-decision-2026.json explicitly rejects generic positional Bayesian shrinkage (zero folds improved both MAE and RMSE). The associated scripts forecast player season PPR, not team game scores. They cannot be relabeled or transferred as validated game-pick equations. The Bayesian framework remains eligible for properly scoped future tests.

Numerical deployment remains incomplete: no validated team-level likelihood/context parameters were found in the inspected foundation artifacts. Preserve live predictions while testing the missing component; attaching evidence does not count as applying it.
