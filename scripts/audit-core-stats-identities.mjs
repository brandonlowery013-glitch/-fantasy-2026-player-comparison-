import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const corePath=path.join(root,'data/probability/generated/historical-core-2021-2025.json');
if(!fs.existsSync(corePath)) throw new Error('Run ingest-historical-core.mjs first');
const data=JSON.parse(fs.readFileSync(corePath,'utf8'));
const rows=data.rows||[];

const players=[];
for(let i=0;i<13;i++) players.push(...JSON.parse(fs.readFileSync(path.join(root,`players${i}.json`),'utf8')));
const universe=new Map(players.map(p=>[p.n,p.p]));

const sample={
  QB:['Josh Allen','Joe Burrow','Lamar Jackson','Jalen Hurts','Patrick Mahomes','Baker Mayfield','Justin Herbert','Dak Prescott'],
  RB:['Saquon Barkley','Derrick Henry','Bijan Robinson','Jahmyr Gibbs','James Cook','Breece Hall','Josh Jacobs','Jonathan Taylor'],
  WR:["Ja'Marr Chase",'Justin Jefferson','Amon-Ra St. Brown','CeeDee Lamb','Nico Collins','A.J. Brown','Drake London','Mike Evans'],
  TE:['Travis Kelce','George Kittle','Trey McBride','Brock Bowers','Mark Andrews','Sam LaPorta','Dallas Goedert','T.J. Hockenson']
};

const normalize=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const n=v=>v==null||v===''||Number.isNaN(Number(v))?0:Number(v);
const sum=(arr,k)=>arr.reduce((s,r)=>s+n(r[k]),0);

const metricMap={
  pass_attempts:'passingAttempts',pass_yards:'passingYards',pass_tds:'passingTouchdowns',
  rush_attempts:'rushingAttempts',rush_yards:'rushingYards',rush_tds:'rushingTouchdowns',
  targets:'receivingTargets',receptions:'receptions',receiving_yards:'receivingYards',receiving_tds:'receivingTouchdowns'
};
const positionMetrics={
  QB:['pass_attempts','pass_yards','pass_tds','rush_attempts','rush_yards','rush_tds'],
  RB:['rush_attempts','rush_yards','rush_tds','targets','receptions','receiving_yards','receiving_tds'],
  WR:['rush_attempts','rush_yards','rush_tds','targets','receptions','receiving_yards','receiving_tds'],
  TE:['targets','receptions','receiving_yards','receiving_tds']
};

const structural=[];
const keySeen=new Set();
for(const r of rows){
  if(!universe.has(r.player)) structural.push({type:'unknown_player',player:r.player,season:r.season,week:r.week});
  else if(universe.get(r.player)!==r.position) structural.push({type:'position_mismatch',player:r.player,expected:universe.get(r.player),actual:r.position,season:r.season,week:r.week});
  const k=`${r.player}|${r.season}|${r.week}`;
  if(keySeen.has(k)) structural.push({type:'duplicate_key',key:k});
  keySeen.add(k);
  if(!Number.isInteger(Number(r.season))||r.season<2021||r.season>2025) structural.push({type:'bad_season',key:k,value:r.season});
  if(!Number.isInteger(Number(r.week))||r.week<1||r.week>18) structural.push({type:'bad_week',key:k,value:r.week});
}

async function resolveEspn(player){
  const url=`https://site.api.espn.com/apis/search/v2?query=${encodeURIComponent(player)}&limit=10&sport=football`;
  const res=await fetch(url,{headers:{'user-agent':'fantasy-2026-probability-pipeline'}});
  if(!res.ok) throw new Error(`ESPN search ${player}: ${res.status}`);
  const j=await res.json();
  const group=(j.results||[]).find(x=>x.type==='player');
  const hits=(group?.contents||[]).filter(x=>x.description==='NFL'&&normalize(x.displayName)===normalize(player));
  if(hits.length!==1) return {error:`expected 1 exact NFL athlete, found ${hits.length}`,url,hits:hits.map(x=>({displayName:x.displayName,uid:x.uid,subtitle:x.subtitle}))};
  const hit=hits[0];
  const m=String(hit.uid||'').match(/~a:(\d+)/);
  if(!m) return {error:'missing ESPN athlete id in uid',url,hit};
  return {id:m[1],displayName:hit.displayName,uid:hit.uid,url};
}

