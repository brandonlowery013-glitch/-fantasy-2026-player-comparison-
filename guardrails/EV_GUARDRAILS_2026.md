# Fantasy + NFL EV Guardrails (2026)

These rules are mandatory for every fantasy-EV, season-prop, weekly-prop, spread, total, and moneyline model built on top of the 162-player fantasy system.

## 1. Frozen core

The existing 162-player fantasy board is the authoritative core. Betting/market layers are overlays only. They may add context, probabilities, EV, review flags, and draft-value overlays, but they may not silently rewrite core player rank or core projection.

Any proposed core change must identify the exact input that changed, quantify the before/after effect, and state why the change is supported. Otherwise it is blocked.

## 2. No missing-data improvisation

Missing inputs are never guessed into existence. If a required input is unavailable, output `INSUFFICIENT_DATA` or `THRESHOLD_CONTEXT_ONLY` as appropriate.

A sportsbook threshold without both Over and Under prices is not a market probability and must not be presented as one.

## 3. Separate prediction from price

The model first estimates the football outcome independently. Only after the outcome distribution exists may sportsbook price be compared with it.

Sportsbook odds may calibrate or challenge the model, but they may not directly create the football projection that is then compared back to the same sportsbook price.

## 4. Extreme disagreement is quarantined

A probability edge of 12 percentage points or greater versus the de-vigged market is `REVIEW_REQUIRED` before it can become a strong recommendation.

An edge of 18 percentage points or greater is treated as a model-audit event first, not as an automatic betting opportunity.

Review must check role, injury, projection freshness, opponent/context, line freshness, market type, distribution assumptions, and consensus before clearance.

## 5. Strong recommendations require independent support

A single projection gap cannot create a `STRONG BET` label. At least two independent signals must agree, such as model probability plus a role/usage edge, model probability plus line movement/price support, or model probability plus an independently sourced projection discrepancy.

## 6. De-vig math is explicit

When both sides are available, raw implied probabilities are calculated from the posted prices and normalized so the fair Over and Under probabilities sum to 1.000000 within tolerance.

The raw sportsbook implied probability and the de-vigged fair probability are both retained for auditability.

## 7. Drift is visible

Every accepted model update must be capable of producing a drift report with:

- active player count before/after
- unique player count before/after
- material projection changes
- material rank changes
- source/reason for each material change
- market-only changes
- unexplained changes
- extreme edges quarantined for review

Unexplained material drift is blocked.

## 8. Backtest before trust

Weekly betting outputs are not considered production-trusted until holdout testing is recorded. The system tracks Brier score, log loss, ROI, closing-line value, probability-bucket hit rates, and market-type hit rates.

A 60% prediction must eventually behave like a 60% event. If it does not, probabilities are recalibrated rather than defended.

## 9. Raw and adjusted values both survive

Where adjustments exist, retain the raw model output and the adjusted output separately. Never overwrite the raw result and lose the audit trail.

## 10. Recommendation labels are downstream, not inputs

`BUY`, `FAIR`, `REACH`, `FADE`, `LEAN`, `PLAYABLE`, `STRONG EDGE`, and similar labels are outputs. They cannot be fed back into the model as evidence supporting themselves.

## 11. Market disagreement is descriptive before actionable

If our model and consensus are both above a sportsbook threshold, the first conclusion is that the threshold is conservative relative to both projection systems. It is not automatically a bet.

If only our model disagrees with both consensus and market, the first conclusion is `MODEL REVIEW REQUIRED`.

## 12. Auditability rule

No recommendation is accepted unless a reviewer can answer, in plain English:

1. What changed?
2. Which inputs caused it?
3. What probability did the model assign?
4. What probability did the market assign after de-vigging?
5. What is the EV at the offered price?
6. What safeguards were triggered?
7. Why is the recommendation allowed to pass those safeguards?

If those answers cannot be produced, the output is not actionable.
