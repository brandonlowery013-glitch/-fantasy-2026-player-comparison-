# Two learning paths and Central kickoff display

The calibrated scoring-decay-rest spread/moneyline engine is preserved. Its existing path is scoring inputs → shared integer-score distribution → market probability, price/EV and recommendation. This change connects descriptive learning without adding weights or changing frozen predictions.

## Football behavior

The existing issued-pick settlement path reads its existing verified-final summaries once, then appends team/player behavior observations to `issued-pick-results-2026.json` under `football_learning`. Repeated finals do not duplicate observations; corrections append revisions. Stable player IDs preserve history through team changes. Missing stats remain missing, never zero.

The state uses strictly earlier weeks and observations available by the evaluation timestamp, with a four-game half-life. Future game projection and market outputs carry only the matching teams' descriptive state. Current/same-week outcomes cannot enter their own pregame state. Logged personnel/role events are review evidence. Three recent games versus three prior games can flag a persistent workload shift for review; this descriptive threshold grants zero score authority and does not automatically reset a prior.

Tracked where the final box score supplies them: plays, attempts/carries/targets, completions, passing/rushing production, sacks allowed, possession, turnovers, third-down and red-zone counts. Player routes/snaps, neutral-situation pace, PROE, full pressure rate, explosive rate and leading/trailing splits are explicitly missing when the source lacks them. Passing-play share includes sacks and is not PROE; possession and plays are not neutral pace. Fresh source coverage must exist before those missing behaviors can be learned. No broad collection is added.

## Prediction and reason quality

`prediction_reason_learning` recomputes first pregame PICK per stream against latest verified final settlement revisions, separately for spread, ML, total and each prop stat. It reports conditional non-push Brier/log loss, calibration buckets, W/L/P, hypothetical original-price ROI/EV gap and reason/version gaps. Existing calibration and audit artifacts retain projection error and available closing-line coverage.

New captures retain an actual numerical decision reason when the recommendation did not supply one, plus dated context/personnel/learning provenance. Old missing reasons are not backfilled. A winning pick does not prove the reason caused the result. Mechanism quality stays ungraded without separately recorded mechanism evidence.

Factor trial classifications are rule/market-specific: OBSERVATION for inadequate or mixed evidence; EMERGING for consistently improved proper scoring losses on a separately frozen prospective paired sample; REJECTED when a qualifying trial worsens both; VALIDATED only after the minimum independent holdout, correlation review and an exact-sample approved review. Duplicate, hindsight and over-cap trials reject. Numerical authority remains zero even for a validated trial until separate protected promotion. No factors from the two-week retrospective experiment are automatically promoted. Game/player clustering remains relevant.

Both learning outputs persist inside the existing settlement ledger already published by the guarded settlement workflow. No schedule/workflow YAML changes are needed. Its existing QA runs the new temporal, correction, classification and timezone regressions through `test-pick-settlement.mjs`.

## CT kickoff

`CTD_TIME` formats explicit-offset UTC timestamps using `America/Chicago`, with the label CT and automatic daylight saving. Main-site schedule, ticker and live provider status use the same formatter. The standalone Cloudflare change applies the same formatter to its initial cards and subsequent score polls. Live clocks, final scores, postponements and cancellations remain states rather than kickoff strings. Undated or offset-free timestamps do not receive a guessed timezone. Stored schedules and kickoff instants are unchanged.

Dedicated O/U model formulation remains deferred. Rich observed information does not gain numerical authority merely because it is now retained.
