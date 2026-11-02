# Retired one-time UI patch workflows

These 14 workflow definitions are preserved byte for byte from main commit 53c5a8a28b783924caaba801528dda6611fc7a93 for audit history. Their .txt extension and location outside .github/workflows prevent GitHub Actions from executing obsolete UI rewrites. Several have malformed YAML heredocs; others contain superseded 162/166-player assumptions or August cache stamps.

The historical final-162-qa-publish.yml has been replaced at its original active path by read-only 197-player validation because universe reconciliation references that filename. The replacement cannot commit or publish model changes. Active weekly player learning, game-model publishing, settlements, and required Guardrail QA workflows remain in place. Approval-expiration failures are separate from these malformed definitions and are not resolved by archiving them.

The historical Full Overall Backwards Audit workflow is also retired: its 166-player and preseason subject-binding contract cannot validate the current 197-player live universe. Its original workflow and audit scripts remain available for historical review. The active 197-player read-only QA, full-universe news review and protected Guardrail QA remain enforced.
