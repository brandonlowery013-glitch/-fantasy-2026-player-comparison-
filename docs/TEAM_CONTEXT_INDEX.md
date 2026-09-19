# Shared 2026 team context

Run `python3 scripts/refresh-team-context-index.py` from repository root. Uses existing personnel, schedule, scoring, quotes, issued picks and settlements plus three public nflverse references. No paid odds request. Attached to the existing weekly orchestration cadence; not a new schedule.

Output: data/team-context/team-master-2026.json. Team IDs link shared games; source hashes retained. Covers all32 rosters,272 scheduled games, observed coaches, divisions,2024/2025 scoring totals and available2026 final scores/team box statistics. Last observed coach is not a current confirmed coaching report. Full per-player pregame snapshots and complete play timelines are not supplied by this index.

No coefficients or picks changed. Personnel remains zero numeric influence. Current projection is not certified original pregame archive. Quote timestamps remain source timestamps. Season-win totals, coaching tendencies and fresh narrative analysis remain missing; do not infer them. Word/Excel rendering and full Tuesday mistake analysis remain pending.

Continuity: resume from this entry point in any chat with repository access; verify branch/commit and workflow execution before claiming production. Files build-team-context-index.py, enrich-team-context-index.py, refresh-team-context-index.py define the implementation. Existing weekly workflow persists data/team-context. First unattended run must still be verified after merge.
