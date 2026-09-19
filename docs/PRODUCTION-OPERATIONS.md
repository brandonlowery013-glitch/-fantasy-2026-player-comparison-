# Shared production operating record
Updated 2026-09-19. Repository: brandonlowery013-glitch/-fantasy-2026-player-comparison-.

## Read before scheduled work
This record coordinates existing tasks; it does not create schedules or certify all automation healthy. Inspect current main, frontend/ctd-cloudflare-work, relevant workflow runs and deployed outputs before acting. Use current task IDs, not chat titles, to update schedules. Preserve each task's purpose, cadence, enabled state and notification preferences. Avoid duplicate collectors, overlapping writers, and repeated unchanged alerts.

## Verified fixes and acceptance
- Basic live scoring PASSED September17: user watched score, game state, player statistics and play-by-play update automatically. Observer is follow-up, not a prerequisite.
- September18 independent deployed-page/ESPN check of event401872932 matched DET31 BUF41 FINAL and sampled player stats. This is dated evidence, not a promise against later regression.
- Main PR1546 merged a530b779545ffe1af80e01d4811757a4c7b2c76d: settle-issued-picks imports and invokes historyFeed correctly; existing six-hour settlement publisher stages both issued-pick-results and betting-history-ui. Repeat runs and correction tests passed.
- Frontend a40115a16bd7a3dd059a81cdd6e3eca4f7edbfdb displays actual FINAL/in-progress game state rather than feed health. 2e30e8eef93830378e98d7f12aa1afd7e54f0769 avoids stale reference-feed CDN responses.
- September18 website verified UNDER54.5 LOSS at actual72; first pick counted once,0pending,-1unit. Original issued picks remain immutable; later changes are revisions.
- September19 GitHub readback confirms PR1572 merged frontend at3a6da1a780d73ac5c3c819fb0ceeebc214e65f63 and PR1573 merged main at92d55f8fed1c57efd3b690fe0a2988302806604d. These address later final-stat reconciliation and observer reporting. Merge confirmed; subsequent unattended production validation must be checked separately.

## Dependency order
Resolve active season/week and final games -> ingest roster/injury/news/schedule/usage -> reconcile stable team/player/provider IDs and freshness -> update canonical context -> projections/uncertainty -> weekly rankings, Role Watch and distinct categories -> compare with existing market collection -> freeze issued picks -> validate -> publish -> confirm website received same week/version.
Postgame: verified final score/stat snapshot -> settle recorded picks -> history/profile/recap updates -> ingest later corrections idempotently. Missing stats are unknown, not zero. No automatic research-model promotion.

## Responsibility boundaries
- Fantasy sweep: current player/news/availability and shared outputs, not draft ADP during in-season operation.
- Week rollover: existing all-games-final gate, current PR/check state, week-consistent outputs. Do not resurrect stale PR1405/1413 blockers without checking current state; Week2 was visible September18.
- Raw-feed proof: source freshness, IDs and producer-to-consumer receipt.
- Live-game proof/watch: preserve basic pass; assess freshness, stable mapping, final reconciliation and later corrections separately.
- Settlement: existing six-hour workflow; no duplicate paid odds requests.
Existing workflow configuration determines cadence. Targets mentioned in chats are not proof a schedule exists.

## Still requires verification
1. Enumerate actual scheduler IDs and read back each saved objective; six prior chat replies all identified the same Live Game Production Proof schedule. That does not verify six distinct schedules were updated.
2. Confirm unattended executions after PR1572/1573 and actual corrected provider snapshot reaching production.
3. Confirm routine full publication and weekly rollover end to end. Do not rerun expensive sweeps merely to acknowledge this document.

For each future repair record commit/PR, deployed version, actual verification and remaining limitations here or a linked dated evidence record. A working website and successful backend run are separate facts; verify both.

## Weekly game-line feedback report — authorized requirement, not yet implemented
Target Tuesday 08:00 America/Chicago, after prior-week final reconciliation/settlement and before next-week forecasts. This section records acceptance requirements only: the report generator and scheduling acceptance remain NOT implemented/verified and must not be described as running until independently proven.

Analyze ALL saved pregame forecasts, including wins, losses and PASS decisions. Compare immutable original projected scores with actual scores; calculate spread and total errors; retain the original quote, odds, sportsbook and timestamp; report outcomes, coverage and calibration. Explain misses from evidence and separate data bugs, model weaknesses and outcome variance.

Data lineage must link the team master to separate all-game results, immutable pregame prediction/input snapshots, pick/market history and evaluation. Never rewrite an original pick and never present a reconstructed forecast as the original. Existing settlement is grading only, not the full weekly analysis.

Generate one structured backend report as the source for Excel and Word views. Any improvement recommendation must be bounded and tested on cached chronological history against an unchanged baseline. Do not automatically promote coefficients and do not run repeated 1000-combination searches.

Usage controls: use incremental input hashes; skip unchanged reports; apply corrections only to affected rows; reuse existing cached stats, odds and splits; do not add duplicate/paid collectors or redundant sweeps.

When implementation exists, its handoff must record repository/branch, model version, exact files and run entry point, outputs, last completed week, tests, deployed-versus-local status and blockers.

Dated local audit supplied September 19: 32 personnel teams; 16 Week 2 games/projections using 16 prior completed games; 566 history records include PASS/revisions and are not 566 bets; 3 settlement records are not 3 bets. Personnel is attached with zero numerical influence. Treat these as dated audit facts and reverify current state when relevant.
