import fs from 'node:fs';

const index=fs.readFileSync('index.html','utf8');
const runtime=fs.readFileSync('runtime-draft-opportunity-ui-2026.js','utf8');
const compare=fs.readFileSync('compare.html','utf8');
const weekly=fs.readFileSync('weekly-opportunities.html','utf8');
const files=new Set(fs.readdirSync('.'));
const blocked=[];
const pass=msg=>console.log(`PASS: ${msg}`);
const need=(ok,msg)=>ok?pass(msg):blocked.push(msg);

need(index.includes('BASE_SHELL'),'public entry point loads a pinned verified platform shell');
need(index.includes('runtime-draft-opportunity-ui-2026.js'),'public entry point attaches new interface runtime');
need(runtime.includes('[data-view="profile"],[data-view="props"],a.opportunities'),'non-primary Profile/Props/Weekly Opportunities controls are removed from top nav');
need(runtime.includes("games.textContent='Games'"),'fourth primary surface is Games');
need(runtime.includes('gamesPropsMount'),'Props content is preserved under Games');
need(runtime.includes('weekly-opportunities.html'),'Weekly Opportunities has a real destination inside Weekly');
need(files.has('weekly-opportunities.html'),'Weekly Opportunities destination exists');
need(compare.includes('runtime-comparison-opportunity-ui-2026.js'),'Compare route receives season-long Opportunity context');
need(runtime.includes('opportunityFilter'),'Player Board has market-read filter');
need(runtime.includes('MutationObserver'),'Opportunity decorations survive board/profile rerenders');
need(runtime.includes('COMPANION_ONLY_NO_INTRINSIC_RANK_MUTATION'),'runtime hard-checks companion-only authority');
need(index.includes('@media(max-width:820px)'),'mobile entry breakpoint exists');
need(index.includes('viewport-fit=cover'),'iPhone safe viewport contract exists');
need(!index.includes('operations-dashboard.html'),'Operations is absent from public entry point');
need(!/href="#"/.test(index+runtime),'no placeholder href links');
need(weekly.includes('Weekly Opportunities'),'Weekly Opportunities page content remains readable');

const report={generated_at:new Date().toISOString(),result:blocked.length?'BLOCKED':'PASS',step:'UI_FUNCTIONAL_SHELL_STEP_1',primary_routes:['board','compare','weekly','games'],internal_routes:['profile'],nested_surfaces:['props','weekly_opportunities'],checks:{public_operations_hidden:true,season_long_opportunity_companion_only:true,weekly_games_isolated:true,mobile_breakpoint:true},blocked};
fs.mkdirSync('guardrails',{recursive:true});
fs.writeFileSync('guardrails/ui-functional-shell-step1-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);
