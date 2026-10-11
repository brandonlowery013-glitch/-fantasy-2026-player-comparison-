# October 11 source repair evidence

Candidate repair based on main 624dd000643615897e0518c1f31549d43ac63254. This record describes local candidate results, not a deployed release.

- Canonical manifest and shards: 197 unique players, 16 shards. Existing accepted admissions and immutable package files are unchanged; the queue contains no incomplete accepted entries.
- Review rebuilt from actual sources: 197 rows; 196 successful ESPN player-news calls, Kenneth Gainwell unresolved; 78 NFL structured article bodies. Original review had 167 rows and a 14-shard header. Prior per-player review metadata and existing connected-player decisions are retained.
- ESPN team injury endpoint returned an empty object. Event ingestion now uses the league injury list with validated 32-team IDs and the existing dated injury parser. Depth ranks use explicit rank or typed position array order. Empty schemas cannot certify observed depth/roster health.
- Live candidate event-state: 800 injury reports, 798 bound availability records, 599 depth records. Parser recovery is a baseline, not 598 invented role changes. Report age alone does not create availability events. Existing append-only event history remains intact.
- Weekly ranks hold retained OUT/inactive designations when the 12-hour freshness window expires. Stale does not mean cleared. Ten requested Week 5 names have null weekly rank and score and weekly_actionable=false. Season-long values and original forecasts are unchanged.

## Validation and blockers

Event source/weekly hold regression, existing injury evidence tests, event contract, event state self-test, full-universe validator regression and hard Guardrail QA ran. Frozen baseline drift comparator PASS after full history was available. Hard QA had zero BLOCKED checks and three REVIEW_REQUIRED checks for old season-long odds and insufficient betting calibration; remote full workflow remains required.

Actual review validation remains BLOCKED with 147 connected candidate disposition/onboarding errors. A live canonical team identity check also fails for Kaytron Allen (WAS canonical, MIA observed). No team/season-long values were silently rewritten and no missing admission scores or packages fabricated. Kenneth Gainwell lacks a resolved live identity. The review source-quality record explicitly retains the identity failure.

## Consumer receipt and Week 5 probabilities

On October 11 at about 10:01 AM Chicago time, deployed /api/live/model, /api/live/betting and /api/live/bundle returned JSON. Betting receipt was Week 5, READY, 15 games; 14 had published model probabilities. The TB-DAL recommendation is absent. Its football projection status is NO_ORIGINAL_PREGAME_FORECAST: kickoff passed before a valid forecast was saved. Do not reconstruct an original forecast or fabricate probability to fill that gap. PHI-JAX displayed 27.2%/72.8% conditional win/loss chances, distinct from the unconditional 26.5%/70.9% and 2.6% tie chance.

The player probability producer also contains 596 SHADOW_ONLY stat distributions for Week 5. All 197 player projection records are REVIEW_REQUIRED; normalized context has 193 REVIEW_REQUIRED and four PASS records. Those are published shadow distributions, not validated actionable player probabilities. Availability/core-context and production-trust gates remain in effect.

The preview also showed FEED_UNAVAILABLE and console feed timeouts. A Cloudflare CPU-limit response was not reproduced in these endpoint reads. The approximately 3 MB live bundle still parses and serializes the published betting feed on each request; a separate consumer candidate forwards validated published bytes, preserving exact envelopes without request-time model work. Local tests do not establish deployed CPU recovery.

No paid collectors, new schedules, bypassed protections or automatic consequential season-long promotion were used. Protected PR QA and postmerge main-to-preview receipt are still required. Excel/Word regeneration is not claimed complete.

## Universal injury/ranking/news feature refinement

User steering: Q alone must not change rank or projected points, and all player names need visible status/reason/news through normal publication. Questionable now adds zero injury score/mean/uncertainty effect; an explicit regression checks Q against the same baseline and confirms Doubtful can still apply sourced adjustments. Current roster/depth supports a normal fantasy rank without inventing game-day activation. All OUT/inactive/IR/PUP/NFI/suspended players are excluded from usable weekly starts. Current cached FantasyPros IR data closes missing ESPN designation coverage, with exact season/name/team/position binding, explicit missing provider timestamps, and retained reference designations on a source failure.

The offline player detail feed is a required publisher output: 197 canonical profiles, 50 tagged injuries, 161 profiles with recent news, plus 2,353 additional unique roster profiles with no invented model ranks or point projections. The existing Excel and Word publishers now regenerate from this same Week 5 ranking data and pass byte/data parity. Chase shows Q/concussion from FantasyPros and the separate ESPN Active update at 10:40 AM Chicago time; the source difference remains visible.

The order-of-operations contract is dynamic against the canonical manifest (currently 197), and explicitly requires player detail publication before interface release. Step 24 and the existing ranking/news publishers build, validate, and stage the profile artifact. Coverage, dated news, unranked absences, and Q-only numerical invariants have validators. The shared frontend replaces the browser alert and applies badges/details to board, compare, weekly, props, Role Watch and game-player names. Local checks are not a deployed-receipt claim.
