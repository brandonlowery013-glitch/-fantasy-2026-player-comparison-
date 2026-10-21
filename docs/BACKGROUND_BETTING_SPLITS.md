# Background betting splits

Cloudflare executes the production collector every 15 minutes (`*/15 * * * *`) whether or not the app is open. Source is under `workers/betting-splits` on `frontend/ctd-cloudflare-work`; the deployed Worker is `ctd-background-splits`. Pages uses the `SPLITS_SCHEDULER` service binding. The GitHub collector is retained for explicitly requested manual archive captures, with automatic execution disabled after Cloudflare rollout verification.

A private SQLite-backed Durable Object binds DraftKings' publicly rendered NFL table to ESPN's upcoming schedule, validates percentages and excludes observations after kickoff. Each successful Cron Trigger atomically saves latest data, collection status, a date index and an immutable snapshot. Capture IDs contain Cloudflare's scheduled timestamp. Duplicate deliveries do not rewrite snapshots. Failures retain last-good data, save FAILED status and fail the scheduled invocation. Public GET requests read saved data and cannot trigger this collector.

Percentages describe DraftKings only. Bets are ticket share; money is handle share, not identified professional bettors or consensus across all sportsbooks. Original line/odds labels and timestamps are retained. Changed lines remain distinct evidence. Numeric model authority is zero; no recommendation changes automatically.

The Pages reader combines earlier GitHub archives with Cloudflare history. It labels delayed collections and can use the bounded existing request-driven quote backup while retaining the true background timestamp and status. A live backup is not falsely presented as a saved scheduled observation.

- `/api/live/splits`: latest percentages, original per-market timestamps, and collection health.
- `/api/live/splits?history=index`: available UTC archive dates across both stores.
- `/api/live/splits?history=YYYY-MM-DD`: all retained observations for that UTC date.

The timer covers Tuesday, Thursday, Saturday, Sunday and the period two hours before kickoff with a finer 15-minute cadence. Cron delivery can be delayed; this is not an exact kickoff-relative execution guarantee. Current/fresh status uses the original successful capture, not the time a user checks a saved file.

Verification requires an actual Cloudflare log with a successful Cron event, a matching durable snapshot/capture ID, and the live app serving that same capture. Local scheduled tests, manual HTTP requests and deployment success alone do not prove the timer works.
