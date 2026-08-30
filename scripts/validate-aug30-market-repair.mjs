import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const ledger=read('data/sources/market-repair-2026-08-30.json');
const patch=read('current162patch-2026-08-24.json');
const expected=ledger.players||{};
if(Object.keys(expected).length!==9) throw new Error(`expected nine market repairs; found ${Object.keys(expected).length}`);
if(ledger.coverage_after_repair!==162||ledger.football_projection_authority!==0||ledger.intrinsic_rank_mutations_from_market!==0) throw new Error('market-repair authority/coverage contract failed');
for(const [name,m] of Object.entries(expected)){
  const p=patch.players?.[name];
  if(!p) throw new Error(`missing repaired player in runtime overlay: ${name}`);
  if(p.ad!==m.adp||p.px!==m.market_read||p.fw!==m.fair_range) throw new Error(`${name} market repair mismatch`);
  if(p.market_read_override!==true) throw new Error(`${name} must carry explicit market_read_override`);
}
console.log(JSON.stringify({status:'PASS',repaired:9,current_cost_coverage:162,football_projection_authority:0},null,2));
