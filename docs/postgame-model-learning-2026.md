# Continuous postgame model learning

The team-scoring model already blends completed-season points-for/against with 2025 priors using a four-game half-life. This layer separately records forecast errors and game behavior, learns bounded candidate corrections, and measures them without rewriting issued picks.

## Automatic lifecycle

- Weekly orchestration and adaptive market refresh freeze the first moneyline and first spread forecast per game, regardless of PICK/PASS/WAIT. They retain actual capture times, model version, quote identity, pregame feature values, and candidate parameters.
- The six-hour settlement workflow fetches free verified ESPN final summaries. It catches up all unobserved archived games, including older PASS/WAIT games, and rechecks recent games for corrections. A failed batch leaves the previous learning artifact intact.
- Final scores create winner/cover outcomes, score and margin errors, probability errors, Brier/log losses, and win/loss labels. Ties and spread pushes are excluded from conditional binary probability training.
- Team/player box-score observations update dated four-game-half-life states. Source corrections append revisions. Multiple books and changing lines cannot inflate the learning sample: one frozen row per game/market.
- Separate moneyline/spread regularized residual models refit from prior completed weeks only. Candidate probabilities change by at most two percentage points. Missing features cannot acquire coefficients; highly correlated feature columns are excluded. They are evaluated alongside the original model.
- Current market write-ups expose the candidate probability separately. Outcome predictions are independent of betting recommendations: LOW-confidence predicted sides remain visible while betting decisions can be PASS/WAIT. Exact 50/50 directions use a disclosed alphabetical tie-break; unavailable forecasts/lines are not invented.

## Available game information and limits

The collector retains offensive plays, pass/rush attempts and share, passing/rushing yards, sacks allowed, turnovers, possession, third downs, red-zone results, player attempts/targets/receptions/yards/touchdowns, scoring evidence, and captured personnel/market context. Candidate features can use frozen prior-game team behavior differences once sufficient dated feature/outcome pairs exist.

EPA, success rate, PROE, pressure, explosives, garbage-time splits, routes/snaps, weather/coaching/injury numeric effects, opponent-adjusted efficiency, Polymarket and public-split numeric weights are explicitly missing or unvalidated. Box-score sacks are not pressure; pass share is not PROE; possession is not neutral-situation pace. Recording a context item or winning a pick is not evidence that it caused the result.

## Historical recovery and validation

The bootstrap recovers 128 original football forecast/line observations covering all 64 Week 1–4 games, with original source commit and pregame quote time. It does not create retrospective issued bets. Finals and detailed box scores are observed at the actual retrieval time. Detailed game features unavailable in pregame archives are not backfilled into historical fits.

The reconstructed preceding-week diagnostic uses all 64 moneylines and 63 non-push spread cases. It is a different sample from the Polymarket-paired experiment and is not a newly frozen independent test. It shows no consistent benefit from the initial bounded probability correction. Original forecast versions differ across these weeks; this diagnostic does not validate the current no-rest model.

The collector/refitter runs automatically. Production numeric authority remains zero until the existing independently frozen paired holdout and exact-sample review requirements pass. No guardrail, freeze, QB/status hold, betting-price threshold, original prediction, totals formula or prop formula is bypassed. The historical 52% filter experiment remains separate.
