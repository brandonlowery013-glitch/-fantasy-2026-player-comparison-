# Standing matchup-analysis standard

This is the user's ongoing standard for every slate. Preserve it during weekly rollover.

Game assessments must be original, connected football analysis, not a list of model factors or a paraphrase of source opinions. Explain the plausible game script, why the actual displayed selection at its offered price could work, and the strongest counterargument. Use multiple dated sources, consider opponent mix and small samples, and identify inference as inference. Assess replacement quarterbacks on their actual performance and supporting personnel; do not assign an automatic backup penalty.

Retrieve obtainable pregame evidence before declaring information missing: current game-specific injury reports (including line and secondary), recent offense/defense and workload, quarterback performance, rest and venue. Do not turn absent values into zero or infer availability from absence from a report. Keep dated reports separate from collection times. Do not use post-kickoff results to justify the saved pregame forecast.

The explanation must faithfully show the real calculation. Preserve the calibrated scoring/rest formula and original saved records. Current descriptive evidence is not a numeric adjustment unless the model actually uses it through a validated path. DraftKings Consensus and Smart Money are public ticket/handle shares; they currently have no coefficient in the football scoring model. Do not describe handle as proven professional action or claim the percentages have changed model probabilities. No new weights without out-of-sample validation. No broad collectors, prohibited pipelines, workflow YAML reseeding, or protected-main bypass.

Props need a short direction/line explanation, a decisive supported workload or matchup reason, and any relevant caveat. Explain a mean-versus-probability disagreement: for skewed distributions, the average is not the median. Use the probability for the exact displayed line and side; never flip a side just because its mean lies on the other side of the line.

Keep the approved Consensus/Smart Money display unchanged. Sort the underlying game list by kickoff, preserving selection; invalid dates go last. Group mathematical detail and deduplicated team/game-specific source links under an expandable section, with readable Central times.

Before publishing a new slate, refresh `lib/weekly-matchup-notes.mjs` with original event-date-specific assessments; never carry stale prose into another week. The current-game loader supplements the text with each selected game's recent box scores and current report. Run `node scripts/test-matchup-assessments.mjs` along with the existing show-work tests. The coverage check deliberately fails when a current-slate game has no dated assessment. Check every game in the browser, including no-bet games, plus the actual prop line/price/probability and mobile layout. Publish only through the protected PR path and verify the deployed site before reporting completion.

## Implementation map and remaining model gaps

### Complete required inputs

The preserved **Live Game Production Proof** handoff (conversation `6ab8ee35-8530-83ea-b93e-725b30e76e44`) records the agreement after the Shough/Lawrence comparison. It does not contain the original full comparison or establish additional coefficients. The requirements below preserve that agreement individually; do not replace this list with a generic “math plus context” requirement. Consensus and Smart Money are additional requirements from later user requests.

Status is deliberately scoped: **implemented** means the identified calculation exists, **partial** means only some inputs or players are covered, **descriptive** means available evidence affects the explanation but not the score probability, and **missing** means the complete required capability is not present. Recognizing a field name is not evidence of populated, fresh data or numerical integration.

