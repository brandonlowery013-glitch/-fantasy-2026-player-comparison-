# Spread point-value repair

The spread calculation now includes the signed home point spread as a fitted input, alongside sportsbook price calibration and the existing capped residual learning. Training uses only settled earlier-week games. The point-spread coefficient is fitted with a nonnegative constraint; no spread prediction is issued if a positive, line-aware fit is unavailable. The calculation revision is `spread-line-input-v2`.

At unchanged prices and team inputs, adding points to a team increases its conditional cover probability. A price-only v1 fit is rejected instead of being used at a new spread. Completed game records and original research results remain preserved; previous win rates are not validation of this revised calculation. Moneyline, totals, and Polymarket are not changed.

The prior Polymarket research used the difference between Polymarket and sportsbook log-odds as a separately fitted feature. For spreads it required the same game and exact spread contract, using only prices available before the prediction. Polymarket was never the `1 - home_probability` operation and is not active in this selected spread model.

Recommendations delivery coalesces simultaneous requests and reuses the serialized result for at most 15 seconds. Failure clears the cache. Pages preview CPU allowance is 5000ms (previously 1000ms); Cloudflare 1102 errors were reproduced before repair. No data source, numeric result, or old estimate is substituted when delivery fails.

Checks: `node workers/betting-splits/cloudflare/test-spread-projections.mjs`, `node scripts/test-recommendation-delivery.mjs`, plus the existing moneyline, selected-model interface and input-explanation checks.
