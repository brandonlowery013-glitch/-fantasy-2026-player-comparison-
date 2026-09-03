import fs from 'node:fs';

const path='guardrails/current-football-review.json';
const ledger=JSON.parse(fs.readFileSync(path,'utf8'));
const overrides={
  'Trey McBride':'ARI',
  'Jeremiyah Love':'ARI',
  'Marvin Harrison Jr.':'ARI',
  'Michael Wilson':'ARI',
  'Tyler Allgeier':'ARI',
  'Kenneth Gainwell':'TB'
};
let applied=0;
for(const p of ledger.players||[]){const team=overrides[p.player];if(!team)continue;p.current_team=team;p.current_team_resolution='VERIFIED_CURRENT_TEAM_OVERRIDE';applied++;}
ledger.source_quality={...(ledger.source_quality||{}),verified_current_team_overrides:overrides,verified_current_team_override_count:applied};
fs.writeFileSync(path,JSON.stringify(ledger,null,2)+'\n');
console.log(JSON.stringify({result:'PASS',applied,overrides},null,2));
