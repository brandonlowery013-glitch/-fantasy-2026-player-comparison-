# Background betting splits

The default-branch `Background Betting Splits` workflow collects DraftKings' public NFL table at UTC minutes 7, 22, 37 and 52 every hour, without a browser or paid odds API call. This covers Tuesday, Thursday, Saturday and the two-hour pregame period with a finer cadence. GitHub schedules are best effort and may be delayed; this is not an exact two-hours-before-kickoff guarantee.

It binds table dates and teams to ESPN's upcoming schedule, validates bet and handle percentages, and excludes observations after kickoff. Percentages describe DraftKings only. Dollar share does not establish professional bettor activity. Each observation includes its quoted odds/line labels; changed lines remain distinct evidence, not a purported same-line percentage trend.

Publication uses the job-scoped built-in workflow token, not a personal access token. A dedicated `data/betting-splits` branch keeps display collections outside the model writer queue. One atomic Git commit updates latest.json, status.json, index.json and history/YYYY-MM-DD.json under data/betting-splits. Prior daily observations are preserved, including unchanged percentages; workflow run IDs make retries idempotent. No model or recommendation is changed.

Failed collections publish FAILED status, retain the last successful data and history, and fail the workflow. Read/write or authentication failures also fail the workflow. The live endpoint prefers these saved publications. After 15 minutes it labels a late background feed DELAYED; after 35 minutes or a reported failure it labels it STALE. During a delay it can use the existing bounded on-demand public-table backup to keep displayed odds fresh. Live backup observations are labeled separately and do not change the background collection timestamp or pretend to be saved job observations. PARTIAL identifies incomplete market coverage; IDLE means no upcoming games in the selected schedule.

- `/api/live/splits`: latest saved percentages, per-market timestamps and collection health.
- `/api/live/splits?history=index`: available UTC archive dates.
- `/api/live/splits?history=YYYY-MM-DD`: all saved captures for that UTC date, with the triggering event and workflow URL.

The UI shows background collection status, the last successful job time, live-backup activity, stale/archived market timestamps, and a background-history link. `last_attempt_at`, `last_success_at` and each market's `observed_at` are separate: checking a saved file never makes old percentages fresh.

Verification requires an actual Actions run with `event: schedule`, a successful publication commit and matching archived capture ID, plus the live API serving that observation. A manual workflow dispatch alone does not prove the timer ran.
