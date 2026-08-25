import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const seasons=[2021,2022,2023,2024,2025];
const positions=new Set(['WR','TE']);
const outDir=path.join(root,'data/probability/generated');
fs.mkdirSync(outDir,{recursive:true});
fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});

const ref=JSON.parse(fs.readFileSync(path.join(root,'data/probability/generated/historical-reference-population-2021-2025.json'),'utf8'));
const normalize=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
const pct=v=>{const n=Number(String(v??'').replace('%','').trim());return Number.isFinite(n)?(n>1?n/100:n):null};
const num=v=>{const n=Number(String(v??'').replace(/,/g,'').trim());return Number.isFinite(n)?n:null};

function htmlText(s){return String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#x27;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim()}
function cleanPlayer(s){
  const raw=String(s||'').trim();
  const m=raw.match(/^(.+?)([A-Z]\.[A-Za-z.'-]+(?:\s+[A-Z]\.[A-Za-z.'-]+)*)$/);
  return (m?m[1]:raw).trim();
}
function parseMetricTable(html,season,metric){
  const rows=[];
  for(const m of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const cells=[...m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(x=>htmlText(x[1]));
    if(cells.length<5)continue;
    const pos=cells.find(c=>positions.has(c));if(!pos)continue;
    const player=cleanPlayer(cells[1]||'');if(!player||player==='Player')continue;
    let value=null;
    if(metric==='route_participation') value=pct(cells.find(c=>/%$/.test(c)));
    else {
      for(let i=4;i<cells.length;i++){const x=num(cells[i]);if(x!=null){value=x;break;}}
    }
    if(value==null)continue;
    if(metric==='route_participation'&&!(value>=0&&value<=1))continue;
    if(metric==='routes_run'&&value<0)continue;
    rows.push({season,player,player_key:normalize(player),position:pos,[metric]:value});
  }
  return rows;
}

async function fetchMetricPages(season,metric){
  const slug=metric==='route_participation'?'route-participation':'routes-run';
  const all=new Map();
  const pageReports=[];
  let stagnantPages=0;
  for(let page=1;page<=100;page++){
    const url=`https://statrankings.com/nfl/advanced/players/usage/${slug}?season=${season}&page=${page}`;
    const res=await fetch(url,{headers:{'user-agent':'fantasy-2026-probability-pipeline'}});
    if(!res.ok)throw new Error(`Route source fetch failed ${res.status}: ${url}`);
    const html=await res.text();
    const rows=parseMetricTable(html,season,metric);
    const before=all.size;
    for(const r of rows)all.set(`${r.position}|${r.player_key}`,r);
    const added=all.size-before;
    pageReports.push({page,url,http_status:res.status,bytes:Buffer.byteLength(html),parsed_rows:rows.length,new_rows:added,total_unique_rows:all.size});
    if(rows.length===0||added===0)stagnantPages++;else stagnantPages=0;
    if(stagnantPages>=2)break;
  }
  return {rows:[...all.values()],pageReports};
}

const sourceReports=[];const combined=new Map();
for(const season of seasons){
  for(const metric of ['route_participation','routes_run']){
    const fetched=await fetchMetricPages(season,metric);
    const rows=fetched.rows;
    sourceReports.push({season,metric,parsed_rows:rows.length,pages_fetched:fetched.pageReports.length,page_reports:fetched.pageReports});
    for(const r of rows){
      const key=`${r.season}|${r.position}|${r.player_key}`;
      if(!combined.has(key))combined.set(key,{season:r.season,player:r.player,player_key:r.player_key,position:r.position});
      Object.assign(combined.get(key),r);
    }
  }
}

const refSeasonPlayers=new Map();
for(const r of ref.rows||[]){
  if(!positions.has(r.position))continue;
  const key=`${r.season}|${r.position}|${normalize(r.player)}`;
  if(!refSeasonPlayers.has(key))refSeasonPlayers.set(key,{season:r.season,position:r.position,player:r.player,player_id:r.player_id,games:0,targets:0});
  const x=refSeasonPlayers.get(key);x.games++;x.targets+=Number.isFinite(Number(r.targets))?Number(r.targets):0;
}

const matched=[];const unmatched=[];
for(const [key,r] of combined){
  const refRow=refSeasonPlayers.get(key);
  if(!refRow){unmatched.push(r);continue;}
  matched.push({...r,player_id:refRow.player_id,reference_player_name:refRow.player,games:refRow.games,targets:refRow.targets,source:'StatRankings free season usage tables',route_participation_url:`https://statrankings.com/nfl/advanced/players/usage/route-participation?season=${r.season}`,routes_run_url:`https://statrankings.com/nfl/advanced/players/usage/routes-run?season=${r.season}`});
}

const candidate=[...refSeasonPlayers.values()].filter(x=>x.targets>=20);
const matchedKeys=new Set(matched.filter(r=>r.route_participation!=null&&r.routes_run!=null).map(r=>`${r.season}|${r.position}|${r.player_key}`));
const candidateMatched=candidate.filter(x=>matchedKeys.has(`${x.season}|${x.position}|${normalize(x.player)}`));
const bySeasonPosition={};
for(const season of seasons){for(const pos of positions){
  const c=candidate.filter(x=>x.season===season&&x.position===pos);
  const m=c.filter(x=>matchedKeys.has(`${x.season}|${x.position}|${normalize(x.player)}`));
  bySeasonPosition[`${season}_${pos}`]={candidate_receiving_seasons:c.length,matched_route_seasons:m.length,coverage:c.length?m.length/c.length:null};
}}

const blocked=[];
if(ref.live_player_universe_count!==162)blocked.push(`live universe changed: ${ref.live_player_universe_count}`);
for(const s of sourceReports)if(s.parsed_rows<25)blocked.push(`${s.season} ${s.metric} source parsed too few unique rows after pagination: ${s.parsed_rows}`);
for(const [k,v] of Object.entries(bySeasonPosition))if(v.candidate_receiving_seasons>=10&&(v.coverage==null||v.coverage<0.70))blocked.push(`${k} route coverage below 70%: ${v.coverage}`);
if(matchedKeys.size<250)blocked.push(`matched route player-seasons unexpectedly small: ${matchedKeys.size}`);

const generated_at=new Date().toISOString();
const output={schema_version:'1.2.0',generated_at,mode:'SHADOW_ONLY',actionable:false,history_window:seasons,sportsbook_inputs_used:false,granularity:'PLAYER_SEASON',metric_definition:{route_participation:'StatRankings percentage of a player’s snaps where he runs a route',routes_run:'StatRankings total routes run during passing plays'},primary_use:'Replace WR/TE workload-proxy cohort classification with observed season route workload when coverage passes.',weekly_route_enrichment_status:'PENDING_SEPARATE_WEEK_LEVEL_BACKFILL',sources:{season_route_metrics:'StatRankings free season tables with pagination',weekly_primary:'Fantasy Life Utilization Game Log'},source_reports:sourceReports,rows:matched,unmatched_source_rows:unmatched};
const report={generated_at,result:blocked.length?'BLOCKED':'PASS',mode:'SHADOW_ONLY',actionable:false,source_player_seasons:combined.size,matched_complete_player_seasons:matchedKeys.size,unmatched_source_rows:unmatched.length,candidate_receiving_seasons:candidate.length,candidate_matched:candidateMatched.length,coverage:candidate.length?candidateMatched.length/candidate.length:null,coverage_by_season_position:bySeasonPosition,source_reports:sourceReports.map(s=>({season:s.season,metric:s.metric,parsed_rows:s.parsed_rows,pages_fetched:s.pages_fetched,page_new_rows:s.page_reports.map(p=>p.new_rows)})),blocked,sportsbook_inputs_used:false,safeguards:['Observed route participation and routes run remain separate from workload proxies.','Only WR/TE player-season rows are admitted.','Missing route metrics remain missing and are never converted to zero.','Identity matching is season + position + normalized player name against the GSIS-backed historical reference population.','Pagination stops only after two consecutive pages add no new players.','Coverage requirements are not weakened to force a pass.','No projection or live fantasy rank is changed by this backfill script.','No sportsbook data is used.']};
fs.writeFileSync(path.join(outDir,'historical-route-participation-2021-2025.json'),JSON.stringify(output,null,2)+'\n');
fs.writeFileSync(path.join(root,'guardrails/historical-route-participation-backfill-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);
