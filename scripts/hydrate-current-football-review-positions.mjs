import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>fs.writeFileSync(path.join(root,p),JSON.stringify(x,null,2)+'\n');

const src=read('MODEL_SOURCE_OF_TRUTH.json');
const expected=Number(src.active_player_model);
const shardCount=Number(src.runtime_player_shards);
if(!Number.isInteger(shardCount)||shardCount<1) throw new Error(`Invalid runtime_player_shards: ${src.runtime_player_shards}`);

const allowed=new Set(['RB','QB','WR','TE']);
const canonical=new Map();
const counts={RB:0,QB:0,WR:0,TE:0};
for(let i=0;i<shardCount;i++){
  const rows=read(`players${i}.json`);
  for(const row of rows){
    const name=String(row.n||'').trim();
    const pos=String(row.p||'').toUpperCase();
    if(!name||!allowed.has(pos)) throw new Error(`Invalid canonical player position in players${i}.json: ${name||'<missing>'} ${pos||'<missing>'}`);
    if(canonical.has(name)) throw new Error(`Duplicate canonical player: ${name}`);
    canonical.set(name,pos);counts[pos]++;
  }
}
if(canonical.size!==expected) throw new Error(`Canonical position map ${canonical.size}/${expected}`);

const ledger=read('guardrails/current-football-review.json');
if((ledger.players||[]).length!==expected) throw new Error(`Review ledger ${(ledger.players||[]).length}/${expected}`);
const missing=[];
for(const row of ledger.players){
  const pos=canonical.get(row.player);
  if(!pos){missing.push(row.player);continue;}
  row.position=pos;
}
if(missing.length) throw new Error(`Missing canonical positions: ${missing.join(', ')}`);
if((ledger.players||[]).some(x=>!allowed.has(String(x.position||'').toUpperCase()))) throw new Error('OTHER/unsupported position survived canonical hydration');
ledger.canonical_position_hydration={source:'players*.json',runtime_player_shards:shardCount,coverage:canonical.size,counts,other:0,required_for_position_specific_news_audit:true};
write('guardrails/current-football-review.json',ledger);
console.log(JSON.stringify({result:'PASS',coverage:canonical.size,counts,other:0},null,2));
