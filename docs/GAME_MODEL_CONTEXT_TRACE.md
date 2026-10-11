# Game model context trace

Verified against main 20a6788e536b30edbf893ff17ae1b82a90bfb7ca.

Current path: historical team scoring priors (2023–2025) -> build-weekly-game-projections.mjs -> simulated score distributions -> build-game-market-recommendations.mjs -> weekly market recommendations -> preview cards.

The Step 3B Bayesian framework is marked shadow-only with zero live influence. Step 3F normalizes proposals; coach identity and play-caller numeric authority are zero. The normalized Week 2 context observed September 16 contains 167 players, 674 signals, and zero nonempty stat_adjustments. A captured injury report's age does not establish that the underlying injury status is freshly verified.

This change attaches matching player/team evidence to each game recommendation with explicit freshness and zero numeric influence. It does not implement Bayesian score adjustments, Benter blending, Kelly staking, or improve measured accuracy.

Next required work:
1. Recover the exact user-approved pair of equations; Bayesian and Kelly references alone do not prove that agreement.
2. Source dated coaching/play-caller identities and tendencies: neutral-situation pace, early-down passing, fourth-down behavior, trailing/leading splits. Carry relevant history across teams with explicit personnel/regime changes.
3. Add opponent-adjusted efficiency, pressure versus protection, explosive-play rates, red-zone opportunities, personnel availability, verified workload, weather and rest. Avoid double-counting correlated signals.
4. Evaluate rushing yards over expected as an efficiency input distinct from carries/routes/targets. Confirm provider coverage and historical availability before use.
5. Fit and compare context-aware predictions using time-ordered pregame data, untouched holdouts, calibration and predictive score error; include simple historical and market baselines. Preserve original predictions and timestamps. Do not tune solely to Week 1 losses.
6. Connect only supported numerical effects after validation; regenerate Week 2 estimates and show evidence used versus merely attached. Live odds refresh alone does not recalculate predictions.

Test: node scripts/test-game-context-evidence.mjs
