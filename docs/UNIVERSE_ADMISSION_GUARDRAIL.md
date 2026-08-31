# Fantasy 2026 Universe Admission Guardrail

## Purpose
Prevent newly fantasy-relevant players from being missed when transactions, injuries, suspensions, depth-chart changes, or role changes create material opportunity.

## Mandatory trigger
Every regular-season monitoring pass must evaluate whether any player outside the current active fantasy universe has become materially fantasy-relevant.

A universe-admission review is mandatory when any of the following occurs:
- A QB/RB/WR/TE is traded to, signed by, claimed by, activated by, or elevated into a team containing an active tracked player.
- A starter or primary backup is traded, released, waived, suspended, placed on IR/PUP/NFI/Commissioner Exempt, declared inactive, or otherwise becomes unavailable.
- A depth-chart change creates a plausible path to meaningful snaps, routes, targets, carries, touches, third-down/two-minute work, red-zone work, or goal-line work for an untracked player.
- Regular-season usage shows an untracked player has materially entered the fantasy-relevant opportunity tree.

## Admission test
For every triggered untracked player, explicitly disposition as ADMIT, HOLD OUT, or WAIT.

ADMIT when the player has a plausible material role or contingent role that can affect fantasy decisions for the active universe. Do not require the player to already be a starter.

HOLD OUT when the transaction or roster move does not create meaningful fantasy opportunity.

WAIT when the player may become relevant but evidence is insufficient to establish a material role; attach the exact evidence needed for admission.

## Required onboarding after ADMIT
An admitted player must complete the same pipeline as every existing player before the universe can be called synchronized:
1. Add to canonical player universe and increment the active universe count.
2. Build season-long fantasy projection and stat-line range.
3. Score all True-Value components: Expected Fantasy Production, League-Winning Ceiling, Role/Volume, Offensive Environment, Availability, Weekly Reliability, Sustainability.
4. Calculate True-Value score and positional rank.
5. Place on True-Value ranking with contiguous re-numbering.
6. Place on Overall/Actionable ranking with contiguous re-numbering.
7. Assign Market Value BUY/FAIR/REACH/FADE and preferred draft range using current market data when available; if market data is unavailable, explicitly mark price discovery pending rather than fabricating ADP/ECR.
8. Populate comparison-model inputs and player write-up.
9. Run connected-player reconciliation for every materially affected teammate in the opportunity tree.
10. Run all applicable historical, projection, ceiling/bust, role, offensive-environment, durability/availability, market-value, Vegas/prop, comparison, cross-board, and synchronization audits that existing players are required to pass.
11. Update locked ranks, player shards/loaders, active-universe metadata, site runtime, exports, and QA expectations.
12. Verify no duplicate names, no rank collisions/gaps, required fields complete, position ranks contiguous, and site/current Excel export synchronized to the new universe count.

## Closure gate
A monitoring pass may not conclude `no material change` until:
- all new transactions/availability events have been reconciled against tracked depth charts;
- all untracked players implicated by those events have an ADMIT/HOLD OUT/WAIT disposition;
- every ADMIT player has either completed onboarding or is explicitly marked as a blocking unsynchronized model change.

## Permanent automation requirement
This process must not rely on memory or a manual prompt reminder. The regular-season monitor must execute the transaction/depth-chart sweep and universe-admission test before closing a monitoring cycle.

When an ADMIT occurs, model maintenance must generate or require the onboarding artifacts and fail synchronization/closure checks until the new player is represented across the canonical universe, projections, rankings, comparison inputs, audits, site, and current export.

Any workflow, script, or QA artifact that hard-codes the active universe count is a migration dependency whenever the universe expands. A successful admission therefore requires a repository-wide count/loader/QA search, not just modification of the player shard containing the new player.

## Regression case
2026-08-30: Green Bay acquired Kaleb Johnson after Josh Jacobs was placed on the Commissioner's Exempt List. This event should have automatically triggered both connected-player review (Jacobs/Lloyd/Johnson) and a universe-admission review. Johnson was subsequently admitted as player 163. Future analogous cases must trigger automatically.
