# October 11 source repair evidence

Candidate repair based on main 624dd000643615897e0518c1f31549d43ac63254. This record describes local candidate results, not a deployed release.

- Canonical manifest and shards: 197 unique players, 16 shards. Existing accepted admissions and immutable package files are unchanged; the queue contains no incomplete accepted entries.
- Review rebuilt from actual sources: 197 rows; 196 successful ESPN player-news calls, Kenneth Gainwell unresolved; 78 NFL structured article bodies. Original review had 167 rows and a 14-shard header. Prior per-player review metadata and existing connected-player decisions are retained.
- ESPN team injury endpoint returned an empty object. Event ingestion now uses the league injury list with validated 32-team IDs and the existing dated injury parser. Depth ranks use explicit rank or typed position array order. Empty schemas cannot certify observed depth/roster health.
- Live candidate event-state: 800 injury reports, 798 bound availability records, 599 depth records. Parser recovery is a baseline, not 598 invented role changes. Report age alone does not create availability events. Existing append-only event history remains intact.
- Weekly ranks hold retained OUT/inactive designations when the 12-hour freshness window expires. Stale does not mean cleared. Ten requested Week 5 names have null weekly rank and score and weekly_actionable=false. Season-long values and original forecasts are unchanged.

## Validation and blockers

Event source/weekly hold regression, existing injury evidence tests, event contract, event state self-test, full-universe validator regression and hard Guardrail QA ran. Frozen baseline drift comparator PASS after full history was available. Hard QA had zero BLOCKED checks and three REVIEW_REQUIRED checks for old season-long odds and insufficient betting calibration; remote full workflow remains required.

Actual review validation remains blocked by connected candidate dispositions/onboarding requirements. A live canonical team identity check also fails for Kaytron Allen (WAS canonical, MIA observed). No team/season-long values were silently rewritten and no missing admission scores or packages fabricated. Kenneth Gainwell lacks a resolved live identity. The review source-quality record explicitly retains the identity failure.

## Consumer receipt and Week 5 probabilities

On October 11 at about 10:01 AM Chicago time, deployed /api/live/model, /api/live/betting and /api/live/bundle returned JSON. Betting receipt was Week 5, READY, 15 games; 14 had published model probabilities. The TB-DAL recommendation is absent. Its football projection status is NO_ORIGINAL_PREGAME_FORECAST: kickoff passed before a valid forecast was saved. Do not reconstruct an original forecast or fabricate probability to fill that gap. PHI-JAX displayed 27.2%/72.8% conditional win/loss chances, distinct from the unconditional 26.5%/70.9% and 2.6% tie chance.

The preview also showed FEED_UNAVAILABLE and console feed timeouts. A Cloudflare CPU-limit response was not reproduced in these endpoint reads. The approximately 3 MB live bundle still parses and serializes the published betting feed on each request; a separate consumer candidate forwards validated published bytes, preserving exact envelopes without request-time model work. Local tests do not establish deployed CPU recovery.

No paid collectors, new schedules, bypassed protections or automatic consequential season-long promotion were used. Protected PR QA and postmerge main-to-preview receipt are still required. Excel/Word regeneration is not claimed complete.
