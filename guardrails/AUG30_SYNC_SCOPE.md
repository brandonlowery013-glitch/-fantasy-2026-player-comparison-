# Aug. 30, 2026 model synchronization scope

This branch synchronizes the GitHub runtime/model stack to the explicitly approved Aug. 30 season-long state without overwriting the newer Step 6.5 work.

## Approved football changes
- Kaytron Allen: projection/role downgrade.
- Chuba Hubbard: projection/role upgrade.
- Jonathon Brooks: connected Carolina committee reflow.
- Tyler Allgeier: hold.
- Rashee Rice: hold.
- Josh Downs: hold.

ADP/ECR/market inputs had zero authority over those football changes.

## Market-only repair
Nine players missing from the saved Aug. 30 current-cost layer now have current PPR market records: George Kittle, Mark Andrews, Dallas Goedert, Travis Kelce, Michael Pittman Jr., Mike Washington Jr., Aaron Jones Sr., Malik Washington and Tyjae Spears.

## Runtime and audit behavior
- The runtime-compatible overlay filename `current162patch-2026-08-24.json` is retained, but its effective content is Aug. 30.
- All 162 Overall and True-Value rank coordinates are synchronized through that overlay.
- The prior Step 3E no-op is historical and superseded by the explicit Aug. 30 approval ledger.
- Step 3H and the full backward audit now validate the shard-plus-overlay runtime state rather than raw shards alone.
- Step 6.5 remains zero-authority/shadow at its previously validated scopes.
- Promotion remains separate and is not automatic; unresolved Step 6.5B current-state completeness may still block promotion even if audit execution passes.
