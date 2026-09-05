import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const src=read('MODEL_SOURCE_OF_TRUTH.json');
const expected=Number(src.active_player_model), shards=Number(src.runtime_player_shards);
let players=[];for(let i=0;i<shards;i++)players.push(...read(`players${i}.json`));
if(players.length!==expected)throw new Error(`Universe mismatch ${players.length}/${expected}`);
const by=new Map(players.map(p=>[p.n,p]));
const locked=read('lockedRanks2026.json');
for(const [name,row] of Object.entries(locked.players||{})){
  const p=by.get(name); if(!p) throw new Error(`Locked player missing from active universe: ${name}`);
  row.trueValueRank=Number(p.tr);
  row.trueValuePos=p.tp||row.trueValuePos;
}
for(const p of players){
  if(!locked.players[p.n]) locked.players[p.n]={trueValueRank:Number(p.tr),trueValuePos:p.tp||null};
}
locked.as_of='2026-09-05';
locked.source='Post-adjudication 166-player canonical synchronization after PR #190; True-Value locks mirror current canonical player shards.';
fs.writeFileSync(path.join(root,'lockedRanks2026.json'),JSON.stringify(locked,null,2)+'\n');
const indexPath=path.join(root,'index-backup.html');
let html=fs.readFileSync(indexPath,'utf8');
if(!html.includes('runtime-rank-movement-context-2026.js')) html=html.replace('</body>','<script src="runtime-rank-movement-context-2026.js?v=20260905-post-adjudication"></script>\n</body>');
fs.writeFileSync(indexPath,html);
console.log(JSON.stringify({result:'SYNC_REPAIR_APPLIED',players:expected,locked_rows:Object.keys(locked.players||{}).length,rank_movement_runtime_mounted:html.includes('runtime-rank-movement-context-2026.js')},null,2));
