import fs from 'node:fs';

const contractPath = 'data/sources/model-foundation-contract-2026.json';
const guardrailPath = 'guardrails/guardrails-config.json';
const contextPath = 'data/sources/automatic-football-context-adapters-2026.json';
const marketPath = 'data/sources/betting-data-source-price-contract-2026.json';
const comparisonPath = 'data/sources/comparison-decision-2026.json';

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const fail = (msg) => { console.error(`FOUNDATION CONTRACT FAIL: ${msg}`); process.exitCode = 1; };

for (const p of [contractPath, guardrailPath, contextPath, marketPath, comparisonPath]) {
  if (!fs.existsSync(p)) fail(`missing required file ${p}`);
}
if (process.exitCode) process.exit();

const c = readJson(contractPath);
const g = readJson(guardrailPath);
const f = readJson(contextPath);
const m = readJson(marketPath);
const d = readJson(comparisonPath);

if (c.season !== 2026) fail('contract season must be 2026');
if (c.status !== 'FOUNDATION_LOCKED_FOR_INTEGRATION') fail('foundation status is not locked');
if (g.authoritative_player_count !== 166) fail(`authoritative player count expected 166, found ${g.authoritative_player_count}`);
if (!Number.isInteger(g.authoritative_player_shards) || g.authoritative_player_shards < 1) fail('authoritative shard count invalid');

const layers = c.foundation_layers || {};
for (const name of ['canonical_state','event_state_change','dependency_graph','football_projection','market','historical_evidence','decision','audit_provenance']) {
  if (!layers[name]) fail(`missing foundation layer ${name}`);
}

const eventFields = new Set(layers.event_state_change?.required_event_fields || []);
for (const field of ['event_id','event_type','previous_state','new_state','materiality','source','captured_at','evidence_fingerprint']) {
  if (!eventFields.has(field)) fail(`event contract missing required field ${field}`);
}

if (layers.event_state_change?.event_never_directly_sets_rank !== true) fail('events must not directly set rank');
if (layers.event_state_change?.event_never_directly_sets_projection !== true) fail('events must not directly set projection');
if (layers.dependency_graph?.connected_reassessment_required !== true) fail('connected reassessment must be required');
if (layers.dependency_graph?.automatic_backup_promotion_prohibited !== true) fail('automatic backup promotion must be prohibited');
if (layers.football_projection?.sportsbook_may_write_projection !== false) fail('sportsbook must not write football projections');
if (layers.market?.may_directly_rewrite_core_football_projection !== false) fail('market layer must not directly rewrite football projection');
if (layers.historical_evidence?.trend_weight_requires_backtest !== true) fail('trend weighting must require backtest');
if (layers.historical_evidence?.causal_equation_requires_shadow_backtest_before_promotion !== true) fail('causal equation must require shadow backtest');

if (f.write_contract?.dedupe_by_evidence_fingerprint !== true) fail('football snapshots must dedupe by evidence fingerprint');
if (m.separation_guardrails?.sportsbook_data_may_mutate_weekly_football_projection !== false) fail('existing market contract allows weekly football projection mutation');
if (m.separation_guardrails?.sportsbook_data_may_mutate_true_value !== false) fail('existing market contract allows True Value mutation');
if (d.price_separation?.head_to_head_may_use_sportsbook_data !== false) fail('comparison decision improperly allows sportsbook data');
if (g.drift?.unexplained_material_change !== 'BLOCK') fail('unexplained material changes must block');

const order = c.integration_order || [];
const requiredOrder = ['AUTOMATIC_EVENT_INGESTION','CONNECTED_IMPACT_RESOLVER','TEAM_SCORING_AND_MARKET_IMPACT_BRIDGE','HISTORICAL_GAME_TREND_DATABASE','TREND_BACKTEST_AND_RELEVANCE','INTERFACE_IMPACT_PAYLOAD','DEPLOYMENT_AND_CANONICAL_SYNC'];
if (JSON.stringify(order) !== JSON.stringify(requiredOrder)) fail('integration order does not match locked foundation sequence');

if (!process.exitCode) {
  console.log(`MODEL FOUNDATION CONTRACT PASS — ${g.authoritative_player_count} players, ${g.authoritative_player_shards} shards, ${Object.keys(layers).length} locked layers.`);
}
