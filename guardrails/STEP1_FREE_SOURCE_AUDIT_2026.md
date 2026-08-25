# Step 1 — Free Weekly Data Source Audit (2026)

Status: **IN PROGRESS**

Goal: exhaust free, reproducible weekly NFL data sources before purchasing a paid feed. Paid data should only be introduced for a field that remains materially unavailable, stale, or operationally unreliable for pregame use.

## Current source hierarchy

### 1. nflverse / nflreadr — primary free backbone
Use for reproducible machine-readable football data: play-by-play, weekly player stats, team stats, schedules, rosters, weekly rosters, depth charts, snap counts, Next Gen Stats, and PFR advanced stats.

Important limitations:
- Participation data from 2023 onward is supplied after the postseason and therefore cannot serve as an in-season route feed.
- The nflverse injury source died after 2024, so current 2025+ injuries cannot currently be treated as available from nflverse.

### 2. Fantasy Life Utilization Report — primary free weekly route/utilization candidate
Observed public fields include:
- snap percentage
- routes / route percentage
- targets per route run
- targets / target share
- catchable targets
- aDOT
- air yards
- end-zone targets
- third/fourth-down targets
- play-action targets
- RB rush share
- inside-five rushing share
- short-down-and-distance snaps
- long-down-and-distance snaps
- two-minute snaps

This is currently the strongest free candidate for the route/role gap, especially TE, receiving RB, fringe WR, and role-change cases.

Before automated model use, validate a stable machine-readable extraction or export method and confirm that automation is permitted by the source's terms.

### 3. StatRankings — route-participation verification
The public route-participation page states that it updates within 24–36 hours post-game and provides season, Last 1, Last 3, Last 5, Last 10, home, and away route participation.

Use as a cross-check unless a stable automated extraction method is validated.

### 4. NFL Savant — advanced verification candidate
Candidate for route breakdowns, target share, air yards, EPA/CPOE, and advanced player context. Direct coverage, update cadence, and extraction method still require validation before model use.

### 5. PFF public weekly usage reports — manual spot-check source
Useful for manual verification of routes, TPRR, carries, red-zone usage, alignment, aDOT, and snaps when publicly exposed. Do not make this a required automated dependency.

## Step 1 completion criteria

Step 1 is complete only when all of the following are resolved:

1. A free 2026 current injury/practice-status source is validated.
2. Fantasy Life weekly utilization extraction is tested for reproducibility.
3. StatRankings route participation extraction is tested for reproducibility.
4. NFL Savant coverage/update cadence is validated or rejected.
5. A source fallback hierarchy is defined for stale/missing data.
6. Paid alternatives are priced only for fields that remain materially unresolved.

## Modeling rule

Routes are not a universal hard requirement for every established WR1/WR2. Prioritize route participation for TEs, receiving RBs, fringe/cusp WRs, injury returns, depth-chart changes, and other uncertain roles. For established full-time WRs, target share, TPRR, air-yard share, red-zone role, and other opportunity metrics often carry more incremental information than raw route participation alone.

## No-market-contamination rule

These sources are football-side inputs only. Sportsbook spreads, totals, player-prop lines, and prices remain downstream market data and must not be used to fit or backsolve the football projection probability.
