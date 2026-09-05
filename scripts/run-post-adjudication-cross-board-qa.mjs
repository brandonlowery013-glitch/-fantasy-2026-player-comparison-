import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const exists=p=>fs.existsSync(path.join(root,p));
const src=read('MODEL_SOURCE_OF_TRUTH.json');
const expected=Number(src.active_player_model), shards=Number(src.runtime_player_shards);
let players=[]; for(let i=0;i<shards;i++) players.push(...read(`players${i}.json`));
const fail=[]; const warn=[];
const names=players.map(p=>p.n); const nameSet=new Set(names);
if(players.length!==expected) fail.push(`player_count:${players.length}/${expected}`);
if(nameSet.size!==expected) fail.push(`unique_player_count:${nameSet.size}/${expected}`);
const seq=n=>Array.from({length:n},(_,i)=>i+1);
const overall=players.map(p=>Number(p.o)).sort((a,b)=>a-b);
const tv=players.map(p=>Number(p.tr)).sort((a,b)=>a-b);
if(JSON.stringify(overall)!==JSON.stringify(seq(expected))) fail.push('overall_ranks_not_unique_1_N');
if(JSON.stringify(tv)!==JSON.stringify(seq(expected))) fail.push('true_value_ranks_not_unique_1_N');
const required=['n','p','o','tr','s','pd','ce','r','e','a','rl','su'];
for(const p of players){const m=required.filter(k=>p[k]===null||p[k]===undefined); if(m.length) fail.push(`${p.n}:missing:${m.join(',')}`);}
const allowedPx=new Set(['BUY','FAIR','REACH','FADE']);
const pendingCost=players.filter(p=>!allowedPx.has(p.px));
if(pendingCost.length>4) fail.push(`market_value_missing_or_invalid:${pendingCost.length}`);
if(pendingCost.length) warn.push(`price_discovery_pending:${pendingCost.map(p=>p.n).join('|')}`);
const board=read('canonicalBoards2026.json');
if(Number(board.active_players)!==expected) fail.push(`canonicalBoards.active_players:${board.active_players}/${expected}`);
const bo=Array.isArray(board.overall)?board.overall:[];
if(bo.length!==expected) fail.push(`canonicalBoards.overall_count:${bo.length}/${expected}`);
const byPlayer=new Map(players.map(p=>[p.n,p]));
const boardMismatch=[];
for(const b of bo){const p=byPlayer.get(b.n); if(!p){boardMismatch.push(`${b.n}:missing_player`);continue;} for(const k of ['p','o','tr','s','pd','ce','r','e','a','rl','su','px']){const a=b[k],c=p[k]; if(a===undefined&&c===undefined)continue; if(typeof a==='number'||typeof c==='number'){if(Math.abs(Number(a)-Number(c))>1e-9)boardMismatch.push(`${b.n}:${k}:${a}!=${c}`);} else if((a??null)!==(c??null)) boardMismatch.push(`${b.n}:${k}:${a}!=${c}`);}}
if(boardMismatch.length) fail.push(`canonical_board_mismatches:${boardMismatch.length}`);
const locked=read('lockedRanks2026.json'); const lockedMap=locked.players||{};
const lockedMissing=names.filter(n=>!lockedMap[n]);
if(lockedMissing.length) fail.push(`lockedRanks_missing:${lockedMissing.length}`);
const lockedMismatch=[];
for(const p of players){const l=lockedMap[p.n]; if(!l)continue; if(Number(l.trueValueRank)!==Number(p.tr)) lockedMismatch.push(`${p.n}:${l.trueValueRank}->${p.tr}`);}
if(lockedMismatch.length) fail.push(`locked_true_value_mismatches:${lockedMismatch.length}`);
if(exists('comparison-sync-162-audit.json')){const c=read('comparison-sync-162-audit.json'); if(Number(c.active_players)!==expected) fail.push(`comparison_audit_active_players:${c.active_players}/${expected}`); if(c.runtime&&Number(c.runtime.active_players)!==expected) fail.push(`comparison_runtime_active_players:${c.runtime.active_players}/${expected}`);}
const html=fs.readFileSync('index-backup.html','utf8');
const shardNeed=`Array.from({length:${shards}}`; if(!html.includes(shardNeed)) fail.push(`runtime_loader_not_${shards}_shards`);
if(!html.includes('Player Quality Rank')) fail.push('runtime_missing_player_quality_label');
if(!html.includes('Expected Production')) fail.push('runtime_missing_projection_comparison');
if(!html.includes('runtime-rank-movement-context-2026.js')) fail.push('runtime_rank_movement_not_mounted');
if(exists('rankMovement2026.json')){const r=read('rankMovement2026.json'); if(Number(r.active_players)!==expected) fail.push(`rankMovement_active_players:${r.active_players}/${expected}`);}
const report={schema_version:'1.0.1',generated_at:new Date().toISOString(),source_head:process.env.GITHUB_SHA||null,expected_players:expected,shards,passed:fail.length===0,failures:fail,warnings:warn,details:{pending_cost_players:pendingCost.map(p=>p.n),canonical_board_mismatches:boardMismatch,locked_rank_mismatches:lockedMismatch,locked_missing_players:lockedMissing}};
fs.mkdirSync('analysis',{recursive:true}); fs.writeFileSync('analysis/post-adjudication-cross-board-qa-current.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(fail.length) process.exit(1);
