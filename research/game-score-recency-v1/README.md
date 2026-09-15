# Game-score recency validation v1

Research only. No production probabilities, rankings or picks are modified.

## Protocol and results

`validation-plan.json` records the fixed alternative before evaluation: a 16-game exponential half-life, eight-game shrinkage, and no parameter search. The baseline reproduces the production score-mean method using this score source, not exact archived ESPN forecasts. 2024 is development; 2025 is the held-out season. Both methods use only games in prior weeks; all games in the evaluated week are excluded. No 2026 results enter the retrospective comparison.

2025, 272 games: total MAE 10.9315 → 10.7311 points; margin MAE 10.8659 → 10.5468 points. The 95% paired week-bootstrap interval for total-MAE difference is −0.3515 to −0.0545. Team MAE and total/margin RMSE also improve. 2024 total-MAE improvement is inconclusive (interval spans zero). Resampling only 18 weeks is a limited uncertainty estimate; games/weeks are not fully independent.

This modest score-only result qualifies for prospective research, not automatic promotion. It does not establish betting profit, calibrated probabilities, or useful injury/player/pace adjustments. Availability and other context require separately validated inputs and coefficients. The source contains retrospectively finalized scores, not time-stamped ingestion snapshots.

## Reproduce

From this directory:

```sh
python3 validate-game-score-recency.py validation-scores.csv validation-results.json
```

This emits all 544 evaluation predictions and summaries. The bundled summary omits individual predictions for size. Source hashes and extraction rules are in `validation-source.json`; market columns are excluded from the score input. The validation script asserts that changing target-week and future scores cannot change an earlier prediction.

## Prospective comparison

`week-2-prospective-score-comparison.json` was captured on September 15, 2026 before all 16 Week 2 kickoffs, using the ESPN-backed schedule snapshot. It includes both methods, source/code hashes and capture time. Existing capture files cannot be overwritten; started games are rejected. This is an independent research capture and does not advance the canonical Week 1 schedule or merge the Week 2 rollover PR.

After final results arrive, match by event ID and teams, compare paired score/total/margin errors, and preserve this original file. Week 2 alone is not enough to approve a production model. Further prospective samples and probability/market validation are still required. No scheduled watcher is installed by this experiment.
