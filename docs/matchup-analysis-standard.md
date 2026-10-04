# Standing matchup-analysis standard

This is the user's ongoing standard for every slate. Preserve it during weekly rollover.

Game assessments must be original, connected football analysis, not a list of model factors or a paraphrase of source opinions. Explain the plausible game script, why the actual displayed selection at its offered price could work, and the strongest counterargument. Use multiple dated sources, consider opponent mix and small samples, and identify inference as inference. Assess replacement quarterbacks on their actual performance and supporting personnel; do not assign an automatic backup penalty.

Retrieve obtainable pregame evidence before declaring information missing: current game-specific injury reports (including line and secondary), recent offense/defense and workload, quarterback performance, rest and venue. Do not turn absent values into zero or infer availability from absence from a report. Keep dated reports separate from collection times. Do not use post-kickoff results to justify the saved pregame forecast.

The explanation must faithfully show the real calculation. Preserve the calibrated scoring/rest formula and original saved records. Current descriptive evidence is not a numeric adjustment unless the model actually uses it through a validated path. DraftKings Consensus and Smart Money are public ticket/handle shares; they currently have no coefficient in the football scoring model. Do not describe handle as proven professional action or claim the percentages have changed model probabilities. No new weights without out-of-sample validation. No broad collectors, prohibited pipelines, workflow YAML reseeding, or protected-main bypass.

Props need a short direction/line explanation, a decisive supported workload or matchup reason, and any relevant caveat. Explain a mean-versus-probability disagreement: for skewed distributions, the average is not the median. Use the probability for the exact displayed line and side; never flip a side just because its mean lies on the other side of the line.

Keep the approved Consensus/Smart Money display unchanged. Sort the underlying game list by kickoff, preserving selection; invalid dates go last. Group mathematical detail and deduplicated team/game-specific source links under an expandable section, with readable Central times.

Before publishing a new slate, refresh `lib/weekly-matchup-notes.mjs` with original event-date-specific assessments; never carry stale prose into another week. The current-game loader supplements the text with each selected game's recent box scores and current report. Run `node scripts/test-matchup-assessments.mjs` along with the existing show-work tests. The coverage check deliberately fails when a current-slate game has no dated assessment. Check every game in the browser, including no-bet games, plus the actual prop line/price/probability and mobile layout. Publish only through the protected PR path and verify the deployed site before reporting completion.

## Implementation map and remaining model gaps

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
