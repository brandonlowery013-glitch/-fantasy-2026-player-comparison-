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
const teamWords={ARI:['arizona','cardinals'],ATL:['atlanta','falcons'],BAL:['baltimore','ravens'],BUF:['buffalo','bills'],CAR:['carolina','panthers'],CHI:['chicago','bears'],CIN:['cincinnati','bengals'],CLE:['cleveland','browns'],DAL:['dallas','cowboys'],DEN:['denver','broncos'],DET:['detroit','lions'],GB:['green bay','packers'],HOU:['houston','texans'],IND:['indianapolis','colts'],JAX:['jacksonville','jaguars','jags'],KC:['kansas city','chiefs'],LV:['las vegas','raiders'],LAC:['los angeles chargers','chargers'],LA:['los angeles rams','rams'],MIA:['miami','dolphins'],MIN:['minnesota','vikings'],NE:['new england','patriots'],NO:['new orleans','saints'],NYG:['new york giants','giants'],NYJ:['new york jets','jets'],PHI:['philadelphia','eagles'],PIT:['pittsburgh','steelers'],SF:['san francisco','49ers','niners'],SEA:['seattle','seahawks'],TB:['tampa bay','buccaneers','bucs'],TEN:['tennessee','titans'],WAS:['washington','commanders']};
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const explicitTransitionRe=/\b(new|first year|new look|overhaul|revamp|install|installation|transition|changed|change|different)\b.{0,120}\b(offense|offensive coordinator|oc|play caller|playcaller|scheme|system|quarterback|qb)\b|\b(new offensive coordinator|new oc|new play caller|new playcaller|new offense|new scheme|new system|quarterback competition|qb competition|named .* starting quarterback|named .* starter|starting quarterback|new starting quarterback)\b/i;
const qbTransitionRe=/\b(quarterback|qb)\b.{0,90}\b(traded|trade|signed|signing|released|departure|departed|acquired|named|starter|starting|competition)\b|\b(traded|trade|signed|signing|released|departure|departed|acquired|named|starter|starting|competition)\b.{0,90}\b(quarterback|qb)\b/i;
const skillPositions=new Set(['QB','RB','WR','TE']);
const foundationCats=new Set(['scheme_install','adaptation']);
const trajectoryCats=new Set(['scheme_install','adaptation','teammate_environment','role_usage','competition','chemistry']);
const rowsByPlayer=new Map((report.rows||[]).map(r=>[r.player,r]));
const ledgerByPlayer=new Map((ledger.players||[]).map(r=>[r.player,r]));
const canonicalTeamByPlayer=new Map(players.map(p=>[p.n,teamMap[p.t]||null]));
const playersByTeam=new Map();for(const p of players){const tm=teamMap[p.t];if(!tm)continue;const arr=playersByTeam.get(tm)||[];arr.push(p.n);playersByTeam.set(tm,arr);}
const localText=e=>norm(`${e.headline||''} ${e.description||''} ${e.matched_context||''}`);
const mentions=(txt,phrase)=>{const n=norm(phrase);return n&&txt.includes(n);};
function boundToCanonicalTeam(row,e){
  const canonical=canonicalTeamByPlayer.get(row.player)||row.team||null;if(!canonical)return{ok:false,reason:'NO_CANONICAL_TEAM'};
  const txt=localText(e);if(!txt)return{ok:false,reason:'NO_LOCAL_CONTEXT'};
  const direct=Boolean(e.direct_player_evidence)&&mentions(txt,row.player);
  if(direct)return{ok:true,team:canonical,basis:'DIRECT_PLAYER_LOCAL_CONTEXT'};
  if(e.team_context_only!==true)return{ok:false,reason:'NOT_DIRECT_OR_TEAM_CONTEXT'};
  if(e.team&&String(e.team).toUpperCase()!==canonical)return{ok:false,reason:'SOURCE_TEAM_CANONICAL_MISMATCH'};
  const teamNamed=(teamWords[canonical]||[]).some(x=>mentions(txt,x));
  const teammateNamed=(playersByTeam.get(canonical)||[]).some(name=>mentions(txt,name));
  if(!teamNamed&&!teammateNamed)return{ok:false,reason:'LOCAL_CONTEXT_NOT_BOUND_TO_CANONICAL_TEAM'};
  return{ok:true,team:canonical,basis:teamNamed?'LOCAL_TEAM_IDENTITY':'LOCAL_CANONICAL_TEAMMATE'};
}
function regressionTests(){
  const fakeRows=[
    {player:'Cam Skattebo',team:'NYG',e:{team:'NYG',team_context_only:true,headline:'NFL news roundup: Titans WR Wan\'Dale Robinson not believed to have suffered concussion',description:'Latest league news'}},
    {player:'Alec Pierce',team:'IND',e:{team:'IND',team_context_only:true,headline:'NFL news roundup: Dolphins trading WR Tutu Atwell back to Rams; Packers signing TE Jonnu Smith',description:'Latest league news'}},
    {player:'Trey McBride',team:'ARI',e:{team:'ARI',team_context_only:true,headline:'Transaction: Traded RB Corey Kiner to New England for a 2028 seventh-round pick.',description:'Traded RB Corey Kiner to New England.'}}
  ];
  for(const x of fakeRows)if(boundToCanonicalTeam(x,x.e).ok)throw new Error(`CLUSTER_BINDING_REGRESSION_FAILED: ${x.player}`);
  const positive={player:'Alec Pierce',team:'IND',e:{team:'IND',team_context_only:true,headline:'Transaction: Activated WR Alec Pierce from the PUP list.',description:'Activated WR Alec Pierce.'}};
  if(!boundToCanonicalTeam(positive,positive.e).ok)throw new Error('CLUSTER_BINDING_POSITIVE_CONTROL_FAILED');
}
regressionTests();
const evidenceByTeam=new Map(),rejected=[];
for(const row of report.rows||[]){
  for(const e of row.development_evidence||[]){
    const bind=boundToCanonicalTeam(row,e);if(!bind.ok){if((e.categories||[]).some(c=>trajectoryCats.has(c)))rejected.push({row_player:row.player,reported_team:e.team||null,canonical_team:canonicalTeamByPlayer.get(row.player)||row.team||null,headline:e.headline||null,reason:bind.reason});continue;}
    const team=bind.team,txt=localText(e),cats=[...(e.categories||[])].filter(c=>trajectoryCats.has(c));if(!cats.length)continue;
    const arr=evidenceByTeam.get(team)||[],k=e.url||`${e.source}|${e.headline}|${e.description}`;
    if(!arr.some(x=>x.key===k))arr.push({key:k,row_player:row.player,evidence:e,txt,categories:cats,binding_basis:bind.basis,explicit:explicitTransitionRe.test(txt),qb_transition:qbTransitionRe.test(txt)});
    evidenceByTeam.set(team,arr);
  }
}
const triggersByTeam=new Map(),trajectoryDiagnostics=[];
for(const [team,items] of evidenceByTeam){
  const playersSeen=new Set(items.map(x=>x.row_player)),cats=new Set(items.flatMap(x=>x.categories));
  const explicit=items.filter(x=>x.explicit||x.qb_transition),hasFoundation=[...cats].some(c=>foundationCats.has(c));
  const corroborated=items.length>=2&&playersSeen.size>=2&&cats.size>=2&&hasFoundation;
  const denseTrajectory=items.length>=3&&playersSeen.size>=2&&cats.size>=3&&hasFoundation;
  const qualifies=explicit.length>0||corroborated||denseTrajectory;
  trajectoryDiagnostics.push({team,evidence_documents:items.length,players_represented:playersSeen.size,categories:[...cats],explicit_trigger_documents:explicit.length,has_scheme_or_adaptation_foundation:hasFoundation,corroborated,dense_trajectory:denseTrajectory,qualifies});
  if(!qualifies)continue;
  const selected=(explicit.length?explicit:items).slice(0,10).map(x=>({...x.evidence,team,cluster_trigger:true,team_context_only:true,direct_player_evidence:false,canonical_binding_basis:x.binding_basis,cluster_trigger_basis:explicit.length?'EXPLICIT_SCHEME_OR_QB_TRANSITION':'CORROBORATED_MULTI_PLAYER_TEAM_TRAJECTORY'}));
  triggersByTeam.set(team,selected);
}
const clusterRows=[];
for(const p of players){
  if(!skillPositions.has(String(p.p||'').toUpperCase()))continue;const team=teamMap[p.t];if(!team)continue;
  const triggers=triggersByTeam.get(team)||[];if(!triggers.length)continue;
  const row=rowsByPlayer.get(p.n),led=ledgerByPlayer.get(p.n);if(!row||!led)throw new Error(`Missing transition row for ${p.n}`);
  const existing=new Set((row.development_evidence||[]).map(e=>e.url||`${e.source}|${e.headline}|${e.description}`));
  const injected=triggers.filter(e=>!existing.has(e.url||`${e.source}|${e.headline}|${e.description}`)).slice(0,10);
  row.development_evidence=[...(row.development_evidence||[]),...injected].slice(0,50);row.team_context_count=(row.team_context_count||0)+injected.length;
  row.categories_covered=[...new Set([...(row.categories_covered||[]),'offensive_transition_cluster'])];row.transition_signal='EVIDENCE_FOUND';
  row.offensive_transition_cluster={required:true,team,trigger_count:triggers.length,trigger_bases:[...new Set(triggers.map(x=>x.cluster_trigger_basis))],rule:'ONLY CANONICALLY BOUND LOCAL EVIDENCE; EXPLICIT SCHEME/QB CHANGE OR CORROBORATED SCHEME/ADAPTATION TRAJECTORY FORCES TRACKED QB_RB_WR_TE REVIEW'};
  led.transition_intelligence={...(led.transition_intelligence||{}),team_context_count:row.team_context_count,categories_covered:row.categories_covered,transition_signal:row.transition_signal,evidence:row.development_evidence,offensive_transition_cluster:row.offensive_transition_cluster};
  clusterRows.push({player:p.n,pos:p.p,team,trigger_count:triggers.length});
}
const requiredClusterPlayers=players.filter(p=>skillPositions.has(String(p.p||'').toUpperCase())&&triggersByTeam.has(teamMap[p.t])).map(p=>p.n),covered=new Set(clusterRows.map(x=>x.player)),missing=requiredClusterPlayers.filter(n=>!covered.has(n));
report.schema_version='1.4.0';report.counts={...(report.counts||{}),offensive_transition_cluster_players:clusterRows.length,offensive_transition_teams:triggersByTeam.size,rejected_transition_evidence:rejected.length};
report.offensive_transition_cluster={mandatory:true,team_count:triggersByTeam.size,player_count:clusterRows.length,trigger_policy:'CANONICAL LOCAL BINDING + EXPLICIT SCHEME/QB CHANGE OR CORROBORATED SCHEME/ADAPTATION TRAJECTORY',binding_regression_tests:true,rejected_evidence_count:rejected.length,rejected_evidence:rejected.slice(0,100),trajectory_diagnostics:trajectoryDiagnostics,teams:[...triggersByTeam.entries()].map(([team,evidence])=>({team,trigger_count:evidence.length,trigger_bases:[...new Set(evidence.map(x=>x.cluster_trigger_basis))],evidence:evidence.slice(0,10)})),rows:clusterRows};
ledger.transition_intelligence_schema={...(ledger.transition_intelligence_schema||{}),version:'1.4.0',offensive_transition_cluster_mandatory:true,canonical_local_binding_required:true,cluster_rule:'EXPLICIT SCHEME/QB CHANGE OR CORROBORATED SCHEME/ADAPTATION TRAJECTORY FORCES TRACKED QB_RB_WR_TE REVIEW'};
write('analysis/transition-intelligence-current.json',report);write('guardrails/current-football-review.json',ledger);
if(missing.length)throw new Error(`TRANSITION_CLUSTER_MISSING_TRACKED_PLAYERS: ${missing.join(', ')}`);
if((report.offensive_transition_cluster.rejected_evidence||[]).some(x=>!x.reason))throw new Error('Rejected transition evidence missing reason');
console.log(JSON.stringify({result:'PASS',transition_teams:triggersByTeam.size,cluster_players:clusterRows.length,trajectory_candidates:trajectoryDiagnostics.length,rejected_transition_evidence:rejected.length,qualified_teams:[...triggersByTeam.keys()]},null,2));
