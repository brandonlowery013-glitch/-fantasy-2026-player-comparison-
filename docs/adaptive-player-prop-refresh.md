# Adaptive player prop refresh

The player-prop loop is keyed to each individual NFL game's kickoff time.

- More than 48 hours before kickoff: use The Odds API event-markets endpoint every 6 hours only until one of the configured player-prop markets is observed. When discovered, fetch the available configured prop markets once, store the first observed snapshots as `EARLY`, and pause that game's prop refresh until T-48h.
- T-48h to T-24h: refresh every 3 hours.
- T-24h to T-6h: refresh every 90 minutes.
- T-6h to T-1h: refresh every 30 minutes.
- Final hour: refresh every 15 minutes.
- At kickoff: stop pregame prop refresh. Closing-snapshot derivation remains downstream.

The cadence is per event, so Wednesday, Thursday, Saturday, Sunday, and Monday games enter their active windows independently.

Quota protection is based on The Odds API remaining-credit response headers. Early and lower-priority refreshes are reduced first as the configured reserve thresholds are approached. Sportsbook data remains downstream-only and cannot mutate football projections, fantasy True Value, Overall rankings, or comparison winners.

## Full roster coverage and early additions
The collector resolves sportsbook names against the two teams in the event and their full personnel rosters, including suffix normalization and position constraints. Raw offers remain visible even when the player is outside the model universe. Unresolved/ambiguous identities remain market-only and cannot create a model pick. Source name, roster athlete ID, team and resolution status accompany new records. Historical snapshots are unchanged.

Beyond 48 hours, check available market types every six hours; capture new market types immediately and refresh existing types at most daily to catch new players. Market discovery costs one credit and does not reveal player names, so it cannot replace periodic price capture. Existing near-kickoff cadence and quota reserve gates remain. A coverage-version migration allows one corrective capture on the next due discovery. Per-run request costs respect the configured cap.
