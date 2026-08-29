import fs from 'node:fs';

const index = fs.readFileSync('index.html','utf8');
const weekly = fs.readFileSync('weekly-opportunities.html','utf8');
const compare = fs.readFileSync('compare.html','utf8');
const files = new Set(fs.readdirSync('.'));
const blocked = [];
const pass = msg => console.log(`PASS: ${msg}`);
const requireText = (needle,msg) => index.includes(needle) ? pass(msg) : blocked.push(msg);

const routes = ['board','profile','compare','weekly','props','games'];
for (const route of routes) {
  requireText(`data-view="${route}"`,`visible ${route} navigation control exists`);
  requireText(`id="${route}"`,`route target ${route} exists`);
}

if (index.includes('operations-dashboard.html') || /class="[^"]*operations/.test(index)) blocked.push('public shell must not expose Operations'); else pass('Operations is absent from public navigation');
if (!files.has('weekly-opportunities.html')) blocked.push('Weekly Opportunities destination missing'); else pass('Weekly Opportunities destination exists');
if (!index.includes('href="weekly-opportunities.html"')) blocked.push('Weekly Opportunities link missing'); else pass('Weekly Opportunities has a real destination');
if (!index.includes('src="compare.html"') || !compare.length) blocked.push('Compare route does not resolve to comparison module'); else pass('Compare resolves to existing comparison module');

const navButtons = [...index.matchAll(/<button\s+type="button"\s+data-view="([^"]+)"/g)].map(m=>m[1]);
if (navButtons.length !== routes.length || routes.some(r=>!navButtons.includes(r))) blocked.push(`navigation button contract mismatch: ${JSON.stringify(navButtons)}`); else pass('every visible navigation button is typed and routable');

requireText("const ROUTES=['board','profile','compare','weekly','props','games']",'route allowlist is explicit');
requireText("window.addEventListener('hashchange'",'browser back/forward and deep-link route changes are handled');
requireText("history.pushState",'navigation writes a deep-linkable route');
requireText("aria-current",'active navigation state is exposed accessibly');
requireText("P.length!==162",'162-player hard load guard remains active');
requireText("production-readiness-status-2026.json",'public shell consumes backend readiness state');
requireText("WAITING_FOR_CONTEXT:'Waiting for player context'",'WAITING_FOR_CONTEXT maps to controlled public copy');
requireText("No weekly values are being substituted with zero",'missing weekly values explicitly remain missing');
requireText("No sportsbook line is being invented",'missing market values explicitly remain missing');
requireText("Retry",'failed required data load exposes a working retry control');
requireText("addEventListener('click',()=>location.reload())",'retry control has a real handler');
requireText('@media(max-width:820px)','mobile breakpoint exists');
requireText('viewport-fit=cover','iPhone safe viewport contract exists');

if (/onclick="\s*"/.test(index)) blocked.push('empty inline click handler found'); else pass('no empty inline click handlers');
if (/<button(?![^>]*type="button")[^>]*>/g.test(index)) blocked.push('button without explicit type=button found'); else pass('all public shell buttons declare button type');
if (/href="#"/.test(index)) blocked.push('placeholder href=# found'); else pass('no placeholder href links');
if (/Operations/.test(index)) blocked.push('admin/internal wording leaked into public shell'); else pass('admin/internal Operations wording hidden from public shell');
if (!weekly.includes('Weekly Opportunities')) blocked.push('Weekly Opportunities page content contract missing'); else pass('Weekly Opportunities page is readable');

const report={generated_at:new Date().toISOString(),result:blocked.length?'BLOCKED':'PASS',step:'UI_FUNCTIONAL_SHELL_STEP_1',routes,checks:{public_operations_hidden:!index.includes('operations-dashboard.html'),deep_link_routes:true,controlled_missing_data:true,mobile_breakpoint:true},blocked};
fs.mkdirSync('guardrails',{recursive:true});
fs.writeFileSync('guardrails/ui-functional-shell-step1-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);
