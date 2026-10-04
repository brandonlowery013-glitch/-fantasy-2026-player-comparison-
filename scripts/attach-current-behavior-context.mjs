import fs from 'node:fs';
import {attachBehaviorContext} from '../lib/attach-behavior-context.mjs';
const projectionPath = 'data/probability/generated/weekly-game-projections-2026.json';
const recommendationPath = 'data/market/weekly-game-market-recommendations-2026.json';
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const result = attachBehaviorContext(read(projectionPath), read(recommendationPath), read('data/market/issued-pick-results-2026.json').football_learning, new Date().toISOString());
if (process.argv.includes('--write')) {
  fs.writeFileSync(projectionPath, JSON.stringify(result.projections, null, 2)+'\n');
  fs.writeFileSync(recommendationPath, JSON.stringify(result.recommendations, null, 2)+'\n');
}
console.log(JSON.stringify({updated:result.updated, frozen:result.frozen, written:process.argv.includes('--write'), numeric_changes:0, network_requests:0}));
