# Cloudflare background betting splits

Status: prepared and locally tested; not deployed or timer-verified.

A standalone Cloudflare Worker receives `*/15 * * * *` Cron Triggers. Its private SQLite-backed Durable Object collects the public DraftKings ticket and handle percentages plus exact displayed odds for upcoming ESPN schedule events. No browser or open app is required. This is DraftKings-only data; handle share does not identify professional bettors. Numeric model authority remains zero.

Each successful timer event atomically saves an immutable snapshot, latest publication, date index and status. The capture ID is `cloudflare:<scheduledTime>`. Repeated events are idempotent. Failures update status, retain prior snapshots and last-good data, and throw so Cloudflare records a failed invocation. Public GET routes only read saved data; there is no public collection endpoint.

Configure the Pages preview environment with a service binding named `SPLITS_SCHEDULER`, targeting `ctd-background-splits`. The app prefers this binding and retains earlier GitHub history when reading archives. Until this binding exists it continues using the previous GitHub collector. Delayed saved data may use the existing request-driven live quote backup, explicitly labeled separately from archived timer observations.

Deploy with Wrangler using this directory's configuration after authenticating through device authorization (`wrangler login --device --browser=false`). Do not open or automate Firefox. Do not disable the existing GitHub timer until a genuine Cloudflare scheduled event is recorded, its capture is present in dated history, and the live app reads the same capture ID. Run a second real timer and confirm the first snapshot is unchanged. A manual HTTP request, local scheduled test or deployment success alone does not verify timer execution.

The SQLite-backed Durable Object is supported on Workers Free; this configuration does not purchase or upgrade a plan. Check the actual account plan and deployment limits before rollout. Keep source in GitHub and run collection on Cloudflare.
