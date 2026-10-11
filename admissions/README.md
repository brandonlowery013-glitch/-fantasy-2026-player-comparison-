# Canonical player admissions

The source-of-truth count is the current universe, never a ceiling. Each accepted admission advances the count read at runtime from N to N+1. Shards expand when the last current shard reaches the existing shard capacity.

An ADMIT sweep runs `scripts/stage-admission-requests.mjs`, preserves prior evidence and decisions, and calls the package generator immediately. No manually prebuilt package is required. Reviewed inputs belong in `admissions/inputs/<candidate_id>.json`; preserved calibration records remain supported. `scripts/generate-admission-package.mjs` writes a staged dossier with the exact missing inputs or a complete calibrated package. `scripts/build-admission-package.mjs` is the compatible entrypoint for the same generator.

Required inputs are current sourced roster/role identity, reviewed calibration method and source run, sourced ROS PPR projection, reviewed component targets, Overall/Actionable insertion placement, comparison writeups, and sourced HOLD reviews for connected canonical teammates. Expected production can be derived from the existing nearest-12 same-position regression; the six other component targets require supported model inputs. The existing seven weights compute True Value. ECR and archival ADP never manufacture scores or determine placement.

`node scripts/process-admissions.mjs <candidate_id>` generates a missing package and validates the proposed state. `--apply` applies only after validation, on a candidate branch through protected PR flow. The workflow rejects main-branch writes. Counts, ranks, positional ranks, all shards, current patch, both boards, locked ranks, source of truth, Guardrail configuration, manifest, completion ledger and deterministic Excel export synchronize together. Existing component scores, projections and relative ranking orders remain protected. A baseline hash rejects stale packages; regenerate each next candidate against the accepted current state. Writes roll back together on failure.

New rows start with `PRICE PENDING` and inactive draft ADP. Weekly source and projection membership is staged as `REVIEW_REQUIRED`, nonactionable, with no invented weekly numbers. Current-week football calibration is a separate requirement before actionable weekly projections. The website reads its own deployed source of truth and all declared shards plus the current patch, with no shard-count ceiling. The True Value and Overall/Actionable views, comparisons and downloadable Excel use those rows. `scripts/validate-canonical-consumers.mjs` verifies the checked-in workbook exactly against the same rows; `--write-excel` regenerates it.

Missing supported inputs remain explicit blockers in `admissions/staged`, rather than fabricated scores or a downgraded ADMIT decision. Guardrail QA blocks incomplete admissions. No protected-main or Guardrail requirement is bypassed. Historical draft market boards remain archival; their stale count is reported rather than silently repriced into season-long rankings.

The October 3 reconciliation preserves the earlier queue and review in `admissions/history` and records current evidence and decisions for all 30 named cases in `admissions/reconciliation-2026-10-03.json`.

## Word profiles and rank changes

Each accepted admission regenerates the Excel workbook and Word profiles from the same proposed canonical players. Both exports are committed in the admission transaction and recorded by SHA-256 in the completion manifest. A failed export prevents completion. The website also builds both downloads from its loaded canonical roster.

Current Overall, True Value and positional ranks reflow when a player is inserted. Completion records preserve every existing player's before and after Overall and True Value ranks. Original pregame predictions and settled results are not rewritten. Any historical reranking must be a separate, dated retrospective using evidence available at the requested historical cutoff.
