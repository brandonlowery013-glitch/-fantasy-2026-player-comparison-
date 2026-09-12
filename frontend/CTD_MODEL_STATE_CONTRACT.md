# Chuck The Duke — Model State Contract

This contract applies to the deployable frontend on `frontend/ctd-cloudflare-work`.

## Source preservation

The frontend must preserve backend state fields exactly when present:

- `status`
- `mode`
- `actionable`
- `football_projection_mutation_allowed`
- `week`
- `generated_at`

A successful HTTP/JSON fetch means only that the feed loaded. It MUST NOT be converted into `READY`, `ACTIONABLE`, or equivalent unless the backend explicitly supplies an actionable state.

## Required behavior

- `SHADOW_ONLY` remains `SHADOW_ONLY` in the UI.
- `actionable:false` disables betslip and ticket-building execution controls.
- Non-actionable recommendations may be displayed only as analysis/reference and must be labeled accordingly.
- `READY` in `final-betting-ui-feed-2026.json` does not override a non-actionable `weekly-game-market-recommendations-2026.json` state.
- Feed errors fail closed: actionable controls remain disabled.

## Implementation

Runtime: `frontend/runtime-model-state-semantics-2026.js`

The runtime exposes `window.CTD_MODEL_STATE_2026` and DOM dataset fields:

- `data-ctd-model-status`
- `data-ctd-model-mode`
- `data-ctd-model-actionable`
- `data-ctd-final-betting-status`

This contract changes frontend interpretation only. It does not mutate model calculations, recommendations, football projections, or production workflows.
