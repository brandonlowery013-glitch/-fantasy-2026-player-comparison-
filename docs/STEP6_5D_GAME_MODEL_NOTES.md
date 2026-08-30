# Step 6.5D game spread/total calibration

This step is stacked on Step 6.5C and remains SHADOW_ONLY.

The incumbent comparison baseline is kept intentionally simple and independent of challenger tuning: prior-season team points-for and points-allowed are shrunk by eight equivalent games toward the prior-season league scoring mean, then paired by opponent with historical home-field advantage. This mirrors the existing Step 14 scoring-prior design closely enough for leakage-safe historical comparison without allowing the challenger to improve its own baseline.

The challenger starts from the same football information family, but progressively replaces prior-season scoring evidence with current-season pregame scoring evidence using a half-life selected only from earlier seasons. Pregame rest differential is an optional football-only challenger feature. No spread, total, odds, implied probability, consensus market price, ADP, or sportsbook-derived value may enter parameter selection or forecast generation.

The held-out seasons are 2024 and 2025. For each held-out season, decay and ridge regularization are selected using earlier seasons only. Promotion candidacy requires pooled improvement in margin MAE, total MAE, and team-score MAE, with no held-out season regressing simultaneously on both margin and total MAE. Promotion is never automatic; production numeric authority remains zero until later governance and the full backward audit.

The 2026 operating interpretation is unchanged: 2025 is the Week 1 starting prior, and 2025 evidence is gradually weeded out as valid 2026 games accumulate according to historically validated decay rather than an arbitrary weekly schedule.
