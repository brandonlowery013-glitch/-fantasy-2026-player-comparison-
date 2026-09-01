import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),JSON.stringify(x,null,2)+'\n');};
const num=x=>Number.isFinite(Number(x))?Number(x):null;
const round=(x,n=3)=>x==null?null:Number(Number(x).toFixed(n));

const contract=read('data/sources/team-scoring-market-impact-bridge-2026.json');
const impacts=read(contract.inputs.connected_impacts);
const football=read(contract.inputs.football_game_projections);
const markets=read(contract.inputs.market_snapshots);
const schedule=read(contract.inputs.schedule);
const outputPath=contract.output;

function gameForCase(c){
  if(c.game_context?.game_id)return c.game_context.game_id;
  for(const [id,g] of Object.entries(schedule.games||{}))if(g.home_team===c.team||g.away_team===c.team)return id;
  return null;
}

function footballFor(gameId){
  const g=football.games?.[gameId];
  if(!g?.model)return null;
  const m=g.model;
  const required=contract.required_football_fields.every(k=>num(m[k])!=null);
  if(!required)return null;
  return {
    generated_at:football.generated_at||null,
    home_team:g.home_team,
    away_team:g.away_team,
    home_score_mean:num(m.home_score_mean),
    away_score_mean:num(m.away_score_mean),
    model_home_spread:num(m.model_home_spread),
    model_total:num(m.model_total),
    home_win_probability:num(m.home_win_probability),
    away_win_probability:num(m.away_win_probability)
  };
}

function marketCandidates(gameId){
  const raw=markets.games?.[gameId];
  if(!raw)return [];
  if(Array.isArray(raw))return raw;
  if(Array.isArray(raw.snapshots))return raw.snapshots;
  if(Array.isArray(raw.observations))return raw.observations;
  return [raw];
}

function marketTime(x){return Date.parse(x?.captured_at||x?.source_date||x?.timestamp||x?.updated_at||'')||0;}
function extractMarket(gameId){
  const candidates=marketCandidates(gameId).sort((a,b)=>marketTime(b)-marketTime(a));
  for(const x of candidates){
    const spread=num(x.market_home_spread??x.home_spread??x.spread?.home??x.spreads?.home??x.consensus?.home_spread);
    const total=num(x.market_total??x.total??x.totals?.line??x.consensus?.total);
    if(spread==null&&total==null)continue;
    return {
      captured_at:x.captured_at||x.source_date||x.timestamp||x.updated_at||null,
      book:x.book||x.sportsbook||x.source_book||null,
      market_home_spread:spread,
      market_total:total,
      source:x.source||markets.source||'weekly-matchup-market-snapshots-2026'
    };
  }
  return null;
}

function buildComparison(f,m){
  const spreadGap=f.model_home_spread!=null&&m.market_home_spread!=null?f.model_home_spread-m.market_home_spread:null;
  const totalGap=f.model_total!=null&&m.market_total!=null?f.model_total-m.market_total:null;
  const marketHomeTeamTotal=m.market_total!=null&&m.market_home_spread!=null?(m.market_total-m.market_home_spread)/2:null;
  const marketAwayTeamTotal=m.market_total!=null&&m.market_home_spread!=null?(m.market_total+m.market_home_spread)/2:null;
  return {
    model_home_spread:round(f.model_home_spread),
    market_home_spread:round(m.market_home_spread),
    spread_gap:round(spreadGap),
    model_total:round(f.model_total),
    market_total:round(m.market_total),
    total_gap:round(totalGap),
    model_home_team_total:round(f.home_score_mean),
    market_home_team_total:round(marketHomeTeamTotal),
    home_team_total_gap:marketHomeTeamTotal==null?null:round(f.home_score_mean-marketHomeTeamTotal),
    model_away_team_total:round(f.away_score_mean),
    market_away_team_total:round(marketAwayTeamTotal),
    away_team_total_gap:marketAwayTeamTotal==null?null:round(f.away_score_mean-marketAwayTeamTotal)
  };
}

function projectionIsPostEvent(f,c){
  const a=Date.parse(f?.generated_at||'');
  const b=Date.parse(c?.captured_at||'');
  return Number.isFinite(a)&&Number.isFinite(b)&&a>=b;
}

