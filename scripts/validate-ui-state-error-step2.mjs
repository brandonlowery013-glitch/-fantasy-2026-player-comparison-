import fs from 'node:fs';
import {currentPlatformInterface} from './lib/current-platform-interface.mjs';
const index=fs.readFileSync('index.html','utf8');
const canonical=fs.readFileSync('frontend/runtime-canonical-player-source-2026.js','utf8');
const model=fs.readFileSync('frontend/runtime-model-state-semantics-2026.js','utf8');
const checks=[
 [currentPlatformInterface().result==='PASS','current interface and all feature bootstrap contracts'],
 [index.includes('PLAYER_SOURCE_READY=false;CURRENT_CANONICAL=null;PLAYERS.splice(0)'),'required player failure clears stale player data'],
 [index.includes("document.getElementById('exportExcel').disabled=true")&&index.includes("document.getElementById('exportWord').disabled=true"),'exports disabled when player source fails'],
 [canonical.includes('Current player data is unavailable.')&&canonical.includes('ctd:canonical-players-failed'),'Cloudflare canonical-source failure is visible and emitted'],
 [model.includes("status:'FEED_UNAVAILABLE'")&&model.includes('actionable:false'),'model failures remain non-actionable'],
 [model.includes('add.disabled=!state.actionable'),'unapproved model actions disabled'],
 [model.includes('marketRaw?.universe!==expectedCount')&&model.includes('marketRaw.board.length!==expectedCount'),'market coverage checked against canonical manifest'],
 [index.includes('Live market feed unavailable:'),'game feed failure is visible'],
 [!model.includes('!==166'),'canonical roster is not frozen to 166 players']
];
const report={generated_at:new Date().toISOString(),result:checks.every(([ok])=>ok)?'PASS':'BLOCKED',architecture:'CTD_INTERFACE_LOCK_1',checks:checks.map(([ok,name])=>({name,passed:Boolean(ok)})),blocked:checks.filter(([ok])=>!ok).map(([,name])=>name)};
fs.mkdirSync('guardrails',{recursive:true});fs.writeFileSync('guardrails/ui-state-error-step2-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(report.blocked.length)process.exit(1);
