# Chuck The Duke Interface LOCK1 — Frozen Baseline

Status: **FROZEN / DO NOT EDIT**

This manifest establishes the canonical visual/interface baseline for the Chuck The Duke frontend transition.

## Baseline artifact

- Filename: `Fantasy_2026_v47_CTD_INTERFACE_LOCK1_2026-09-06.html`
- Interface lock ID: `CTD_INTERFACE_LOCK_1`
- Source artifact: preserved ChatGPT Library copy
- Raw file size: `2,885,920 bytes`
- Raw file SHA-256: `c75abbbe698c4f278fdc3b780f6fdb6add177c1cacec4f08f342730d910d2b70`
- Internal lock metadata present in artifact: `<meta name="ctd-interface-lock" content="CTD_INTERFACE_LOCK_1">`

## Canonical model boundary

- Canonical active player universe: **166 players**.
- The LOCK1 artifact is a visual/interface baseline only. Any stale embedded player snapshot inside the artifact is **not** a canonical model source and must not override the 166-player source of truth.
- Player Evaluation, dynamic News, True-Value/Overall/Market boards, betting pipelines, Guardrail, Step24, Live News, and production workflows remain governed by their existing canonical GitHub sources and workflows.

## Transition rule

1. Never modify this baseline artifact in place.
2. Never use the existing root `index.html`, GitHub Pages shell, or comparison page as a substitute for this visual contract.
3. Build the deployable frontend as a separate working implementation derived from LOCK1.
4. Working frontend data must be loaded from canonical published GitHub outputs rather than stale embedded snapshots.
5. Cloudflare deployment must consume the working frontend from GitHub; Cloudflare is not an independent source of code.

## Baseline branch

This manifest was created on `frontend/ctd-lock1-baseline` from main commit:

`fd50f1442e43bc3f7c0a97e274b3e756eb9f0ae7`

The branch exists to preserve the transition starting point without changing `main` or any production workflow.
