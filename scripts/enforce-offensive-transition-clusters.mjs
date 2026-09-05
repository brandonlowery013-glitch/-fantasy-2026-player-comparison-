import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(x,null,2)+'\n');};
const source=read('MODEL_SOURCE_OF_TRUTH.json');
const ledger=read('guardrails/current-football-review.json');
const report=read('analysis/transition-intelligence-current.json');
const expected=Number(source.active_player_model),shards=Number(source.runtime_player_shards);
let players=[];for(let i=0;i<shards;i++)players.push(...read(`players${i}.json`));
if(players.length!==expected)throw new Error(`Universe mismatch ${players.length}/${expected}`);
const teamMap={'Arizona Cardinals':'ARI','Atlanta Falcons':'ATL','Baltimore Ravens':'BAL','Buffalo Bills':'BUF','Carolina Panthers':'CAR','Chicago Bears':'CHI','Cincinnati Bengals':'CIN','Cleveland Browns':'CLE','Dallas Cowboys':'DAL','Denver Broncos':'DEN','Detroit Lions':'DET','Green Bay Packers':'GB','Houston Texans':'HOU','Indianapolis Colts':'IND','Jacksonville Jaguars':'JAX','Kansas City Chiefs':'KC','Las Vegas Raiders':'LV','Los Angeles Chargers':'LAC','Los Angeles Rams':'LA','Miami Dolphins':'MIA','Minnesota Vikings':'MIN','New England Patriots':'NE','New Orleans Saints':'NO','New York Giants':'NYG','New York Jets':'NYJ','Philadelphia Eagles':'PHI','Pittsburgh Steelers':'PIT','San Francisco 49ers':'SF','Seattle Seahawks':'SEA','Tampa Bay Buccaneers':'TB','Tennessee Titans':'TEN','Washington Commanders':'WAS'};
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const explicitTransitionRe=/\b(new|first year|new look|overhaul|revamp|install|installation|transition|changed|change|different)\b.{0,120}\b(offense|offensive coordinator|oc|play caller|playcaller|scheme|system|quarterback|qb)\b|\b(new offensive coordinator|new oc|new play caller|new playcaller|new offense|new scheme|new system|quarterback competition|qb competition|named .* starting quarterback|named .* starter|starting quarterback|new starting quarterback)\b/i;
const majorPersonnelRe=/\b(traded|trade|signed|signing|released|departure|departed|added|addition|acquired|waived|cut)\b.{0,120}\b(quarterback|qb|wide receiver|receiver|tight end|running back)\b|\b(quarterback|qb|wide receiver|receiver|tight end|running back)\b.{0,120}\b(traded|trade|signed|signing|released|departure|departed|added|addition|acquired|waived|cut)\b/i;
const skillPositions=new Set(['QB','RB','WR','TE']);
const foundationCats=new Set(['scheme_install','adaptation','teammate_environment']);
const trajectoryCats=new Set(['scheme_install','adaptation','teammate_environment','role_usage','competition','chemistry']);
const rowsByPlayer=new Map((report.rows||[]).map(r=>[r.player,r]));
const ledgerByPlayer=new Map((ledger.players||[]).map(r=>[r.player,r]));
const evidenceByTeam=new Map();
for(const row of report.rows||[]){
  for(const e of row.development_evidence||[]){
    const team=e.team||row.team;if(!team)continue;
    const txt=norm(`${e.headline||''} ${e.description||''} ${e.matched_context||''} ${e.body_text||''}`);
    const cats=[...(e.categories||[])].filter(c=>trajectoryCats.has(c));
    if(!cats.length)continue;
    const arr=evidenceByTeam.get(team)||[];
    const k=e.url||`${e.source}|${e.headline}|${e.description}`;
    if(!arr.some(x=>x.key===k))arr.push({key:k,row_player:row.player,evidence:e,txt,categories:cats,explicit:explicitTransitionRe.test(txt),major_personnel:majorPersonnelRe.test(txt)});
    evidenceByTeam.set(team,arr);
  }
}
const triggersByTeam=new Map();const trajectoryDiagnostics=[];
for(const [team,items] of evidenceByTeam){
  const playersSeen=new Set(items.map(x=>x.row_player));
  const cats=new Set(items.flatMap(x=>x.categories));
  const explicit=items.filter(x=>x.explicit||x.major_personnel);
  const hasFoundation=[...cats].some(c=>foundationCats.has(c));
  const corroborated=items.length>=2&&playersSeen.size>=2&&cats.size>=2&&hasFoundation;
  const denseTrajectory=items.length>=3&&playersSeen.size>=2&&cats.size>=3;
  const qualifies=explicit.length>0||corroborated||denseTrajectory;
  trajectoryDiagnostics.push({team,evidence_documents:items.length,players_represented:playersSeen.size,categories:[...cats],explicit_trigger_documents:explicit.length,corroborated,dense_trajectory:denseTrajectory,qualifies});
  if(!qualifies)continue;
  const selected=(explicit.length?explicit:items).slice(0,10).map(x=>({...x.evidence,team,cluster_trigger:true,team_context_only:true,direct_player_evidence:false,cluster_trigger_basis:explicit.length?'EXPLICIT_TEAM_TRANSITION_OR_MAJOR_PERSONNEL':'CORROBORATED_MULTI_PLAYER_TEAM_TRAJECTORY'}));
  triggersByTeam.set(team,selected);
}
const clusterRows=[];
for(const p of players){
  if(!skillPositions.has(String(p.p||'').toUpperCase()))continue;
  const team=teamMap[p.t];if(!team)continue;
  const triggers=triggersByTeam.get(team)||[];if(!triggers.length)continue;
  const row=rowsByPlayer.get(p.n),led=ledgerByPlayer.get(p.n);if(!row||!led)throw new Error(`Missing transition row for ${p.n}`);
  const existing=new Set((row.development_evidence||[]).map(e=>e.url||`${e.source}|${e.headline}|${e.description}`));
  const injected=triggers.filter(e=>!existing.has(e.url||`${e.source}|${e.headline}|${e.description}`)).slice(0,10);
  row.development_evidence=[...(row.development_evidence||[]),...injected].slice(0,50);
  row.team_context_count=(row.team_context_count||0)+injected.length;
  row.categories_covered=[...new Set([...(row.categories_covered||[]),'offensive_transition_cluster'])];
  row.transition_signal='EVIDENCE_FOUND';
  row.offensive_transition_cluster={required:true,team,trigger_count:triggers.length,trigger_bases:[...new Set(triggers.map(x=>x.cluster_trigger_basis))],rule:'EXPLICIT OR CORROBORATED MULTI-PLAYER OFFENSIVE TRAJECTORY FORCES ALL TRACKED QB_RB_WR_TE ON TEAM INTO REVIEW'};
  led.transition_intelligence={...(led.transition_intelligence||{}),team_context_count:row.team_context_count,categories_covered:row.categories_covered,transition_signal:row.transition_signal,evidence:row.development_evidence,offensive_transition_cluster:row.offensive_transition_cluster};
  clusterRows.push({player:p.n,pos:p.p,team,trigger_count:triggers.length});
}
const requiredClusterPlayers=players.filter(p=>skillPositions.has(String(p.p||'').toUpperCase())&&triggersByTeam.has(teamMap[p.t])).map(p=>p.n);
const covered=new Set(clusterRows.map(x=>x.player));const missing=requiredClusterPlayers.filter(n=>!covered.has(n));
report.schema_version='1.3.0';
report.counts={...(report.counts||{}),offensive_transition_cluster_players:clusterRows.length,offensive_transition_teams:triggersByTeam.size};
report.offensive_transition_cluster={mandatory:true,team_count:triggersByTeam.size,player_count:clusterRows.length,trigger_policy:'EXPLICIT TEAM CHANGE OR CORROBORATED MULTI-PLAYER/MULTI-CATEGORY TRAJECTORY',trajectory_diagnostics:trajectoryDiagnostics,teams:[...triggersByTeam.entries()].map(([team,evidence])=>({team,trigger_count:evidence.length,trigger_bases:[...new Set(evidence.map(x=>x.cluster_trigger_basis))],evidence:evidence.slice(0,10)})),rows:clusterRows};
ledger.transition_intelligence_schema={...(ledger.transition_intelligence_schema||{}),version:'1.3.0',offensive_transition_cluster_mandatory:true,cluster_rule:'EXPLICIT OR CORROBORATED TEAM TRAJECTORY FORCES ALL TRACKED QB_RB_WR_TE REVIEW'};
write('analysis/transition-intelligence-current.json',report);write('guardrails/current-football-review.json',ledger);
if(missing.length)throw new Error(`TRANSITION_CLUSTER_MISSING_TRACKED_PLAYERS: ${missing.join(', ')}`);
console.log(JSON.stringify({result:'PASS',transition_teams:triggersByTeam.size,cluster_players:clusterRows.length,trajectory_candidates:trajectoryDiagnostics.length,corroborated_teams:trajectoryDiagnostics.filter(x=>x.corroborated).map(x=>x.team)},null,2));
