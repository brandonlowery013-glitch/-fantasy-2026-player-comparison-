# Regular-Season Monitoring Guardrail

## Purpose
Prevent missed fantasy-relevant role/opportunity changes during the 2026 NFL regular season by requiring a complete transaction, depth-chart, connected-player, and actual-usage reconciliation before a monitoring pass can close.

## Scope
Applies to the full 162-player Fantasy 2026 universe and to any non-universe player whose transaction, activation, removal, or usage change can materially affect a tracked player's opportunity.

Training-camp and preseason role competitions are out of scope once the regular season begins. Practice reports may be used only for official availability context.

## Mandatory monitoring order
Every regular-season monitoring pass must complete all of the following before concluding that there is no material change:

1. Transaction sweep
   - Trades
   - Signings
   - Waivers / claims
   - Releases
   - IR / PUP / NFI placement or activation
   - Commissioner Exempt List
   - Suspensions
   - Inactive status
   - Practice-squad elevations when materially relevant
   - Depth-chart promotions/demotions tied to actual roster or game-status changes

2. Team depth-chart delta
   - For every transaction or availability change, compare the affected team's RB/WR/TE/QB depth chart with the previous monitoring state.
   - Do not evaluate the moved player in isolation.

3. Connected-player reconciliation
   - Identify every tracked player on the affected team whose routes, targets, carries, touches, target share, route participation, third-down/two-minute work, red-zone usage, goal-line work, or contingent injury value could materially change.
   - Also evaluate tracked players on the player's former team when a departure can free meaningful opportunity.

4. Mandatory acquisition/departure trigger
   - Any RB, WR, or TE acquired or removed from a team containing a top-162 tracked player automatically triggers a connected-opportunity review.
   - This trigger applies even when the moved player was not previously fantasy relevant.
   - Example pattern: starting RB unavailable + team acquires another RB = mandatory reevaluation of the starter, existing backup(s), and new acquisition before the pass can close.

5. Actual regular-season usage review
   Once games have begun, evaluate real evidence rather than camp narratives:
   - Snaps and snap share
   - Routes and route participation
   - Targets and target share
   - Carries / touches
   - Third-down and two-minute work
   - Red-zone and goal-line work
   - Depth-chart changes confirmed by game usage
   - Transactions, suspensions, inactive status, and returning injured players

6. Baseline discipline
   - Never downgrade a player merely because another fantasy-relevant teammate exists.
   - Normal established coexistence is not a material change unless allocation changes from the expected baseline.
   - A change requires evidence that opportunity, role, availability, or contingent value materially moved.

7. Required disposition
   Every newly discovered transaction, availability event, or material usage signal affecting a tracked player's team must receive one explicit disposition before the monitoring pass can close:
   - CHANGE — model/board/market/role input should move now.
   - HOLD — evidence reviewed; no change to current values.
   - WAIT — potentially material but insufficient evidence for a model move yet.
   - NOT MATERIAL — reviewed and explicitly determined irrelevant to tracked fantasy opportunity.

8. Model-impact reconciliation
   For every CHANGE, state whether it affects:
   - Projection
   - True Value
   - Overall / Actionable Draft rank
   - Comparison-model inputs
   - BUY / FAIR / REACH / FADE market value
   - Availability assumption
   - Connected-player opportunity assumption

9. Closure gate
   A monitoring pass must NOT report "no meaningful change" until:
   - the transaction sweep is complete;
   - every affected team depth-chart delta is reconciled;
   - connected-player impact has been reviewed;
   - all new events have a disposition;
   - any corresponding GitHub model/news decision has been surfaced;
   - site and current Excel synchronization status has been checked when model values changed.

## Miss-prevention example
The Kaleb Johnson trade to Green Bay after Josh Jacobs became unavailable should be caught automatically because:

- Jacobs availability changed;
- Green Bay acquired an RB;
- Green Bay contains tracked fantasy players;
- the acquisition therefore triggers mandatory connected-player review;
- MarShawn Lloyd, Josh Jacobs, and Kaleb Johnson must all be dispositioned before the pass can close.

## Operating principle
The monitored universe is not limited to 162 isolated names. It is a 162-player dependency graph. Any roster or usage event that can materially change opportunity for a tracked player must be evaluated even when the originating player is outside the universe.
