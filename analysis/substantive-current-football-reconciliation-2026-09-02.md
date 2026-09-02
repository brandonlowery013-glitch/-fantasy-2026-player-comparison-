# Fantasy 2026 — Substantive Current-Football Reconciliation — 2026-09-02

Status: **ANALYSIS ONLY / NON-AUTHORITATIVE.** This checkpoint reconciles the identity-clean 42-player live NFL.com-primary + ESPN player-level candidate set against the current 166-player canonical model. It does **not** mutate True Value, Overall, projections, components, Market Value, or locked canonical files.

Universe: **166-player model with 162 current-cost records**.

Source hierarchy for this pass: NFL.com / official NFL evidence primary; ESPN athlete-specific, league, current-news and transaction evidence secondary. Shared-feed surname-only matches are prohibited by the production collision guard merged in PR #176.

## Reconciliation result

| Bucket | Count | Meaning |
|---|---:|---|
| A — REOPEN QUANTITATIVE REVIEW | 10 | Fresh football evidence can plausibly alter availability, role, environment, or connected opportunity and must be passed to the quantitative model bridge. |
| B — CURRENT-MODEL CONFIRMATION | 5 | Fresh evidence matters, but the present model already appears to reflect the condition/role; retain current values unless a quantitative recheck proves a material difference. |
| C — NON-SUBSTANTIVE / DISCARD TRIGGER | 27 | Identity match is real, but the source context is fantasy commentary, historical reference, contract/roster housekeeping, or otherwise not a new fantasy-model input. |
| **Total** | **42** | Every identity-clean trigger is accounted for. |

## Bucket A — reopen quantitative review

| Player | Reopen reason | Components implicated | Current handling |
|---|---|---|---|
| Jahmyr Gibbs | Isiah Pacheco IR creates a connected workload/opportunity signal; ESPN explicitly notes Gibbs may be busier. | Production, Role/Volume, Ceiling, Reliability | Recalculate connected opportunity; no automatic rank move. |
| Ashton Jeanty | Current ankle recovery remains relevant entering Week 1; official NFL reporting says another week of assessment is needed. | Availability, Reliability, Production, Ceiling | Recalculate availability/ramp uncertainty. |
| Tyler Warren | Current groin injury is a direct availability signal. | Availability, Reliability, Production | Recalculate only if current severity/timeline can be quantified. |
| Josh Jacobs | Commissioner Exempt placement creates a major availability/season-volume question. | Availability, Production, Role/Volume, Reliability, Ceiling | High-priority quantitative review. |
| Josh Downs | Current Colts role evidence places Downs with Alec Pierce as the top two WRs, ahead of Keenan Allen in the described pecking order. | Role/Volume, Production, Reliability | Reopen role check; preserve prior Step 3E HOLD unless quantified evidence justifies change. |
| Alec Pierce | Activated from PUP with current Week 1 optimism; direct positive availability/role signal. | Availability, Reliability, Production, Role/Volume | Recalculate recovery/active probability; no assumed full health. |
| Alvin Kamara | NFL.com reports he will be out at least a month. | Availability, Production, Reliability, Ceiling | High-priority downgrade review. |
| Isiah Pacheco | ESPN/NFL evidence indicates IR placement and at least four games missed. | Availability, Production, Role/Volume, Reliability, Ceiling | High-priority downgrade review; propagate connected opportunity. |
| Corey Kiner | Trade to New England materially changes team environment and possible role path. | Offensive Environment, Role/Volume, Production, Ceiling | Recalculate after depth-role reconciliation. |
| Jonnu Smith | Signed by Green Bay, creating a direct team/environment and target-competition change. | Offensive Environment, Role/Volume, Production, Ceiling, Reliability | Recalculate role/environment separately from the existing 0.005 score-integrity issue. |

## Bucket B — current-model confirmation / no immediate intrinsic move

| Player | Fresh evidence | Why not an automatic change |
|---|---|---|
| Christian McCaffrey | Returned to practice after a planned/precautionary absence. | Current model already carries a substantial availability discount and `SORENESS / PRECAUTIONARY CAMP WATCH`; this looks more like confirmation/positive resolution than a new negative shock. |
| Malik Nabers | Current reporting continues to frame health/recovery as a key question. | Recovery risk is already embedded. Require genuinely new practice/availability evidence before changing the numbers again. |
| George Kittle | Activated/reinstated from PUP. | Positive availability confirmation; if the model already assumed Week 1 return, avoid double-counting the recovery. |
| Tyrone Tracy Jr. | Evaluated for a head injury and cleared. | Cleared status removes the immediate concern; no season-long downgrade without a continuing restriction. |
| Kyler Murray | Named Minnesota starter. | Starter status appears consistent with the model's working role assumption; verify current canonical assumption, but do not reward the same role twice. |

