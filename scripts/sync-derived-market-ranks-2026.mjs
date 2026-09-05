import fs from 'node:fs';

// Idempotent companion-layer synchronization. Canonical ranks remain authoritative.
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (p, x) => fs.writeFileSync(p, JSON.stringify(x, null, 2) + '\n');
const fail = m => { throw new Error(`SYNC_DERIVED_MARKET_RANKS: ${m}`); };

const sot = read('MODEL_SOURCE_OF_TRUTH.json');
if (sot.active_player_model !== 166) fail('canonical universe is not 166');
const core = read(sot.current_update_layer);
const canonical = core.players || {};
const names = Object.keys(canonical);
if (names.length !== 166) fail(`canonical player count ${names.length} != 166`);

const edgePath = 'data/market/draft-edge-opportunity-screen-166.json';
const edge = read(edgePath);
if (edge.universe !== 166 || !Array.isArray(edge.players) || edge.players.length !== 166) {
  fail('Step 2 edge layer is not a 166-player layer');
}

let changed = 0;
const missing = [];
for (const row of edge.players) {
  const c = canonical[row.player];
  if (!c) { missing.push(row.player); continue; }
  if (row.overall_rank !== c.o) { row.overall_rank = c.o; changed++; }
  if (row.true_value_rank !== c.tr) { row.true_value_rank = c.tr; changed++; }
  if (typeof row.model_overall_rank === 'number' && row.model_overall_rank !== c.o) {
    row.model_overall_rank = c.o; changed++;
  }
  if (typeof row.model_true_value_rank === 'number' && row.model_true_value_rank !== c.tr) {
    row.model_true_value_rank = c.tr; changed++;
  }
}
if (missing.length) fail(`Step 2 contains players outside canonical universe: ${missing.join(', ')}`);

const edgeNames = new Set(edge.players.map(x => x.player));
const absent = names.filter(n => !edgeNames.has(n));
if (absent.length) fail(`Step 2 is missing canonical players: ${absent.join(', ')}`);

edge.canonical_rank_sync = {
  authority: 'DERIVED_ONLY_NO_INTRINSIC_RANK_MUTATION',
  source: sot.current_update_layer,
  universe: 166,
  synchronized: true
};
write(edgePath, edge);
console.log(JSON.stringify({status:'DERIVED_MARKET_RANK_SYNC_PASS', universe:166, rank_fields_changed:changed}, null, 2));
