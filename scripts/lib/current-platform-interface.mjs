import fs from 'node:fs';
import path from 'node:path';

export function currentPlatformInterface(){
 const checks=[];
 const need=(ok,name)=>checks.push({name,passed:Boolean(ok)});
 for(const file of ['index.html',...(fs.existsSync('frontend/cloudflare/index.html')?['frontend/cloudflare/index.html']:[])]){
  const html=fs.readFileSync(file,'utf8');
  need(html.includes('CTD_INTERFACE_LOCK_1'),`${file}: current interface lock`);
  const nav=html.match(/<nav\b[\s\S]*?<\/nav>/)?.[0]||'';
  for(const page of ['playerPage','comparePage','weeklyPage','gamesPage']){
   need(nav.includes(`data-page="${page}"`),`${file}: ${page} navigation`);
   need(html.includes(`id="${page}"`),`${file}: ${page} destination`);
  }
  need(html.includes("btn.addEventListener('click',()=>showPage(btn.dataset.page,btn))"),`${file}: navigation click handler`);
  need(html.includes('viewport-fit=cover')&&/@media\s*\(max-width:\s*\d+px\)/.test(html),`${file}: responsive viewport`);
  for(const id of ['seasonCategoryMount','weeklyCategoryMount','ctdGameTicker'])need(html.includes(`id="${id}"`),`${file}: ${id} mount`);
  need(html.includes('function renderWeekly(')&&html.includes('function loadFeed('),`${file}: weekly and games renderers`);
  need(html.includes('runtime-canonical-player-source-2026.js')||html.includes('CANONICAL_MODULES'),`${file}: canonical player source`);
  need(!html.includes('operations-dashboard.html'),`${file}: internal operations not in public navigation`);
  for(const match of html.matchAll(/<script[^>]*src="([^"]+)"/g)){
   const src=match[1].split('?')[0];
   if(!/^(?:https?:|data:)/.test(src))need(fs.existsSync(path.resolve(path.dirname(file),src)),`${file}: script ${src} exists`);
  }
 }
 if(fs.existsSync('frontend/cloudflare/index.html')){
  const cloud=fs.readFileSync('frontend/cloudflare/restore-lock1.js','utf8');
  need(cloud.includes("addEventListener('change',compare)"),'Cloudflare comparison changes are wired');
  const bootstraps=[...cloud.matchAll(/load\(['"]([^'"]+)['"]\)/g)].map(m=>m[1].split('?')[0]);
  for(const module of ['prop-board.js','game-detail-panels.js','news-updates.js','runtime-public-splits-2026.js','current-rank-views.js'])need(bootstraps.includes('./'+module),`Cloudflare ${module} bootstrap`);
 }else{
  const html=fs.readFileSync('index.html','utf8');
  need(html.includes('function renderCompare(')&&html.includes("el.addEventListener('change',renderCompare)"),'primary comparison changes are wired');
 }
 const source=JSON.parse(fs.readFileSync('MODEL_SOURCE_OF_TRUTH.json','utf8'));
 const board=JSON.parse(fs.readFileSync('data/market/market-value-board-2026.json','utf8'));
 need(board.universe===source.active_player_model&&board.board?.length===source.active_player_model,'market board matches canonical universe');
 need(board.authority==='COMPANION_ONLY_NO_INTRINSIC_RANK_MUTATION','market context cannot mutate intrinsic ranks');
 return {generated_at:new Date().toISOString(),result:checks.every(c=>c.passed)?'PASS':'BLOCKED',architecture:'CTD_INTERFACE_LOCK_1',checks,blocked:checks.filter(c=>!c.passed).map(c=>c.name)};
}
export function reportPlatform(file){
 const report=currentPlatformInterface();fs.mkdirSync('guardrails',{recursive:true});fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(report.blocked.length)process.exitCode=1;return report;
}