## Bucket C — non-substantive / discard trigger

These players had real identity matches but the matched context is not a fresh quantitative football input for the intrinsic model. They remain eligible for future review if new role/injury/transaction/practice evidence appears.

- Bijan Robinson — fantasy/historical rushing reference, not a new role or health change.
- Jonathan Taylor — comparative fantasy discussion; the prior Patrick Taylor surname collision is separately blocked by the production regression test.
- Trey McBride — comparison inside another player's fantasy analysis.
- DeVonta Smith — historical/award reference.
- Chris Olave — fantasy target-share comparison, not a new team/role fact.
- Jameson Williams — speculative/bold-prediction content.
- Ladd McConkey — fantasy draft commentary rather than new medical/role evidence.
- DJ Moore — mention inside Colston Loveland fantasy analysis.
- Lamar Jackson — fantasy draft/contract-extension context, not a new 2026 fantasy input.
- Colston Loveland — fantasy analysis rather than a new practice/role event.
- Bucky Irving — fantasy draft commentary.
- Joe Burrow — historical/backup/Aaron Donald retrospective context.
- Mike Evans — fantasy draft commentary.
- Justin Herbert — fantasy draft commentary.
- Jalen Hurts — roster housekeeping about carrying four quarterbacks; no new Hurts role signal.
- Jakobi Meyers — fantasy commentary without new role/injury evidence.
- Trevor Lawrence — future contract/roster context rather than current fantasy role change.
- DK Metcalf — salary restructure/fantasy commentary; cap mechanics do not alter intrinsic fantasy value by themselves.
- Xavier Worthy — speculative/bold-prediction content.
- Rashid Shaheed — fantasy draft commentary.
- Tucker Kraft — extension/contract context, not a new football-volume or health input.
- Darnell Mooney — roster-room listing in unrelated context.
- Matthew Stafford — historical/current MVP discussion rather than a new health/role event in the matched evidence.
- Baker Mayfield — backup-quarterback roster article; no new Mayfield role signal.
- Tyler Shough — backup/DST-streaming context, not a new intrinsic fantasy input.
- Sam Darnold — historical Vikings reference.
- C.J. Stroud — future contract-extension discussion rather than a current fantasy-model change.

## Connected-impact requirements carried forward

The quantitative pass must evaluate both the directly affected player and materially connected modeled teammates. At minimum:

- Pacheco IR → Gibbs workload/opportunity and any other modeled backfield/receiving beneficiaries.
- Jacobs exempt status → Green Bay backfield opportunity redistribution.
- Kamara absence → New Orleans backfield/target redistribution.
- Kiner trade → New England backfield competition and the vacated-origin-team opportunity, where modeled players are affected.
- Jonnu Smith signing → Green Bay TE/receiver target competition and offensive-environment effects.
- Pierce/Downs availability-role evidence → Indianapolis target hierarchy and QB-environment linkage.

Connected effects must not be assumed directionally without depth/usage evidence.

## Quantitative bridge rules for the next operation

1. Raw news cannot directly change component scores.
2. Convert accepted Bucket A evidence into structured football variables first: availability probability, expected games/ramp, role/share, target/carry opportunity, QB/team environment, and uncertainty.
3. Apply existing calibrated priors, rookie/no-history logic, shrinkage, historical error distributions and other embedded model equations where applicable.
4. Recalculate only components supported by evidence.
5. Any consequential existing-player change must be presented as exact **Current → Proposed** before canonical mutation.
6. Market ADP/ECR remains downstream and cannot modify intrinsic True Value.
7. Bucket B players default to `REVIEW_NO_CHANGE` unless the quantitative recheck finds a genuine delta.
8. Bucket C triggers are closed for this evidence snapshot and do not enter the equations.

## Checkpoint

**Edge / Opportunity Screen ✅ → identity/source cleanup ✅ → substantive reconciliation ✅ → NEXT: quantitative evidence packets for Bucket A (plus Bucket B verification), followed by exact Current → Proposed proposals for user approval.**
