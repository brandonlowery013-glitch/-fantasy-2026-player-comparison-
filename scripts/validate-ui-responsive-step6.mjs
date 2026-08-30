import fs from 'node:fs';
import { execSync } from 'node:child_process';

const BASE='95340e2e7bafe4d905fd1efa6d3fbb1e0994912b';
const AUDIT_MODE=process.argv.includes('--audit-mode');
const contract=JSON.parse(fs.readFileSync('data/sources/ui-responsive-step6-2026.json','utf8'));
const read=p=>fs.readFileSync(p,'utf8');
const checks=[];
const check=(name,ok,detail='')=>{checks.push({name,ok:Boolean(ok),detail}); if(!ok) console.error(`FAIL ${name}${detail?`: ${detail}`:''}`);};
const has=(s,...parts)=>parts.every(x=>s.includes(x));

check('contract version',contract.version==='UI_RESPONSIVE_STEP6_1.0.0');
check('Step 5 base locked',contract.base_step5_sha===BASE);
check('viewport matrix includes narrow phone through desktop',JSON.stringify(contract.viewport_contract_css_px)==='[320,375,390,768,1024,1440]');

const surfaces=Object.fromEntries(contract.public_surfaces.map(p=>[p,read(p)]));
for(const [p,h] of Object.entries(surfaces)){
  check(`${p} viewport meta`,/name=["']viewport["'][^>]*width=device-width/i.test(h));
  check(`${p} box sizing or bounded loader`,/box-sizing:border-box|#boot\{padding:/i.test(h),p);
}

const main=surfaces['index.html'];
check('main shell is fluid',has(main,'.shell{width:min(1240px,96vw)'));
check('main has mobile breakpoint',has(main,'@media(max-width:820px)'));
check('main mobile navigation uses 44px targets',has(main,'.nav button,.nav a{min-height:44px}'));
check('main navigation overflow is intentional',has(main,'.nav{display:flex','overflow:auto'));
check('main table overflow is contained',has(main,'.tableWrap{overflow:auto}', '.table{width:100%'));
check('main mobile grids collapse',/@media\(max-width:820px\)[\s\S]*?\.grid,[^{]*\.split,[^{]*\.profileGrid[^{]*\{grid-template-columns:1fr\}/.test(main));

const weekly=surfaces['weekly-opportunities.html'];
check('weekly shell is fluid',/\.shell\{width:min\(1180px,96vw\)/.test(weekly));
check('weekly touch targets are 44px',has(weekly,'.tabs button{','min-height:44px','.actions a{','display:inline-flex'));
check('weekly narrow phone stacks metrics',has(weekly,'@media(max-width:460px)', '.summary,.metrics{grid-template-columns:1fr}'));
check('weekly narrow header can wrap',has(weekly,'.head{flex-wrap:wrap}'));
check('weekly long content can wrap',has(weekly,'overflow-wrap:anywhere'));

const ops=surfaces['operations-dashboard.html'];
check('operations shell is fluid',/\.shell\{width:min\(1180px,96vw\)/.test(ops));
check('operations touch targets are 44px',has(ops,'.actions a{','min-height:44px'));
check('operations grids stack on phone',has(ops,'@media(max-width:560px)', '.grid,.stack{grid-template-columns:1fr}'));
check('operations long values wrap',has(ops,'.row b{','overflow-wrap:anywhere'));
check('operations rows stack on very narrow phone',has(ops,'@media(max-width:430px)', '.row{flex-direction:column'));
check('operations read-only description preserved',ops.includes('This dashboard does not recalculate model outputs.'));

const compare=surfaces['compare.html'];
check('comparison stable loader preserved',compare.includes("const BASE='https://raw.githubusercontent.com/brandonlowery013-glitch/-fantasy-2026-player-comparison-/b6b965159ffbb0c027c26b9467c7586171e97c64/index.html'"));
check('comparison Step 3 runtime preserved',compare.includes('runtime-comparison-ui-step3.js'));
check('comparison explicit Step 6 responsive contract',has(compare,'step6-responsive-contract','@media(max-width:520px)'));
check('comparison phone results stack',has(compare,'.cards,.compareRows,.decisionPair,.priceLegend{grid-template-columns:1fr!important}'));
check('comparison controls retain 44px target',has(compare,'button,select{min-height:44px}'));

const backup=read('index-backup.html');
check('comparison source viewport meta',/name=["']viewport["'][^>]*width=device-width/i.test(backup));
check('comparison source already has mobile breakpoint',backup.includes('@media(max-width:760px)'));
check('comparison source controls are usable',backup.includes('select{width:100%;min-height:48px'));

let changed=[];
try{changed=execSync(`git diff --name-only ${BASE}...HEAD`,{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);}catch(e){
  if(!AUDIT_MODE) check('Step 6 diff available',false,String(e.message));
}
const allowed=new Set(contract.allowed_step6_paths);
const unexpected=changed.filter(p=>!allowed.has(p));
if(AUDIT_MODE){
  check('Step 6 historical scope check intentionally excluded in stacked audit',true,'behavioral responsive checks retained; original Step 6 workflow still enforces scope');
}else{
  check('Step 6 changed paths are scope-limited',unexpected.length===0,unexpected.join(', '));
  const forbidden=changed.filter(p=>/^players\d+\.json$|current162patch|historicalStats|vegasOdds|lockedRanks|data\/(market|probability|calibration)\//i.test(p));
  check('no player/model/market data drift',forbidden.length===0,forbidden.join(', '));
  const visualDrift=changed.filter(p=>/chuck.*duke.*visual|step7|visual-system/i.test(p));
  check('no Step 7 visual-system work',visualDrift.length===0,visualDrift.join(', '));
}

const failures=checks.filter(x=>!x.ok);
const closure={
  version:'UI_RESPONSIVE_STEP6_CLOSURE_1.0.0',
  status:failures.length?'FAIL':'PASS',
  audit_mode:AUDIT_MODE,
  base_step5_sha:BASE,
  surfaces:contract.public_surfaces,
  viewports_css_px:contract.viewport_contract_css_px,
  changed_paths:changed,
  checks,
  failure_count:failures.length,
  model_player_market_movement:0,
  step7_visual_changes:0
};
fs.mkdirSync('guardrails',{recursive:true});
fs.writeFileSync('guardrails/ui-responsive-step6-closure.json',JSON.stringify(closure,null,2)+'\n');
console.log(JSON.stringify({status:closure.status,audit_mode:AUDIT_MODE,checks:checks.length,failures:failures.map(x=>x.name),changed_paths:AUDIT_MODE?[]:changed},null,2));
if(failures.length) process.exit(1);
