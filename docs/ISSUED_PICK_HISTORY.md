# Pick publication history

The final betting feed builder appends decision revisions to `data/market/issued-pick-history-2026.json`. Production workflows persist the history and feed in the same guarded change. A row is a publication candidate captured at build time, not proof of a wager, an individual visitor seeing a selection, or an earlier issue time.

Game spreads, totals, moneylines and player props retain selection, line, offered odds, win/push probabilities, bookmaker, source quote/model timestamps, snapshot ID, game identity, model version when supplied, availability state, source commit and revision linkage. An absent model version is explicitly NOT_PUBLISHED; no version is invented. PASS, WAIT and withdrawals cannot delete earlier PICK rows. Historical rows are never recomputed by this capture module.

Only active-week, identifiable pregame records with valid source timestamps are captured. Picks missing prices or probabilities are skipped. The same decision state does not generate a new row just because the job runs again. Each changed state receives a unique record ID and points to its predecessor. Post-kickoff capture is excluded; missed captures cannot be backfilled as authentic pregame records.

Capture starts with deployment. It does not turn reconstructed Week 1 outputs into frozen issued bets. Settlement and stat-correction records should later reference record_id and append their own revisions; this change does not infer or fabricate settled results. Parlay ticket history is not captured by this module.

Validation: `node scripts/test-issued-pick-history.mjs`, plus the final-feed self-test. Tests cover immutable revisions, duplicate suppression, withdrawals, future timestamps, kickoff and week restrictions, malformed ledgers, incomplete picks, prop game mapping and PICK-to-WAIT preservation.
