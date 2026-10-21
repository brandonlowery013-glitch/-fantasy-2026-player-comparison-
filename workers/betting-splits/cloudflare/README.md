# Cloudflare background market observations

`ctd-background-splits` receives a genuine Cron Trigger every 15 minutes. The SQLite-backed Durable Object saves timestamped splits and prop observations independently of browsers. Source is on `frontend/ctd-cloudflare-work`; source presence or a deployment alone is not proof that a timer ran.

Splits use the publicly rendered DraftKings table. Percentages describe that sportsbook only; handle share does not identify professional bettors. All stored observations retain their original timestamps and zero numeric model authority.

When `PROPS_RELAY_URL` is configured, the same timer checks player props. The existing Pages-side `ODDS_API_KEY` stays inside Pages. The Durable Object generates and privately stores an Ed25519 signing key; Pages pins its public key and accepts only signed, recent requests. Each signed request must claim a one-time nonce through the bound Durable Object before accessing the fixed Odds API host and permitted NFL endpoints. Public quote reads cannot perform paid collection. Provider errors retain the last successful observations and report failure.

Props refresh at most every two hours early in the week, every 90 minutes within 24 hours, 30 minutes within six hours, and 15 minutes within the final hour. A per-run 128-credit cap and 4000/2000/1000-credit reserves prioritize approaching kickoffs. A timer heartbeat is separate from a quote observation; unchanged checks never relabel old data as fresh. A successful event fetch replaces that event's current quote list, preserving older captures separately.

- Worker `/latest.json`, `/index.json`, `/history/YYYY-MM-DD.json`: saved DraftKings splits.
- Worker `/props/latest.json`, `/props/status.json`, `/props/index.json`: current prop observations and recent capture manifests.
- Worker `/props/history/<scheduled-time-ms>.json`: an immutable prop capture.
- Pages `/api/live/prop-quotes` and `?history=index` or `?history=<scheduled-time-ms>`: public saved prop reads.

The prop board reads compact current observations rather than the full historical ledger. An existing model evaluation is displayed only for the exact player, market, book, line and both offered prices. Changed quotes remain current market observations with model reevaluation pending; this cannot invent a new recommendation or change frozen model math.

Deployment uses Wrangler with this directory's configuration. Pages requires the `SPLITS_SCHEDULER` binding to this Worker and its existing Odds API secret. Keep the private signing key in durable storage; only its public JWK belongs in source. Verify actual Cron logs, matching durable capture IDs, current live API data, history retention and rejected unsigned/replayed collection requests. Local timer simulation or manually dispatching a job does not verify production scheduling.
