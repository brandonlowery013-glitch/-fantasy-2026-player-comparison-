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
const triggerRe=/\b(new|first year|new look|overhaul|revamp|install|installation|transition|changed|change|different)\b.{0,100}\b(offense|offensive coordinator|oc|play caller|playcaller|scheme|system|quarterback|qb)\b|\b(new offensive coordinator|new oc|new play caller|new playcaller|new offense|new scheme|new system|quarterback competition|qb competition|named .* starting quarterback|named .* starter|starting quarterback|new starting quarterback)\b/i;
const majorPersonnelRe=/\b(traded|trade|signed|signing|released|departure|departed|added|addition|acquired)\b.{0,110}\b(quarterback|qb|wide receiver|receiver|tight end|running back)\b|\b(quarterback|qb|wide receiver|receiver|tight end|running back)\b.{0,110}\b(traded|trade|signed|signing|released|departure|departed|added|addition|acquired)\b/i;
const skillPositions=new Set(['QB','RB','WR','TE']);
const rowsByPlayer=new Map((report.rows||[]).map(r=>[r.player,r]));
const ledgerByPlayer=new Map((ledger.players||[]).map(r=>[r.player,r]));
const triggersByTeam=new Map();
for(const row of report.rows||[]){
  for(const e of row.development_evidence||[]){
    const txt=norm(`${e.headline||''} ${e.description||''} ${e.matched_context||''} ${e.body_text||''}`);
    const cats=new Set(e.categories||[]);
    const qualifies=(cats.has('scheme_install')||cats.has('adaptation')||cats.has('teammate_environment'))&&(triggerRe.test(txt)||majorPersonnelRe.test(txt));
    if(!qualifies)continue;
    const team=e.team||row.team;if(!team)continue;
    const arr=triggersByTeam.get(team)||[];
    const key=e.url||`${e.headline}|${e.description}`;
    if(!arr.some(x=>(x.url||`${x.headline}|${x.description}`)===key))arr.push({...e,team,cluster_trigger:true,team_context_only:true,direct_player_evidence:false});
    triggersByTeam.set(team,arr);
  }
}
const clusterRows=[];
for(const p of players){
  if(!skillPositions.has(String(p.p||'').toUpperCase()))continue;
  const team=teamMap[p.t];if(!team)continue;
  const triggers=triggersByTeam.get(team)||[];if(!triggers.length)continue;
  const row=rowsByPlayer.get(p.n);const led=ledgerByPlayer.get(p.n);
  if(!row||!led)throw new Error(`Missing transition row for ${p.n}`);
  const existing=new Set((row.development_evidence||[]).map(e=>e.url||`${e.headline}|${e.description}`));
  const injected=triggers.filter(e=>!existing.has(e.url||`${e.headline}|${e.description}`)).slice(0,8);
  row.development_evidence=[...(row.development_evidence||[]),...injected].slice(0,40);
  row.team_context_count=(row.team_context_count||0)+injected.length;
  row.categories_covered=[...new Set([...(row.categories_covered||[]),'offensive_transition_cluster'])];
  row.transition_signal='EVIDENCE_FOUND';
  row.offensive_transition_cluster={required:true,team,trigger_count:triggers.length,rule:'MAJOR_TEAM_OFFENSIVE_CHANGE_FORCES_CORE_QB_RB_WR_TE_REVIEW'};
  led.transition_intelligence={...(led.transition_intelligence||{}),team_context_count:row.team_context_count,categories_covered:row.categories_covered,transition_signal:row.transition_signal,evidence:row.development_evidence,offensive_transition_cluster:row.offensive_transition_cluster};
  clusterRows.push({player:p.n,pos:p.p,team,trigger_count:triggers.length});
}
report.schema_version='1.2.0';
report.counts={...(report.counts||{}),offensive_transition_cluster_players:clusterRows.length,offensive_transition_teams:triggersByTeam.size};
report.offensive_transition_cluster={mandatory:true,team_count:triggersByTeam.size,player_count:clusterRows.length,teams:[...triggersByTeam.entries()].map(([team,evidence])=>({team,trigger_count:evidence.length,evidence:evidence.slice(0,8)})),rows:clusterRows};
ledger.transition_intelligence_schema={...(ledger.transition_intelligence_schema||{}),version:'1.2.0',offensive_transition_cluster_mandatory:true,cluster_rule:'MAJOR_TEAM_OFFENSIVE_CHANGE_FORCES_CORE_QB_RB_WR_TE_REVIEW'};
write('analysis/transition-intelligence-current.json',report);
write('guardrails/current-football-review.json',ledger);
const uncovered=[...triggersByTeam.keys()].filter(team=>!clusterRows.some(r=>r.team===team));if(uncovered.length)throw new Error(`TRANSITION_CLUSTER_UNCOVERED_TEAMS: ${uncovered.join(', ')}`);
console.log(JSON.stringify({result:'PASS',transition_teams:triggersByTeam.size,cluster_players:clusterRows.length},null,2));