| Required variable or decision step | Current status and precise limitation |
| --- | --- |
| Baseline model projection | Implemented for existing game scores and supported player-stat projections; missing player projections remain unavailable. |
| Actual sportsbook line and price | Implemented for saved quotes with book and capture time; freshness and eligibility remain separate from model direction. |
| Implied probability and no-vig market probability | Implemented from the matching price pair where supplied. |
| EV and probability edge | Implemented at the evaluated side, line and price, including win/loss/push treatment. |
| Spread edge and total edge | Implemented from the existing score projection versus the offered spread/total. |
| Game total and team implied totals | Implemented as market context; not extra independent football-score inputs. |
| Expected pass attempts | Partial: opportunity fields display when the projection supplies them; recent observed attempts are not a future attempt forecast. |
| Expected targets | Partial: supported player projections supply targets; not universal coverage. |
| Expected carries | Partial: supported player projections supply carries; recent carries do not by themselves establish next-game volume. |
| Expected routes | Missing complete sourced projection coverage; do not infer routes from targets or receiving yards. |
| Expected snaps | Missing complete sourced projection coverage; depth rank is not a snap projection. |
| Opponent QB production allowed | Partial/descriptive: recent team passing-defense box scores are available; complete QB-position production coverage is not established. |
| Opponent RB production allowed | Partial/descriptive: team rushing defense is available; it does not isolate RB production or receiving production. |
| Opponent WR production allowed | Missing complete position-specific coverage; total passing yards allowed are not WR-only production. |
| Opponent QB fantasy points allowed | Missing complete current, scoring-format-specific coverage. |
| Opponent RB fantasy points allowed | Missing complete current, scoring-format-specific coverage. |
| Opponent WR fantasy points allowed | Missing complete current, scoring-format-specific coverage. |
| Pass tendencies and run tendencies | Partial/descriptive: recent pass/run play mix; not a complete opponent-adjusted tendency model. |
| PROE (pass rate over expectation) | Missing complete sourced coverage; ordinary pass share is not PROE. |
| Pressure rate | Missing complete sourced coverage; sack counts do not measure all pressures. |
| Sack rate | Partial/descriptive: recent sacks and box-score volume; a validated pressure/sack adjustment is not added to game scoring. |
| Coverage quality | Missing complete coverage-grade or coverage-scheme inputs; passing yards allowed are not a coverage grade. |
| Run-defense quality | Partial/descriptive: recent rushing yards/efficiency; complete personnel and opponent-adjusted quality are not established. |
| Teammate injuries | Partial: available current team reports and existing prop signals; not universal fresh availability or numerical effects. |
| Opponent injuries | Partial/descriptive: both teams’ current reports; no new calibrated opponent-injury score coefficient. |
| Offensive-line injuries and effects | Partial/descriptive: named absences where reported; missing validated blocking/score/volume effects. |
| Secondary injuries and effects | Partial/descriptive: named absences where reported; missing validated coverage/score effects. |
| Pace | Partial/descriptive: recent plays per game; not equivalent to neutral-situation seconds per play or projected possessions. |
| Expected game script | Descriptive: matchup case and countercase; no new validated script-to-volume adjustment. |
| Home versus road | Implemented existing home-field feature plus descriptive location; preserve neutral-site handling. |
| Dome/roof conditions | Missing complete verified coverage; venue identity alone does not establish roof status. |
| Weather | Missing complete fresh game-time coverage and validated effects. |
| Recent role and usage changes | Partial: supported role/context signals and recent leaders/workload; not complete snap, route, target-share or replacement-role coverage. |
| Projected stat distribution | Implemented for supported existing distributions; retain family, uncertainty and exact-line probabilities. Missing distributions are not filled with invented values. |
| Modeled Over/Under probability | Implemented using the distribution at the actual line; a mean above the line does not necessarily imply an Over lean. |
| Reconcile strengthens / weakens / contradicts | Partial: existing applied adjustments are attributed and new descriptive risks are explained. The complete new contextual numerical adjustment layer is missing. |
| Final probability and confidence | Existing model output is implemented; do not relabel it as fully adjusted for every input above. |
| Fantasy projections and start/sit | Partial: `fantasyWork` exposes existing projection/context calculations. Full fresh coverage and shared decision logic for all required variables are not complete. |
| Consensus moneyline/spread/total percentages | Implemented display of published ticket shares; missing validated numerical model integration. |
| Smart Money percentages | Implemented display of published handle shares; missing validated numerical model integration. Handle is not proof of professional betting. |

For every eventual numerical integration, retain the baseline, source/observation time, exact feature value, applied coefficient or transformation, resulting projection/distribution change, and final probability/confidence. Validate out of sample before changing weights. A missing input must not silently become zero, a neutral effect, or an invented confidence boost. This checklist is a specification and implementation audit, not a claim that all requirements are complete.

| Requirement | Actual current path | Changes numeric output? |
| --- | --- | --- |
| Scoring baseline, opponent scoring, rest, home-field feature | `data/probability/generated/game-scoring-model-2026.json`, current-game scoring, `lib/game-market-probability.mjs` | Yes, existing validated scoring/rest model; weights unchanged here |
| Price, implied probability, no-vig comparison, probability edge and EV | `lib/game-market-probability.mjs`, `runtime-show-work-2026.js` | Used to evaluate the saved forecast at each offered price |
| Team implied total | `runtime-show-work-2026.js` | Market context; not added into the independent score projection |
| Current team injuries, QB, line/secondary absences, venue | `lib/matchup-facts.mjs` → `currentReport` in `lib/matchup-assessment.mjs` | Factual review; no validated injury/backup-QB coefficient in game scoring |
| Passing/rushing defense, sacks, recent workload and leading QB/runner/target | Selected teams' prior completed ESPN box scores → `teamProfile` | Descriptive evidence; no additional game-score points assigned |
| Prop opportunity/usage/context adjustments and distributions | Existing weekly projections/distributions → `propWork` | Existing supported prop adjustments only; output preserved |
| Positional fantasy allowed, PROE, pressure rate, coverage grades, snap/route shares, weather | Existing verified context signals when actually supplied; box-score data does not substitute for these metrics | Incomplete upstream coverage remains; these facts must not be invented or claimed as modeled |
| Consensus / Smart Money | `lib/public-splits.mjs` → public snapshot / `/api/live/splits` → approved card display | **Display only. No coefficient or probability adjustment.** A validated historical ticket/handle feature and out-of-sample test are still required before weighting these in picks |
| Show actual work, source dates, mean-versus-direction explanation | `runtime-show-work-2026.js` renderer, assessment module, dated editorial notes | Explanation only; no saved pick or settlement mutation |
| Weekly permanence and coverage | This document; `scripts/test-matchup-assessments.mjs` in Guardrail | Requires a dated full-slate assessment before publishing a changed slate |

The current game-margin model uses standardized scoring-matchup and rest features with intercept 2.0625459897 and coefficients 4.9919216984 and 0.4475038329. The total model uses intercept 45.0235467255 and coefficients 2.2255507968 and -0.2331384108. Feature centering/scaling and the home-field feature remain in the model artifact; these coefficients must not be applied directly to raw inputs. Context prose and public betting splits have zero additional numeric weight. This is a candid map of partial implementation, not a claim that every standing-formula input has been integrated.
