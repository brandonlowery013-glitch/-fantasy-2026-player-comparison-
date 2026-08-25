# Repository Protection Requirement

The `main` branch must be protected before EV/probability development is considered production-safe.

Required GitHub ruleset:

- Ruleset name: `Main Guardrail Protection`
- Enforcement status: Active
- Target branch: `main`
- Require a pull request before merging
- Required approvals: 0 unless an external reviewer is intentionally added
- Require status checks to pass before merging
- Required status check: `Guardrail QA / guardrail-qa` (or the exact `guardrail-qa` check name shown by GitHub)
- Require branch to be up to date before merging
- Block force pushes
- Restrict deletions
- No bypass actors, when GitHub permits

Rationale: the Guardrail QA workflow can detect a bad model change, but only repository rules can prevent a failed check from being bypassed by a direct push or merge.

EV/probability work remains in SHADOW / NON-ACTIONABLE mode until this protection is confirmed active.
