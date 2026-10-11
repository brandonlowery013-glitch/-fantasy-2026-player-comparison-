export async function loadCanonicalPlayers(get){
  const truth=await get('MODEL_SOURCE_OF_TRUTH.json');
  if(truth.season!==2026||!Number.isInteger(truth.active_player_model)||truth.active_player_model<1||!Number.isInteger(truth.runtime_player_shards)||truth.runtime_player_shards<1||typeof truth.current_update_layer!=='string'||!/^[A-Za-z0-9._-]+\.json$/.test(truth.current_update_layer))throw Error('Invalid canonical player source');
  const [patch,...shards]=await Promise.all([get(truth.current_update_layer),...Array.from({length:truth.runtime_player_shards},(_,i)=>get(`players${i}.json`))]);
  if(shards.some(s=>!Array.isArray(s)))throw Error('Invalid player shard');
  const rows=shards.flat(),names=new Set(rows.map(p=>p.n));
  if(rows.length!==truth.active_player_model||names.size!==rows.length||rows.some(p=>!p.n))throw Error('Canonical player coverage mismatch');
  if(Object.keys(patch.players||{}).some(n=>!names.has(n)))throw Error('Current patch contains unknown player');
  const players=rows.map(p=>({...p,...patch.players?.[p.n]}));
  for(const rank of ['o','tr'])if(players.map(p=>p[rank]).sort((a,b)=>a-b).some((v,i)=>v!==i+1))throw Error(`Invalid ${rank} ranks`);
  if(players.some(p=>!p.p||!p.t||['s','pd','ce','r','e','a','rl','su','mp'].some(k=>typeof p[k]!=='number'||!Number.isFinite(p[k]))))throw Error('Incomplete calibrated player');
  return {truth,players};
}
export function displayPlayer(p){return {name:p.n,pos:p.p,team:p.t,overall:p.o,posRank:p.pr,trueRank:p.tr,truePosRank:p.tp,score:p.s,production:p.pd,ceiling:p.ce,role:p.r,environment:p.e,availability:p.a,reliability:p.rl,sustainability:p.su,median:p.mp,adp:null,price:p.px==='PRICE PENDING'?'PRICE PENDING':'MODEL REVIEW',overallWriteup:p.nm||p.en||'',recommendation:p.current_recommendation||p.na||'',injuryStatus:{active:/OUT FOR SEASON|SEASON.ENDING|INACTIVE/.test(p.st||'')},canonical:p};}
