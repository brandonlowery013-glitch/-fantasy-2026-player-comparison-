# Current-season game scoring

## What changed

The displayed shadow game forecasts previously used equally weighted 2023–2025
scoring averages. `scoring-decay-rest-2026-v1` uses the existing Step 6.5D ridge
calibration method: prior-year offense against opponent points allowed, completed
current-season games, empirical home advantage, and pregame rest differential.
Decay and coefficients are selected using earlier seasons, not chosen by hand.
The 2026 fit selected a four-game half-life and ridge penalty 100. After one game,
the scoring inputs give current-season observations about 15.9% weight. This is
a gradual transition, not a five-game cutoff.

These remain non-actionable shadow recommendations. This change does not promote
the system to approved betting, prove an edge over bookmakers, change fantasy
player projections, or overwrite frozen forecast archives.

## Validation and rejected extensions

`scripts/backtest-matchup-score-candidate.mjs` tests 544 regular-season games from
2024 and 2025, with parameter selection and fitting restricted to earlier seasons.
It compares the actual deployed three-season, eight-equivalent-game shrinkage
baseline, rather than the older research script's one-season approximation.
Football data from 2020–2025 support the rolling historical fits. The prior used
for 2026 predictions is 2025, progressively updated with completed 2026 games.

| Pooled mean absolute error, points | Deployed baseline | Selected scoring model |
| --- | ---: | ---: |
| Home-minus-away margin | 10.8683 | 10.3489 |
| Combined total | 10.4689 | 10.3838 |
| Individual team score | 7.7407 | 7.4460 |

The existing Step 6.5D gate requires all three pooled errors to improve and no
held-out season to regress on both margin and total. The 2024 total error rises
slightly, from 10.0064 to 10.0397; the 2025 total improves. The pooled total gain
is small. These are retrospective results and require prospective tracking.

Separate ablations test plays per game, pass/rush EPA against the opposing
defense, sack susceptibility versus pressure, explosive-play interactions, and
interception interactions. Another adds observed passing/rushing/target
continuity from the last completed game. Neither extension passes its improvement
gate. They are recorded for research and receive no numerical authority.
Current injuries, expected starters, and coaching changes remain contextual;
this work does not invent point deductions for them. Previously observed player
usage is not represented as confirmed availability for the next game.

The selected model's score uncertainty comes from earlier-fit held-out forecast
residuals, not raw team-score variation or sportsbook lines. Equal home/away
standard deviations and the existing Gaussian integer-score simulator remain
approximations, not proof of calibrated betting probabilities.

## Repeatable update path

1. Verified weekly schedule.
2. `refresh-current-game-scoring.mjs` fetches each earlier 2026 regular-season
   week from ESPN, accepting only completed games, and verified rest data from
   the NFLverse schedule. It discards odds and target-game results.
3. The saved historically fitted coefficients generate score means and a trace
   showing prior/current scoring, weights, completed games, and rest inputs.
4. `build-weekly-game-projections.mjs` checks week, identity, age, model version,
   and artifact hash before using those means and residual uncertainty.
   Already-started games retain their existing projection.
5. The existing market comparison runs afterward. The recommendation feed carries
   `model_version` and `scoring_evidence`, so a pick can be traced to its inputs.

Step 24, Step 14, and the preview-season workflow run the refresh before game
projection generation. Step 24 publishes the current scoring input with the
normal generated outputs. Missing or mismatched data fails the refresh rather
than silently publishing invented values. A failed refresh leaves the previously
published feed in place and requires investigation of the failing job.

Tests cover historical/live feature parity, current-season influence, neutral
venues, same/future-week exclusion, missing rest and duplicate rejection, market
independence, final-score provenance, and the acceptance/rejection gates.

## Future personnel work

To change score means for injuries or coaching transitions, collect dated pregame
availability and depth-chart snapshots with stable player identities, then test
those effects separately against this baseline. Do not infer pregame knowledge
from the starters or participation observed after a game. Preserve the Week 1
misses (NO–DET, CHI–CAR, NYJ–TEN and BAL–IND) for diagnosis without tuning a model
to force those known outcomes.
