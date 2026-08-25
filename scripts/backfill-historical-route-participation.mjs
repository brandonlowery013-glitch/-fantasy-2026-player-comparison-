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

function htmlText(s){return String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#x27;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim()}

function parseTable(html,season){
  const rows=[];
  const tr=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  for(const m of tr){
    const cells=[...m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(x=>htmlText(x[1]));
    if(cells.length<5)continue;
    const pos=cells.find(c=>positions.has(c));
    if(!pos)continue;
    const seasonCell=cells.find(c=>/%$/.test(c));
    if(!seasonCell)continue;
    const routeParticipation=pct(seasonCell);
    if(!(routeParticipation>=0&&routeParticipation<=1))continue;
    let player=cells[1]||'';
    player=player.replace(/([A-Z][a-z.'-]+\s+[A-Z][a-z.'-]+)([A-Z]\.[^0-9%]+)$/,'$1').trim();
    if(!player||player==='Player')continue;
    rows.push({season,player,player_key:normalize(player),position:pos,route_participation:routeParticipation,source:'StatRankings route participation',source_url:`https://statrankings.com/nfl/advanced/players/usage/route-participation?season=${season}`});
  }
  return rows;
}

const sourceRows=[];
const sourceReports=[];
for(const season of seasons){
  const url=`https://statrankings.com/nfl/advanced/players/usage/route-participation?season=${season}`;
  const res=await fetch(url,{headers:{'user-agent':'fantasy-2026-probability-pipeline'}});
  if(!res.ok)throw new Error(`Route source fetch failed ${res.status}: ${url}`);
  const html=await res.text();
  const rows=parseTable(html,season);
  sourceRows.push(...rows);
  sourceReports.push({season,url,http_status:res.status,bytes:Buffer.byteLength(html),parsed_rows:rows.length});
}

const refSeasonPlayers=new Map();
for(const r of ref.rows||[]){
  if(!positions.has(r.position))continue;
  const key=`${r.season}|${r.position}|${normalize(r.player)}`;
  if(!refSeasonPlayers.has(key))refSeasonPlayers.set(key,{season:r.season,position:r.position,player:r.player,player_id:r.player_id,games:0,targets:0});
  const x=refSeasonPlayers.get(key);x.games++;x.targets+=Number.isFinite(Number(r.targets))?Number(r.targets):0;
}

const dedup=new Map();
for(const r of sourceRows){
  const key=`${r.season}|${r.position}|${r.player_key}`;
  if(!dedup.has(key))dedup.set(key,r);
}
const matched=[];const unmatched=[];
for(const r of dedup.values()){
  const key=`${r.season}|${r.position}|${r.player_key}`;
  const refRow=refSeasonPlayers.get(key);
  if(!refRow){unmatched.push(r);continue;}
  matched.push({...r,player_id:refRow.player_id,reference_player_name:refRow.player,games:refRow.games,targets:refRow.targets});
}

const candidate=[...refSeasonPlayers.values()].filter(x=>x.targets>=20);
const matchedKeys=new Set(matched.map(r=>`${r.season}|${r.position}|${r.player_key}`));
const candidateMatched=candidate.filter(x=>matchedKeys.has(`${x.season}|${x.position}|${normalize(x.player)}`));
const bySeasonPosition={};
for(const season of seasons){
  for(const pos of positions){
    const c=candidate.filter(x=>x.season===season&&x.position===pos);
    const m=c.filter(x=>matchedKeys.has(`${x.season}|${x.position}|${normalize(x.player)}`));
    bySeasonPosition[`${season}_${pos}`]={candidate_receiving_seasons:c.length,matched_route_seasons:m.length,coverage:c.length?m.length/c.length:null};
  }
}

const blocked=[];
if(ref.live_player_universe_count!==162)blocked.push(`live universe changed: ${ref.live_player_universe_count}`);
for(const s of sourceReports)if(s.parsed_rows<25)blocked.push(`${s.season} route source parsed too few rows: ${s.parsed_rows}`);
for(const [k,v] of Object.entries(bySeasonPosition))if(v.candidate_receiving_seasons>=10&&(v.coverage==null||v.coverage<0.70))blocked.push(`${k} route coverage below 70%: ${v.coverage}`);
if(matched.length<250)blocked.push(`matched route player-seasons unexpectedly small: ${matched.length}`);

const generated_at=new Date().toISOString();
const output={schema_version:'1.0.0',generated_at,mode:'SHADOW_ONLY',actionable:false,history_window:seasons,sportsbook_inputs_used:false,granularity:'PLAYER_SEASON',primary_use:'Replace WR/TE workload-proxy cohort classification with observed season route participation when coverage passes.',weekly_route_enrichment_status:'PENDING_SEPARATE_WEEK_LEVEL_BACKFILL',sources:{season_route_participation:'StatRankings free season table',weekly_primary:'Fantasy Life Utilization Game Log'},source_reports:sourceReports,rows:matched,unmatched_source_rows:unmatched};
const report={generated_at,result:blocked.length?'BLOCKED':'PASS',mode:'SHADOW_ONLY',actionable:false,source_rows:dedup.size,matched_player_seasons:matched.length,unmatched_source_rows:unmatched.length,candidate_receiving_seasons:candidate.length,candidate_matched:candidateMatched.length,coverage:candidate.length?candidateMatched.length/candidate.length:null,coverage_by_season_position:bySeasonPosition,blocked,sportsbook_inputs_used:false,safeguards:['Observed route participation remains separate from workload proxies.','Only WR/TE player-season rows are admitted.','Missing route participation remains missing and is never converted to zero.','Identity matching is season + position + normalized player name against the GSIS-backed historical reference population.','No projection or live fantasy rank is changed by this backfill script.','No sportsbook data is used.']};
fs.writeFileSync(path.join(outDir,'historical-route-participation-2021-2025.json'),JSON.stringify(output,null,2)+'\n');
fs.writeFileSync(path.join(root,'guardrails/historical-route-participation-backfill-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);
