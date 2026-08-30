import fs from 'fs';
const contract=JSON.parse(fs.readFileSync('data/sources/step6-5h-integration-contamination-qa-2026.json','utf8'));
const shards=fs.readdirSync('.').filter(f=>/^players\d+\.json$/.test(f));
const players=shards.flatMap(f=>JSON.parse(fs.readFileSync(f,'utf8')));
const names=players.map(p=>p.n);
if(players.length!==162) throw new Error(`expected 162 players, got ${players.length}`);
if(new Set(names).size!==162) throw new Error('duplicate players');
const forbiddenUpstream=['sportsbook','odds','implied_probability','adp','ecr','market_price'];
const footballScopes=['FANTASY_PROJECTION','GAME_PROJECTION','PLAYER_PROP_PROJECTION','DST_PROJECTION','K_PROJECTION'];
for(const s of footballScopes){
  const txt=(contract.surface_scopes[s]||[]).join('|').toLowerCase();
  for(const f of forbiddenUpstream) if(txt.includes(f)) throw new Error(`${f} leaked into ${s}`);
}
const market=(contract.surface_scopes.MARKET_COMPARISON||[]).join('|').toLowerCase();
if(!market.includes('sportsbook')||!market.includes('football_forecast_outputs')) throw new Error('market comparison directionality broken');
const rejected=new Set(contract.rejected_numeric_modules);
for(const m of ['broad_team_defense_modifier','granular_matchup_TE','kicker_rich_model','extra_historical_situations_6_5E','legacy_hand_tuned_projection_recalibration']) if(!rejected.has(m)) throw new Error(`rejected module missing ${m}`);
const synthetic=[
 {evidence_key:'injury:A',layer:'canonical_player_state',numeric:true},
 {evidence_key:'injury:A',layer:'reason_stack',numeric:false},
 {evidence_key:'rest:B',layer:'game_projection',numeric:true}
];
const numericByKey=new Map();
for(const x of synthetic){if(!x.numeric)continue; const n=(numericByKey.get(x.evidence_key)||0)+1; numericByKey.set(x.evidence_key,n);}
if([...numericByKey.values()].some(v=>v>1)) throw new Error('double-count detected');
const bad=[...synthetic,{evidence_key:'rest:B',layer:'fantasy_projection',numeric:true}];
const badMap=new Map();
for(const x of bad){if(!x.numeric)continue; badMap.set(x.evidence_key,(badMap.get(x.evidence_key)||0)+1);}
if(![...badMap.values()].some(v=>v>1)) throw new Error('negative double-count test failed');
const report={result:'PASS',players:players.length,unique_players:new Set(names).size,football_surfaces:footballScopes,market_downstream_only:true,rejected_numeric_modules:[...rejected],negative_tests:3,next_gate:contract.next_gate};
fs.mkdirSync('guardrails',{recursive:true});
fs.writeFileSync('guardrails/step6-5h-integration-contamination-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
