import fs from 'node:fs';

const path='data/contracts/weekly-order-of-operations-2026.json';
const x=JSON.parse(fs.readFileSync(path,'utf8'));
const src=JSON.parse(fs.readFileSync('MODEL_SOURCE_OF_TRUTH.json','utf8'));
const fail=m=>{throw new Error(m)};

if(x.season!==2026) fail('season must be 2026');
if(x.canonical_player_count!==Number(src.active_player_model)) fail(`canonical player universe must match source of truth (${src.active_player_model})`);
if(x.timezone!=='America/Chicago') fail('display/contract timezone must be America/Chicago');
if(x.principles?.raw_feeds_independent!==true) fail('raw feeds must remain independent');
if(x.principles?.raw_feeds_never_require_model_pick!==true) fail('raw feeds may not require a model PICK');
if(x.principles?.monitoring_is_watchdog_not_update_gate!==true) fail('monitoring must remain a watchdog, not an update gate');

const expected=[
  'game_identity','live_game_feed','market_feed','news_injury_availability',
  'role_opportunity_redistribution','player_projection','fantasy_decisions',
  'sleeper_breakout','betting_decisions','player_detail_publication','game_detail_interface',
  'postgame_settlement','learning_calibration','monitoring_self_healing'
];
const order=(x.order||[]).map(s=>s.id);
if(JSON.stringify(order)!==JSON.stringify(expected)) fail(`order mismatch: ${order.join(' -> ')}`);

const map=new Map((x.order||[]).map(s=>[s.id,s]));
for(const s of x.order||[]){
  for(const dep of s.requires||[]){
    if(!map.has(dep)) fail(`${s.id} requires unknown layer ${dep}`);
    if(map.get(dep).step>=s.step) fail(`${s.id} depends on ${dep} out of order`);
  }
}

const breakout=map.get('sleeper_breakout');
if(breakout?.rules?.opportunity_gate_required!==true) fail('sleeper/breakout requires opportunity gate');
if(breakout?.rules?.true_value_vs_ecr_alone_forbidden!==true) fail('TV-vs-ECR alone must not create sleeper/breakout labels');

const ui=map.get('game_detail_interface');
if(ui?.rules?.raw_and_model_outputs_visually_integrated_but_internally_separate!==true) fail('UI must integrate raw/model visually while keeping them internally separate');
if(ui?.rules?.team_logos_next_to_names!==true) fail('team logos must render next to names');
if(ui?.rules?.game_props_inside_game_detail!==true) fail('game-specific props must be available in game detail');

const detail=map.get('player_detail_publication');
if(x.principles.questionable_is_label_only!==true||detail?.rules?.questionable_numeric_penalty!==0)fail('Questionable must be informational only');
for(const flag of ['injury_badge_on_player_board','name_click_shows_injury_reason_and_recent_news','publication_is_required_not_backchannel'])if(detail?.rules?.[flag]!==true)fail('Player detail publication missing '+flag);
const workflow=fs.readFileSync('.github/workflows/step24-weekly-production-orchestration.yml','utf8');
if(!workflow.includes('node scripts/build-player-detail-feed.mjs')||!workflow.includes('data/weekly/player-detail-feed-2026.json'))fail('Player injury/news detail feed must be built and persisted by production orchestration');
const monitor=map.get('monitoring_self_healing');
if(monitor?.rules?.must_not_block_healthy_raw_feed_updates!==true) fail('monitoring may not block healthy raw feed updates');

console.log(JSON.stringify({result:'PASS',season:x.season,canonical_player_count:x.canonical_player_count,timezone:x.timezone,steps:order.length,order},null,2));