async function fetchRegularTotals(id,season=2024){
  const url=`https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${id}/gamelog?season=${season}`;
  const res=await fetch(url,{headers:{'user-agent':'fantasy-2026-probability-pipeline'}});
  if(!res.ok) throw new Error(`ESPN gamelog ${id}: ${res.status}`);
  const j=await res.json();
  const st=(j.seasonTypes||[]).find(x=>String(x.displayName||'').toLowerCase().includes('regular season'));
  if(!st) return {error:'regular-season block missing',url,names:j.names||[]};
  const total=st.summary?.stats?.find(x=>x.type==='total')?.stats || st.categories?.find(x=>String(x.displayName||'').toLowerCase().includes('regular'))?.totals;
  if(!Array.isArray(total)) return {error:'regular-season totals missing',url,names:j.names||[]};
  const stats=Object.fromEntries((j.names||[]).map((name,i)=>[name,n(total[i])]));
  return {url,stats,names:j.names||[]};
}

const external=[];
const mismatches=[];
const identityErrors=[];
const ids=new Map();
let comparisons=0, exact=0, unavailableMetrics=0;
for(const [pos,names] of Object.entries(sample)){
  for(const player of names){
    if(universe.get(player)!==pos){identityErrors.push({player,type:'sample_not_in_universe_or_wrong_position',expected:pos,actual:universe.get(player)||null});continue;}
    const oursRows=rows.filter(r=>r.player===player&&r.season===2024);
    if(!oursRows.length){identityErrors.push({player,type:'no_2024_rows'});continue;}
    const identity=await resolveEspn(player);
    if(identity.error){identityErrors.push({player,type:'espn_identity',...identity});continue;}
    if(ids.has(identity.id)&&ids.get(identity.id)!==player) identityErrors.push({player,type:'duplicate_espn_id',espn_id:identity.id,other:ids.get(identity.id)});
    ids.set(identity.id,player);
    const espn=await fetchRegularTotals(identity.id,2024);
    if(espn.error){identityErrors.push({player,type:'espn_gamelog',...espn});continue;}
    const check={player,position:pos,espn_id:identity.id,espn_display_name:identity.displayName,metrics:[]};
    for(const oursKey of positionMetrics[pos]){
      const espnKey=metricMap[oursKey];
      if(!(espnKey in espn.stats)){unavailableMetrics++;check.metrics.push({metric:oursKey,status:'NOT_PUBLISHED_BY_ESPN_GAMELOG'});continue;}
      const ours=sum(oursRows,oursKey), expected=espn.stats[espnKey];
      comparisons++;
      const match=ours===expected;
      if(match) exact++;
      else mismatches.push({player,position:pos,metric:oursKey,ours,espn:expected,espn_metric:espnKey});
      check.metrics.push({metric:oursKey,ours,espn:expected,match});
    }
    external.push(check);
  }
}

const report={
  generated_at:new Date().toISOString(),
  season:2024,
  external_source:'ESPN NFL athlete gamelog API',
  sample_players:Object.values(sample).flat().length,
  sample_by_position:Object.fromEntries(Object.entries(sample).map(([k,v])=>[k,v.length])),
  historical_rows_checked:rows.length,
  structural_identity_failures:structural.length,
  external_identity_failures:identityErrors.length,
  external_metric_comparisons:comparisons,
  exact_matches:exact,
  mismatches:mismatches.length,
  unavailable_metrics:unavailableMetrics,
  result:(structural.length||identityErrors.length||mismatches.length)?'BLOCKED':'PASS',
  structural_failure_details:structural.slice(0,100),
  identity_failure_details:identityErrors,
  mismatch_details:mismatches,
  external_checks:external,
  safeguards:[
    'ESPN is used only as an independent verification source; nflverse remains the historical ingestion source.',
    'ESPN athlete search must return exactly one normalized exact-name NFL player match.',
    'ESPN athlete IDs must be unique across the fixed audit sample.',
    'Our weekly rows are aggregated to regular-season totals before comparison, preventing week-order noise from hiding identity/stat total errors.',
    'Metrics not published in an ESPN gamelog schema are reported as unavailable and are not silently treated as matches.',
    'Any structural identity failure, ESPN identity failure, or numeric mismatch blocks Guardrail QA.'
  ]
};
fs.writeFileSync(path.join(root,'guardrails/core-stats-identity-accuracy-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,external_checks:undefined},null,2));
if(report.result!=='PASS') process.exit(1);
