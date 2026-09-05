// Canonical orchestration for retroactive position-specific transition evidence.
// Module caching is intentional: integrate-transition-intelligence.mjs imports the
// same builders, so pre-running them here guarantees the quality-filtered state is
// the state consumed by chronology and final integration.
await import('./normalize-tracked-signal-teams.mjs');
await import('./build-rookie-development-review.mjs');
await import('./enforce-offensive-transition-clusters.mjs');
await import('./build-retroactive-camp-backfill.mjs');
await import('./filter-retroactive-position-evidence-quality.mjs');
await import('./sanitize-transition-evidence-locality.mjs');
await import('./build-chronological-transition-context.mjs');
await import('./integrate-transition-intelligence.mjs');
