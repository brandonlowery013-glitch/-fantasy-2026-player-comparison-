import assert from 'node:assert/strict';
import fs from 'node:fs';
import {simulateGameDistribution, outcomeProbabilities, moneylineProbabilities, evaluateTwoWay, recommendation} from '../lib/game-market-probability.mjs';

// Read-only audit: no collectors, forecast refresh, or archive rewrites.
const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const projections = read('data/probability/generated/weekly-game-projections-2026.json');
const feed = read('data/market/weekly-game-market-recommendations-2026.json');
const {recommendation_policy: policy} = read('data/sources/game-market-recommendation-layer-2026.json');
const rounded = value => JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'number' ? Number(v.toFixed(6)) : v));
assert.equal(feed.week, projections.week, 'Published markets and projections must use the same week');
assert.equal(projections.sportsbook_inputs_used, false);
let snapshots = 0, evaluations = 0;
for (const [id, game] of Object.entries(feed.games)) {
  const projection = projections.games[id];
  assert.ok(projection, `${id}: missing projection`);
  assert.equal(game.model_version, projection.model_version, `${id}: model version`);
  assert.equal(game.football_projection.home_score_mean, projection.model.home_score_mean);
  assert.equal(game.football_projection.away_score_mean, projection.model.away_score_mean);
  const draws = simulateGameDistribution(id, projection);
  const margins = draws.map(d => d.margin);
  for (const snapshot of game.snapshot_evaluations) {
    snapshots++;
    const m = snapshot.market;
    for (const kind of ['spread', 'moneyline']) {
      const saved = snapshot.markets[kind];
      if (!saved) continue;
      const spread = kind === 'spread';
      if (spread) assert.ok(m.home_spread != null, `${id}: missing spread`);
      const evaluation = evaluateTwoWay({
        sideA: spread ? outcomeProbabilities(margins, -m.home_spread, 'OVER') : moneylineProbabilities(draws, 'HOME'),
        sideB: spread ? outcomeProbabilities(margins, -m.home_spread, 'UNDER') : moneylineProbabilities(draws, 'AWAY'),
        sideAOdds: spread ? m.home_spread_price : m.home_moneyline,
        sideBOdds: spread ? m.away_spread_price : m.away_moneyline,
        thresholds: spread ? {home_spread: Number(m.home_spread), home_cover_margin_threshold: -Number(m.home_spread)} : null,
      });
      const labels = spread
        ? {side_a: `${game.home_team} ${Number(m.home_spread) > 0 ? '+' : ''}${m.home_spread}`, side_b: `${game.away_team} ${Number(-m.home_spread) > 0 ? '+' : ''}${-Number(m.home_spread)}`}
        : {side_a: `${game.home_team} ML`, side_b: `${game.away_team} ML`};
      const {recommendation: savedPick, show_work, ...savedMath} = saved;
      assert.deepEqual(savedMath, rounded(evaluation), `${id}/${snapshot.snapshot_id}/${kind}: saved math differs`);
      assert.deepEqual(savedPick, recommendation(evaluation, policy, labels), `${id}/${snapshot.snapshot_id}/${kind}: saved decision differs`);
      assert.equal(show_work?.decision, savedPick.decision, `${id}/${kind}: explanation decision differs`);
      evaluations++;
    }
  }
}
assert.ok(evaluations > 0, 'No saved spread/moneyline evaluations were checked');
console.log(JSON.stringify({result: 'PASS', week: feed.week, games: Object.keys(feed.games).length, snapshots, evaluations, writes: 0}));
