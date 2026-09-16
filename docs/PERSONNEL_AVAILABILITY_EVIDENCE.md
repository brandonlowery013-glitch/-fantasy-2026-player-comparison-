# Personnel availability evidence

The injury adapter previously used fetch time as freshness and could fall back
from an unresolved injury to a depth-chart active flag. That could make an old
report look current or imply availability despite a questionable/doubtful status.

The corrected path preserves the last reported designation and provider date until
superseded. The existing 12-hour rule labels update freshness, not whether the
reported designation is displayed. Fetching a report again does not reset that clock. A stale,
undated, future-dated, conflicting, questionable or doubtful report remains
UNKNOWN, even if a depth-chart active flag is present. A current explicit Out,
inactive report produces EXPECTED_INACTIVE. IR, PUP and suspension remain
expected absences until superseded, even when the report is older. Current
explicit positive reports retain the existing expected-active policy; this is
an expectation, not confirmation of the next game's active list.

ESPN sometimes omits athlete.id from injury reports. The parser recovers it from
ESPN-owned NFL player profile links. It never treats an injury report ID as a
player ID. A missing identity remains a clearly labeled name-only match. Reports
are selected by provider update time, and contradictory simultaneous reports
remain unresolved. Nested roster-status objects are not injury reports.

The collector retains report IDs, player IDs, source dates and parser version.
The append-only snapshot ledger is preserved. Ingestion resolves the latest
injury evidence before role flags, including explicit UNKNOWN that replaces old
active/inactive decisions. Normalization checks source age again, and matchup
attachment checks age again at read time. Each matchup carries a weekly injury summary for its two teams, with dated
designations, starter priority and observed depth-chart options. Active/resolved
reports are excluded from this summary but retained in underlying history. Depth
options are explicitly not confirmed replacements; no workload share is invented.
Long-term absences remain context rather than new breaking news.
Roster membership alone never implies game availability.

No new score coefficients, fantasy stat multipliers, or inferred replacement
starters are introduced. These corrections provide reliable inputs and dated
snapshots for subsequent personnel-effect validation; they do not establish the
numerical injury effect themselves.

Validation: scripts/test-injury-evidence.mjs covers identity recovery, newest
report selection, same-time conflicts, repeated-fetch isolation, future/missing
source dates, uncertain injury precedence, stale role flags, and expiry after
roster collection. Guardrail QA runs this test before release.
