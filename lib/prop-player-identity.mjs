// Market coverage includes the full roster; model coverage remains a separate gate.
export const normalizePlayer = name => String(name || '').normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
const team = t => ({WSH:'WAS',LAR:'LA'}[t] || t);
export function playerResolver(canonical, personnel) {
  const roster=Object.values(personnel?.teams || {}).flatMap(t=>(t.players || []).map(p=>({...p,team:team(p.team || t.team)})));
  return (name,game,stat) => {
    const allowed=stat.startsWith('passing_')?['QB']:['QB','RB','FB','WR','TE'];
    const candidates=roster.filter(p=>normalizePlayer(p.name)===normalizePlayer(name)&&allowed.includes(p.position)&&[team(game.home_team),team(game.away_team)].includes(p.team));
    const unique=[...new Map(candidates.map(p=>[p.athlete_id || `${p.team}|${p.name}|${p.position}`,p])).values()];
    if(unique.length!==1)return {name,position:'UNKNOWN',provider_player_name:name,identity_status:unique.length?'AMBIGUOUS':'UNRESOLVED',market_only:true};
    const p=unique[0],aliases=canonical.filter(c=>normalizePlayer(c.n)===normalizePlayer(p.name)&&c.p===p.position);
    return {name:aliases.length===1?aliases[0].n:p.name,position:p.position,athlete_id:p.athlete_id,team:p.team,provider_player_name:name,identity_status:'ROSTER_MATCHED',market_only:aliases.length!==1};
  };
}
export function earlyPropRefreshNeeded(gameState,keys,now,coverageVersion=2) {
  return keys.length>0 && (gameState.coverage_version!==coverageVersion || !gameState.last_prop_fetch_at || now-Date.parse(gameState.last_prop_fetch_at)>=24*3600000 || keys.some(k=>!(gameState.last_fetched_markets || gameState.last_available_markets || []).includes(k)));
}
