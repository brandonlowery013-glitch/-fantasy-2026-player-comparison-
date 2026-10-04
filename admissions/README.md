# Canonical player admissions

This directory is the fail-closed handoff between the full-universe discovery review and the canonical 2026 player model.

## Contract

1. The live review may identify an untracked player as `ADMIT`, but it may not mutate `players*.json`, ranks, projections, or `MODEL_SOURCE_OF_TRUTH.json`.
2. `scripts/stage-admission-requests.mjs` creates or refreshes a deterministic entry in `admissions/queue.json`.
3. The full-development sweep must treat the canonical count as fluid. For an `ADMIT`, the same cycle must provide a reviewed calibration (`calibration.reviewed=true` plus the complete candidate `player_record`) or fail closed as an incomplete admission; it may not silently leave a valid ADMIT parked indefinitely. `scripts/stage-admission-requests.mjs` persists that reviewed calibration and `scripts/build-admission-package.mjs` deterministically constructs the complete post-state package from the CURRENT source-of-truth count, shifting ranks and shards as needed. The builder never invents component scores or projections.
4. `scripts/process-admissions.mjs <candidate_id>` validates the package and complete proposed post-state without writing anything.
5. `scripts/process-admissions.mjs --apply <candidate_id>` writes only after every invariant passes. It then marks the queue entry complete and creates `admissions/completed/<candidate_id>.json`.
6. Guardrail QA blocks a review that calls a player `ADMIT` while the corresponding onboarding request is incomplete.

## Required package shape

A package must use `version: 1`, match the queue identity, and include reviewed calibration metadata (`method`, `generated_at`, `source_run`, `reviewed: true`). `integration` must declare the expected before/after player and shard counts and provide complete JSON replacements under `canonical_files`.

The replacement set must include:

- `MODEL_SOURCE_OF_TRUTH.json`
- at least one `playersN.json` shard
- `guardrails/universe-change-manifest.json`

The engine treats those replacements as outputs of the calibrated model pipeline, not inputs to a new scoring formula. Before apply it reconstructs the proposed active universe and verifies exact player count, unique names, exactly one copy of the admitted player, contiguous `o` and `tr` ranks, required numeric fields, configured component bounds, and a sourced universe-change manifest entry.

This design deliberately makes a missing or incomplete model package a hard stop rather than silently assigning placeholder values.

## Fluid-universe rule

`MODEL_SOURCE_OF_TRUTH.active_player_model` is the current count, never a ceiling. Every admission package is built against the count and shard total that exist at run time. A valid reviewed ADMIT therefore advances N → N+1 through the normal package validation, Guardrail QA and protected merge path. Missing reviewed calibration is a blocking error to surface and fix in the same development cycle, not a reason to redefine the candidate as WAIT or freeze the universe at a historical count.