function buildCase(c){
  const needsTeam=c.recalculation_targets?.team_scoring===true;
  const needsMarket=c.recalculation_targets?.market_comparison===true;
  const gameId=gameForCase(c);
  if(!needsTeam&&!needsMarket)return {case_id:c.case_id,source_event_id:c.source_event_id,team:c.team,game_id:gameId,state:'NO_TEAM_SCORING_REVIEW_REQUIRED',football:null,market:null,comparison:null};
  if(!gameId)return {case_id:c.case_id,source_event_id:c.source_event_id,team:c.team,game_id:null,state:'NO_CURRENT_GAME',football:null,market:null,comparison:null};
  const f=footballFor(gameId);
  if(!f)return {case_id:c.case_id,source_event_id:c.source_event_id,team:c.team,game_id:gameId,state:'PENDING_FOOTBALL_RECALCULATION',reason:'No valid football game projection exists for the affected current-week game.',football:null,market:null,comparison:null};
  const postEvent=projectionIsPostEvent(f,c);
  if(!postEvent)return {case_id:c.case_id,source_event_id:c.source_event_id,team:c.team,game_id:gameId,state:'PENDING_FOOTBALL_RECALCULATION',reason:'Existing football game projection predates the connected event; comparison is withheld until football inputs/projection are regenerated.',football:f,market:null,comparison:null};
  const m=extractMarket(gameId);
  if(!m)return {case_id:c.case_id,source_event_id:c.source_event_id,team:c.team,game_id:gameId,state:'INSUFFICIENT_MARKET_DATA',reason:'Football projection is current but spread/total market data is unavailable; missing market is not treated as zero.',football:f,market:null,comparison:null};
  return {case_id:c.case_id,source_event_id:c.source_event_id,team:c.team,game_id:gameId,state:'READY_FOR_MARKET_COMPARISON',football:f,market:m,comparison:buildComparison(f,m),market_is_downstream_only:true};
}

function synthetic(){
  const gameId=Object.keys(football.games||{})[0];
  const g=football.games?.[gameId];
  if(!gameId||!g)return [];
  const t=new Date(Date.parse(football.generated_at||'2026-08-31T12:00:00Z')-1000).toISOString();
  return [{case_id:'impact-self-test',source_event_id:'self-test',team:g.home_team,game_context:{game_id:gameId},captured_at:t,recalculation_targets:{team_scoring:true,market_comparison:true}}];
}

function main(){
  const self=process.argv.includes('--self-test');
  const sourceCases=self?synthetic():(impacts.cases||[]);
  const cases=sourceCases.map(buildCase);
  const blocked=[];
  for(const c of cases){
    if(c.state==='READY_FOR_MARKET_COMPARISON'){
      if(c.comparison==null)blocked.push(`${c.case_id} ready without comparison`);
      if(c.market_is_downstream_only!==true)blocked.push(`${c.case_id} missing downstream-only market guardrail`);
    }
    if(c.state==='PENDING_FOOTBALL_RECALCULATION'&&c.comparison!=null)blocked.push(`${c.case_id} compared market before football recalculation`);
  }
  if(self){
    if(cases.length!==1)blocked.push('self-test did not create one bridge case');
    if(cases[0]?.state==='READY_FOR_MARKET_COMPARISON'&&markets.status==='AWAITING_MARKET_SNAPSHOTS')blocked.push('self-test treated missing market as available');
  }
  const generated_at=self?'2026-08-31T23:20:00-05:00':new Date().toISOString();
  const output={schema_version:'1.0.0',season:2026,status:cases.length?'TEAM_SCORING_MARKET_REASSESSMENT_ROUTED':'AWAITING_CONNECTED_IMPACT_CASES',generated_at,cases};
  if(!self)write(outputPath,output);
  console.log(JSON.stringify({result:blocked.length?'BLOCKED':'PASS',cases:cases.length,states:Object.fromEntries([...new Set(cases.map(c=>c.state))].map(s=>[s,cases.filter(c=>c.state===s).length])),blocked},null,2));
  if(blocked.length)process.exit(1);
}
main();
