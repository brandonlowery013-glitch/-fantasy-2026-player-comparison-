# CTD joint opportunity prop model

Implementation: `ctd-opportunity-props-v1`. This is a research model, not a claim
of betting profitability. It replaces the pregame prop board's average-only
fallback; archived pregame records and frozen season-long player evaluations
remain unchanged.

## Calculations

Each game has shared simulated team play counts. The offense and its opponent's
earlier allowed production estimate volume and efficiency. Team pass attempts
are allocated across players plus an explicit OTHER/throwaway bucket. Receptions
are conditional on targets; yards follow a compound shifted-gamma process fitted
from earlier player-game counts and production. Position-pooled priors shrink
small player samples. Expected starting-QB passing efficiency adjusts receiving
efficiency once. QB passing yards/TDs equal the receivers' totals, including OTHER.
Rushing opportunities are allocated from one team rushing total; RB receiving
production is generated in the same game. TDs are conditional count processes,
not universal normal distributions. Every integer line retains push probability.

WR/TE opportunities use verified routes x targets per route if supplied with a
fresh source. Otherwise the model explicitly labels an earlier target-share
fallback. Confirmed absent players get zero opportunities. Their missing work
is not automatically awarded to every backup: the model requires verified
replacement shares to make that assertion. OTHER retains unresolved work.

The weekly aggregate source does not separate designed QB rushes, scrambles,
kneels or sacks. Those remain explicitly missing, as do goal-line/red-zone
opportunities, weather, coverage assignments and pressure context. The current
roster adapter is incomplete; absence from an inactive list never means confirmed
active. These are limitations to resolve, not invented inputs or zero penalties.

## Fit and evaluation

Run `node scripts/build-opportunity-props.mjs --backtest` to fit 2021–22 priors,
select shrinkage on 2023, then evaluate once on 2024–25. Each evaluated week uses
only earlier player/team rows, including for roster and starter inference. Metrics
include MAE, 10th–90th percentile coverage and Brier score against half-point
lines derived from earlier player means. Those lines are NOT historical sportsbook
quotes, and the report is NOT a betting ROI backtest. Evaluation is conditional
on observed player outcome rows; it does not establish historical pregame active
status. Current-season priors are subsequently refitted through 2025.

## Current operation

`node scripts/build-opportunity-props.mjs --live --allow-unavailable` reads the
current schedule, earlier nflverse weekly player stats and the current native
QB/availability feeds. Sources, hashes, week cutoffs and missing inputs are saved
in `data/market/opportunity-props-2026.json`. Failure produces UNAVAILABLE, never
a refreshed copy of stale data. Artifacts expire after 20 minutes; market quotes
expire after 60 minutes for the new browser evaluator. Started-game candidate
forecasts are retained without recalculation.

The adaptive prop workflow rebuilds this artifact before evaluating new quotes.
The prop board uses the same joint samples for every current line and price,
so a price change cannot change a football probability. No second QB adjustment
or legacy percentage adjustment is applied. Candidate outputs remain WAIT while
validation/current-input gates are incomplete. The initial release deliberately
does not mark any player eligible for a bet. Source checks passing is not the
same as calibration or profitability passing.

Commands: `node scripts/test-opportunity-props.mjs` and
`node scripts/test-opportunity-prop-selection.mjs` check chronology, freshness,
source identity, inactive players, opponent sensitivity, shared accounting,
deterministic replay, integer pushes and the hold gates.
