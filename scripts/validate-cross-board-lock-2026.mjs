import fs from 'node:fs';

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const fail = m => { throw new Error(`STEP4_CROSS_BOARD_LOCK: ${m}`); };
const assert = (c,m) => { if (!c) fail(m); };
const uniq = a => new Set(a);

const sot = read('MODEL_SOURCE_OF_TRUTH.json');
const core = read(sot.current_update_layer);
const edge = read('data/market/draft-edge-opportunity-screen-166.json');
const market = read('data/market/market-value-board-2026.json');
const phase = read('data/sources/season-phase-2026.json');
const marketBuilder = fs.readFileSync('scripts/build-market-value-board-2026.mjs','utf8');

assert(sot.active_player_model === 166, 'source of truth must declare 166 players');
assert(sot.runtime_player_shards === 14, 'source of truth must declare 14 runtime shards');
assert(core.model === 'single 166-player active board', 'canonical overlay is not the 166-player board');
const coreNames = Object.keys(core.players || {});
assert(coreNames.length === 166 && uniq(coreNames).size === 166, 'canonical board must contain 166 unique players');

for (const [label, doc] of [['edge',edge],['market',market]]) {
  assert(doc.universe === 166, `${label} layer must declare universe 166`);
  assert(Array.isArray(doc.board) && doc.board.length === 166, `${label} board must contain 166 rows`);
  const names = doc.board.map(x=>x.player);
  assert(uniq(names).size === 166, `${label} board contains duplicate player names`);
  assert(names.every(n=>core.players[n]), `${label} board contains a player outside canonical universe`);
  assert(coreNames.every(n=>names.includes(n)), `${label} board is missing a canonical player`);
}

assert(edge.authority === 'COMPANION_ONLY_NO_INTRINSIC_RANK_MUTATION', 'edge authority must remain companion-only');
assert(market.authority === 'COMPANION_ONLY_NO_INTRINSIC_RANK_MUTATION', 'market authority must remain companion-only');

const edgeBy = new Map(edge.board.map(x=>[x.player,x]));
const marketBy = new Map(market.board.map(x=>[x.player,x]));
for (const name of coreNames) {
  const c = core.players[name], e = edgeBy.get(name), m = marketBy.get(name);
  assert(e.overall_rank === c.o, `${name}: Step 2 Overall rank drift (${e.overall_rank} != ${c.o})`);
  assert(e.true_value_rank === c.tr, `${name}: Step 2 True Value rank drift (${e.true_value_rank} != ${c.tr})`);
  assert(m.overall_rank === c.o, `${name}: Step 3 Overall rank drift (${m.overall_rank} != ${c.o})`);
  assert(m.true_value_rank === c.tr, `${name}: Step 3 True Value rank drift (${m.true_value_rank} != ${c.tr})`);
  assert(m.overall_rank === e.overall_rank && m.true_value_rank === e.true_value_rank, `${name}: Step 2/3 intrinsic rank mismatch`);
}

for (const rankKey of ['o','tr']) {
  const values = coreNames.map(n=>core.players[n][rankKey]);
  assert(values.every(Number.isInteger), `canonical ${rankKey} ranks must be integers`);
  assert(uniq(values).size === 166, `canonical ${rankKey} ranks must be unique`);
  assert(Math.min(...values) === 1 && Math.max(...values) === 166, `canonical ${rankKey} ranks must span 1..166`);
}

for (const [rankField, prefixField] of [['pr','o'],['tp','tr']]) {
  const byPos = new Map();
  for (const name of coreNames) {
    const c = core.players[name];
    const m = String(c[rankField] || '').match(/^([A-Z]+)(\d+)$/);
    assert(m, `${name}: invalid ${rankField} positional rank`);
    const [,pos,num] = m; const rows = byPos.get(pos) || []; rows.push({name,num:+num,rank:c[prefixField]}); byPos.set(pos,rows);
  }
  for (const [pos, rows] of byPos) {
    rows.sort((a,b)=>a.rank-b.rank);
    rows.forEach((r,i)=>assert(r.num===i+1, `${r.name}: ${rankField} must be ${pos}${i+1}, found ${pos}${r.num}`));
  }
}

const pending = edge.board.filter(x=>x.market_adp == null).map(x=>x.player).sort();
const declaredPending = [...(market.price_pending || [])].sort();
assert(JSON.stringify(pending) === JSON.stringify(declaredPending), 'PRICE PENDING must exactly equal players without direct ADP');
assert(market.board.filter(x=>x.action==='PRICE PENDING').length === pending.length, 'PRICE PENDING action count mismatch');
assert(market.board.filter(x=>x.action==='PRICE PENDING').every(x=>x.market_adp==null), 'priced player cannot be PRICE PENDING');

assert(phase.season === 2026, 'season phase must be 2026');
assert(phase.draft_mode?.through === '2026-09-08', 'draft mode must run through Sept. 8');
assert(phase.regular_season_mode?.starts === '2026-09-09', 'regular-season mode must begin Sept. 9');
assert(phase.rules?.rank_arrow_requires_actual_saved_rank_change === true, 'rank arrows must require actual saved-rank change');
assert(phase.rules?.news_without_rank_change_shows_news_badge_only === true, 'news with no rank move must be badge/HOLD only');
assert(phase.rules?.connected_players_receive_independent_context === true, 'connected players must retain independent context');
assert(phase.rules?.draft_fields_are_never_deleted_after_transition === true, 'draft fields must be preserved after transition');
assert((phase.regular_season_mode?.deemphasize_but_preserve || []).includes('current_adp'), 'regular-season contract must preserve ADP');

const forbidden = [/sportsbook/i,/vegas/i,/\bodds\b/i,/player.?prop/i];
assert(!forbidden.some(r=>r.test(marketBuilder)), 'Step 3 market-value builder must not import sportsbook/Vegas/prop authority');
assert(market.source === 'data/market/draft-edge-opportunity-screen-166.json', 'Step 3 must derive from locked Step 2 screen');

const summary = {
  status:'STEP_4_CROSS_BOARD_VERIFICATION_LOCK_PASS',
  universe:166,
  canonical_players:coreNames.length,
  edge_players:edge.board.length,
  market_players:market.board.length,
  price_pending:pending.length,
  season_transition:'DRAFT_THROUGH_2026-09-08__REGULAR_2026-09-09',
  intrinsic_rank_drift:0,
  authority:'VALIDATION_ONLY_NO_MODEL_MUTATION'
};
console.log(JSON.stringify(summary,null,2));
