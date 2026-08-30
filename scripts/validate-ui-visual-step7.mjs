import fs from 'node:fs';

const need=(ok,msg)=>{if(!ok)throw new Error(msg)};
const index=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('ui-step7-chuck-duke.css','utf8');
const compare=fs.readFileSync('compare.html','utf8');
const opp=fs.readFileSync('weekly-opportunities.html','utf8');

need(index.includes('data-step7-visual="chuck-the-duke"'),'Step 7 visual marker missing from index');
need(index.includes('ui-step7-chuck-duke.css?v=20260829-step7'),'Step 7 stylesheet not attached to index');
need(!index.includes('Layout is intentionally temporary while the functional shell is validated.'),'temporary shell copy survived Step 7');
need(!index.includes('This shell currently proves the route and data state.'),'temporary games copy survived Step 7');
need(index.includes("const RAW='https://raw.githubusercontent.com/brandonlowery013-glitch/-fantasy-2026-player-comparison-/main/';"),'production data source changed during visual step');
need(index.includes("const ROUTES=['board','profile','compare','weekly','props','games'];"),'route contract changed during visual step');
need(index.includes("a.p.localeCompare(b.p)||lastKey(a.n).localeCompare(lastKey(b.n))"),'player position/last-name ordering contract changed');
need(index.includes("P.length!==162||new Set(P.map(x=>x.n)).size!==162"),'162-player hard shell guard changed');
need(index.includes("Market information is displayed after the model projection. It does not change the underlying football forecast."),'model/market separation copy missing');
need(compare.includes('ui-step7-chuck-duke.css?v=20260829-step7'),'comparison surface missing Step 7 visual system');
need(opp.includes('ui-step7-chuck-duke.css?v=20260829-step7'),'weekly opportunities missing Step 7 visual system');
need(css.includes('--duke-gold:#d8b35b'),'Chuck The Duke gold token missing');
need(css.includes('--duke-blue:#6aa7e8'),'Chuck The Duke blue token missing');
need(css.includes('min-height:44px'),'mobile touch-target contract missing');
need(css.includes('@media(max-width:820px)'),'responsive visual contract missing');
need(css.includes('@media(prefers-reduced-motion:reduce)'),'reduced-motion contract missing');
console.log('Step 7 Chuck The Duke visual-system contract PASS');
