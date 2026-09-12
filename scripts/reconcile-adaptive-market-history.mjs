import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root=process.cwd();
const ledgerPath='data/market/weekly-matchup-market-snapshots-2026.json';
const reportPath='analysis/adaptive-market-history-reconciliation.json';
const readJson=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const writeJson=(p,x)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),JSON.stringify(x,null,2)+'\n');};
const ts=x=>{const n=Date.parse(String(x||''));return Number.isFinite(n)?n:0;};

function refs(){
  const raw=execFileSync('git',['for-each-ref','--format=%(refname)','refs/remotes/origin/production/adaptive-market-*'],{encoding:'utf8'});
  return raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
}
function fromRef(ref){
  try{return JSON.parse(execFileSync('git',['show',`${ref}:${ledgerPath}`],{encoding:'utf8',maxBuffer:100*1024*1024}));}
  catch{return null;}
}
function allSnapshots(ledger){
  const out=[];
  for(const [gameId,g] of Object.entries(ledger?.games||{})) for(const s of g?.snapshots||[]) out.push({gameId,game:g,s});
  return out;
}

const base=readJson(ledgerPath);
base.games??={};
const seen=new Map();
const sourceById=new Map();
for(const x of allSnapshots(base)){seen.set(x.s.snapshot_id,x);sourceById.set(x.s.snapshot_id,new Set(['WORKTREE_BASE']));}

const branchRefs=refs();
const branchStats=[];
for(const ref of branchRefs){
  const ledger=fromRef(ref);
  if(!ledger){branchStats.push({ref,status:'NO_LEDGER',snapshots:0,new_snapshot_ids:0});continue;}
  let added=0,total=0;
  for(const x of allSnapshots(ledger)){
    total++;
    const id=x.s?.snapshot_id;
    if(!id) throw new Error(`${ref}: snapshot without snapshot_id`);
    if(!sourceById.has(id)) sourceById.set(id,new Set());
    sourceById.get(id).add(ref);
    if(!seen.has(id)){seen.set(id,x);added++;}
    else {
      const prior=JSON.stringify(seen.get(id).s);
      const current=JSON.stringify(x.s);
      if(prior!==current) throw new Error(`${ref}: conflicting payload for snapshot_id ${id}`);
    }
  }
  branchStats.push({ref,status:'READ',snapshots:total,new_snapshot_ids:added});
}

const games={};
for(const {gameId,game,s} of seen.values()){
  const g=games[gameId]??{week:game.week,away_team:game.away_team,home_team:game.home_team,kickoff:game.kickoff,snapshots:[]};
  for(const k of ['week','away_team','home_team','kickoff']) if(g[k]==null&&game[k]!=null) g[k]=game[k];
  g.snapshots.push(s);
  games[gameId]=g;
}
for(const g of Object.values(games)) g.snapshots.sort((a,b)=>ts(a.captured_at)-ts(b.captured_at)||String(a.snapshot_id).localeCompare(String(b.snapshot_id)));

const out={...base,games};
writeJson(ledgerPath,out);
const baseCount=allSnapshots(base).length;
const unionCount=allSnapshots(out).length;
const recovered=unionCount-baseCount;
const uniqueBranchSnapshots=branchStats.reduce((n,x)=>n+x.new_snapshot_ids,0);
const report={
  generated_at:new Date().toISOString(),
  result:'PASS',
  ledger:ledgerPath,
  branch_pattern:'refs/remotes/origin/production/adaptive-market-*',
  branches_scanned:branchRefs.length,
  base_snapshot_count:baseCount,
  reconciled_snapshot_count:unionCount,
  recovered_snapshot_count:recovered,
  branch_discovery_additions:uniqueBranchSnapshots,
  duplicate_snapshot_ids:sourceById.size-unionCount,
  branch_stats:branchStats
};
writeJson(reportPath,report);
console.log(JSON.stringify(report,null,2));
