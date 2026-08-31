import fs from 'node:fs';

const index=fs.readFileSync('index.html','utf8');
const runtime=fs.readFileSync('runtime-draft-opportunity-ui-2026.js','utf8');
const compare=fs.readFileSync('compare.html','utf8');
const data=JSON.parse(fs.readFileSync('data/market/market-value-board-2026.json','utf8'));
const universeCfg=JSON.parse(fs.readFileSync('guardrails/guardrails-config.json','utf8'));
const expectedPlayerCount=Number(universeCfg.authoritative_player_count);
const fail=msg=>{console.error(`FAIL: ${msg}`);process.exitCode=1};
const pass=msg=>console.log(`PASS: ${msg}`);
const need=(ok,label)=>ok?pass(label):fail(label);

need(index.includes('083fca6edf212334c3a2bc8ef48f141cef94fe26/index.html'),'Verified pre-integration platform shell is pinned as the base');
need(index.includes('runtime-draft-opportunity-ui-2026.js'),'Player Board shell loads the season-long Opportunity runtime');
need(runtime.includes('[data-view="profile"],[data-view="props"],a.opportunities'),'Profile, Props and Weekly Opportunities are removed from top-level navigation');
need(runtime.includes("games.textContent='Games'"),'NFL Games top-level label is simplified to Games');
need(runtime.includes("document.getElementById('nav')"),'Player Board/Weekly/Games navigation is transformed from the verified base shell');
need(compare.includes('runtime-comparison-ui-step3.js'),'Compare remains a dedicated primary platform surface');
need(runtime.includes('gamesPropsMount'),'Props are nested under Games instead of remaining a top-level route');
need(runtime.includes('weekly-opportunities.html'),'Weekly Opportunities remain reachable from the Weekly surface');
need(runtime.includes('opportunityFilter'),'Player Board exposes draft-opportunity filtering');
need(runtime.includes('Draft Opportunity'),'Player Profile exposes season-long Draft Opportunity context');
need(compare.includes('runtime-comparison-opportunity-ui-2026.js'),'Compare exposes the same season-long Opportunity layer');
need(compare.includes('runtime-comparison-decision-2026.js'),'Compare preserves the locked football/price decision runtime');
need(data.universe===expectedPlayerCount&&Array.isArray(data.board)&&data.board.length===expectedPlayerCount&&data.status==='STEP_3_MARKET_DISCREPANCY_VALUE_BOARD',`Opportunity layer is locked to the ${expectedPlayerCount}-player universe`);
need(data.authority==='COMPANION_ONLY_NO_INTRINSIC_RANK_MUTATION','Opportunity data cannot mutate intrinsic ranks');
need(!runtime.includes('unified-opportunities-2026.json'),'Season-long draft runtime does not consume the weekly opportunity ledger');
need(!runtime.includes('weekly-game-projections-2026.json'),'Season-long draft runtime does not consume game probabilities');
need(!/projection_override|core_rank_override/.test(index+runtime),'UI introduces no core projection/rank override');

if(!process.exitCode)console.log(`Step 12 platform interface architecture QA passed for ${expectedPlayerCount} players: Player Board | Compare | Weekly | Games.`);
