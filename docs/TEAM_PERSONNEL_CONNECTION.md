# Team personnel connection

The automatic context collector now reads all 32 ESPN team rosters, keeping provider athlete IDs, positions, roster groups, depth roles and injury report dates. This is separate from the 167-player fantasy universe; collecting reserves or defenders does not admit them to fantasy rankings.

The collector writes `data/ingestion/team-personnel-2026.json`. The existing ingestion, player refresh, rollover and weekly lifecycle workflows persist it. Game projections read this file and recommendations carry both teams under `personnel_context`.

Roster membership does not establish game availability. Injury reports older than the existing 12-hour injury freshness window require review. Missing or older-than-24-hour roster collections are marked unavailable/review-required. Canonical name-and-position matches are checked against observed teams; unknown identities are not reassigned automatically.

Validation: live collection returned 32 teams and 2,468 players, including offensive linemen, defenders and reserve groups. All five games in the checked-in Week 2 projection schedule carried both rosters into recommendation output. Focused tests cover IDs, aliases, injury dates, stale data, season/week mismatches and football-only provenance; projection and recommendation self-tests pass.

This connects personnel evidence to model outputs. It does not add unvalidated injury-to-points coefficients or change predicted scores. Numerical influence remains explicitly false. The deployed site does not receive this code until the PR is validated, merged and delivered to the preview branch.
