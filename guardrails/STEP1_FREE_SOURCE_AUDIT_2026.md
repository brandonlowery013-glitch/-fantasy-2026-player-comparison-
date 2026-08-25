# Step 1 — Free Weekly Data Source Audit (2026)

Status: **COMPLETE**

Goal: exhaust free, reproducible weekly NFL data sources before purchasing a paid feed. Paid data should only be introduced for a field that remains materially unavailable, stale, or operationally unreliable for pregame use.

## Final decision

No paid feed is required at this time.

Use a layered free-source approach rather than buying an all-in-one projection/data package.

### Primary backbone — nflverse / nflreadr
Use for machine-readable play-by-play, weekly player stats, schedules, rosters, depth charts, snap counts, Next Gen Stats, and PFR advanced data.

Limitations:
- participation/route data is not an in-season live route feed for recent seasons;
- current injury coverage cannot be treated as available from nflverse for 2025+.

### Primary weekly utilization — Fantasy Life Utilization Report
Use as the first free reference for weekly:
- snap share
- route percentage / routes run
- TPRR
- target share
- catchable targets
- aDOT / air-yards share
- end-zone and high-leverage targets
- RB rush share
- inside-five rushing share
- short-down, long-down and two-minute usage

This is especially important for TEs, receiving RBs, fringe/cusp WRs, injury returns, and role changes.

### Route verification — StatRankings
Use as the secondary route source and fallback. Public pages expose routes run, route participation, TPRR and recent-game splits, and state a 24–36 hour post-game update window.

### Primary official injury source — NFL.com
Use official NFL practice and game-status reports once regular-season reporting begins. Preserve the report date/time and never silently replace a newer official designation with older news.

### Injury/news fallback — FantasyPros
Use for training-camp injuries, practice absences/returns, beat-reporter sourced updates, and contextual role news between official NFL reports.

### Historical advanced verification — NFL Savant
Retain as a free historical/verification source for target share, air yards, EPA/CPOE, expected fantasy points and route-tree context. Do not depend on it as the live 2026 route feed because its current public dataset is labeled through 2025 and its route/charting data ultimately relies on nflverse/FTN sources.

### PFF public reports
Manual spot-check source only. Never make the model dependent on public article availability.

## Fallback hierarchy

1. Weekly utilization: Fantasy Life → StatRankings → nflverse snap/usage context.
2. Injuries: NFL.com official report → FantasyPros/current direct news context.
3. Historical/advanced verification: nflverse → NFL Savant → PFF public spot check.
4. Missing route data must not be invented.
5. Missing route participation alone does not block a stable established WR1/WR2 projection when other usage evidence is strong.
6. Missing route information for TEs, receiving RBs, fringe WRs, injury returns or changing roles reduces confidence and can trigger `REVIEW_REQUIRED`.
7. Sportsbook lines/prices are never substitutes for missing football-side data.

## Architecture order

The preferred build order is:

**safeguards → trusted football metrics → projection mechanics → player projection outputs → market comparison/EV**

That keeps the projection foundation auditable and prevents sportsbook information from contaminating the football model.

## Paid-feed trigger

Revisit paid data only if, during live weekly operation, the free hierarchy repeatedly fails to supply a materially important input with sufficient freshness or reliability. Until that happens, cost = **$0** for Step 1 data sourcing.

## Step 1 result

- Free current route/utilization path: **RESOLVED**
- Free official injury-status path: **RESOLVED**
- Free injury/news fallback: **RESOLVED**
- Historical advanced verification: **RESOLVED**
- Source fallback hierarchy: **RESOLVED**
- Paid feed required now: **NO**

Step 1 is complete.
