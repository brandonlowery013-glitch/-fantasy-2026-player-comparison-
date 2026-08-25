import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const seasons=[2021,2022,2023,2024,2025];
const corePath=path.join(root,'data/probability/generated/historical-core-2021-2025.json');
if(!fs.existsSync(corePath)) throw new Error('Run ingest-historical-core.mjs first');
const core=JSON.parse(fs.readFileSync(corePath,'utf8'));
const rows=core.rows.map(r=>({...r}));
const outDir=path.join(root,'data/probability/generated');
const reportPath=path.join(root,'guardrails/historical-context-enrichment-report.json');

const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
const aliases={kennygainwell:'kennethgainwell'};
const n=v=>v===''||v==null||Number.isNaN(Number(v))?null:Number(v);
const val=(r,...ks)=>{for(const k of ks){if(r[k]!==undefined&&r[k]!==null&&r[k]!=='')return r[k]}return null};
function parseCsv(text){const rs=[];let row=[],f='',q=false;for(let i=0;i<text.length;i++){const c=text[i];if(q){if(c==='"'&&text[i+1]==='"'){f+='"';i++;}else if(c==='"')q=false;else f+=c;}else{if(c==='"')q=true;else if(c===','){row.push(f);f='';}else if(c==='\n'){row.push(f.replace(/\r$/,''));rs.push(row);row=[];f='';}else f+=c;}}if(f.length||row.length){row.push(f);rs.push(row)}const h=rs.shift()||[];return rs.filter(r=>r.length>1).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])))}
async function csv(url){const res=await fetch(url,{headers:{'user-agent':'fantasy-2026-probability-pipeline'}});if(!res.ok)throw new Error(`${res.status} ${url}`);return {data:parseCsv(await res.text()),url};}

const schedRes=await csv('https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv');
const schedules=schedRes.data.filter(g=>seasons.includes(Number(g.season))&&String(val(g,'game_type','season_type')||'REG').toUpperCase()==='REG');
const gameByTeamWeek=new Map();
for(const g of schedules){const season=Number(g.season),week=Number(g.week);const home=val(g,'home_team'),away=val(g,'away_team');if(!home||!away)continue;for(const team of [home,away]) gameByTeamWeek.set(`${season}|${week}|${team}`,g);}

const snapByKey=new Map();
const injuryByKey=new Map();
const sources=[{type:'schedules',url:schedRes.url}];
for(const season of seasons){
  const snapUrl=`https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_${season}.csv`;
  const injUrl=`https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_${season}.csv`;
  const [sr,ir]=await Promise.all([csv(snapUrl),csv(injUrl)]);
  sources.push({type:'snap_counts',season,url:snapUrl},{type:'injuries',season,url:injUrl});
  for(const s of sr.data){const player=norm(val(s,'player','player_name','pfr_player_name'));const week=Number(val(s,'week'));const team=val(s,'team');if(!player||!week||!team)continue;snapByKey.set(`${season}|${week}|${team}|${player}`,s);}
  for(const i of ir.data){const player=norm(val(i,'full_name','player_name','player'));const week=Number(val(i,'week'));const team=val(i,'team');if(!player||!week||!team)continue;injuryByKey.set(`${season}|${week}|${team}|${player}`,i);}
}

let scheduleMatched=0,snapMatched=0,injuryMatched=0,activeZeroAdded=0,injuryInactiveAdded=0;
const existing=new Set(rows.map(r=>`${r.player}|${r.season}|${r.week}`));
const playerMeta=new Map();
for(let i=0;i<13;i++) for(const p of JSON.parse(fs.readFileSync(path.join(root,`players${i}.json`),'utf8'))) playerMeta.set(norm(p.n),p);
function matchName(name){const k=norm(name);return playerMeta.get(k)||playerMeta.get(aliases[k]||'')||null}
function enrichRow(r){
  const g=gameByTeamWeek.get(`${r.season}|${r.week}|${r.team}`);
  if(g){scheduleMatched++;const home=val(g,'home_team');r.home=r.team===home;const hs=n(val(g,'home_score')),as=n(val(g,'away_score'));if(hs!=null&&as!=null){r.team_points=r.team===home?hs:as;r.opponent_points=r.team===home?as:hs;r.final_point_differential=r.team_points-r.opponent_points;}r.roof=val(g,'roof');r.surface=val(g,'surface');r.temperature_f=n(val(g,'temp','temperature'));r.wind_mph=n(val(g,'wind','wind_mph'));r.context_source='nflverse schedules';r.context_source_url=schedRes.url;}
  const key=`${r.season}|${r.week}|${r.team}|${norm(r.player)}`;
  const s=snapByKey.get(key);if(s){snapMatched++;r.offensive_snaps=n(val(s,'offense_snaps','offensive_snaps'));const pct=n(val(s,'offense_pct','offensive_pct'));r.snap_share=pct==null?r.snap_share:(pct>1?pct/100:pct);r.usage_source='nflverse/PFR snap counts';r.usage_source_url=`https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_${r.season}.csv`;}
  const inj=injuryByKey.get(key);if(inj){injuryMatched++;r.injury_status_pre_game=val(inj,'report_status','game_status','status');r.injury_body_part=val(inj,'report_primary_injury','primary_injury','injury');r.inactive_reason=r.inactive_reason||r.injury_body_part;}
  return r;
}
for(const r of rows) enrichRow(r);

for(const [key,s] of snapByKey){const [seasonS,weekS,team]=key.split('|');const season=Number(seasonS),week=Number(weekS);const p=matchName(val(s,'player','player_name','pfr_player_name'));if(!p)continue;const ek=`${p.n}|${season}|${week}`;if(existing.has(ek))continue;const snaps=n(val(s,'offense_snaps','offensive_snaps'));if(!(snaps>0))continue;const g=gameByTeamWeek.get(`${season}|${week}|${team}`);if(!g)continue;const home=val(g,'home_team'),opp=team===home?val(g,'away_team'):home;const row={player:p.n,position:p.p,season,week,team,opponent:opp,played:true,started:null,inactive:false,active_status:'ACTIVE_ZERO',role_regime_id:`${p.n}|${team}|${season}`,role_regime_reason:'TEAM_SEASON_BASELINE_PENDING_ROLE_SEGMENTATION',pass_attempts:0,pass_yards:0,pass_tds:0,rush_attempts:0,rush_yards:0,rush_tds:0,targets:0,receptions:0,receiving_yards:0,receiving_tds:0,data_quality_flags:[],source:'nflverse/PFR snap-count active-zero reconstruction',source_url:`https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_${season}.csv`,source_date:new Date().toISOString().slice(0,10)};enrichRow(row);rows.push(row);existing.add(ek);activeZeroAdded++;}

for(const [key,inj] of injuryByKey){const [seasonS,weekS,team]=key.split('|');const season=Number(seasonS),week=Number(weekS);const p=matchName(val(inj,'full_name','player_name','player'));if(!p)continue;const ek=`${p.n}|${season}|${week}`;if(existing.has(ek))continue;const status=String(val(inj,'report_status','game_status','status')||'').toUpperCase();if(status!=='OUT')continue;const g=gameByTeamWeek.get(`${season}|${week}|${team}`);if(!g)continue;const home=val(g,'home_team'),opp=team===home?val(g,'away_team'):home;const row={player:p.n,position:p.p,season,week,team,opponent:opp,played:false,started:false,inactive:true,inactive_reason:val(inj,'report_primary_injury','primary_injury','injury')||'OFFICIAL_INJURY_REPORT_OUT',injury_status_pre_game:status,injury_body_part:val(inj,'report_primary_injury','primary_injury','injury'),partial_game:false,injury_limited:false,active_status:'INACTIVE_OUT',role_regime_id:`${p.n}|${team}|${season}`,role_regime_reason:'TEAM_SEASON_BASELINE_PENDING_ROLE_SEGMENTATION',data_quality_flags:[],source:'nflverse official weekly injury report',source_url:`https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_${season}.csv`,source_date:new Date().toISOString().slice(0,10)};enrichRow(row);rows.push(row);existing.add(ek);injuryInactiveAdded++;}

rows.sort((a,b)=>a.player.localeCompare(b.player)||a.season-b.season||a.week-b.week);
const lastByPlayer=new Map();
for(const r of rows){const prev=lastByPlayer.get(r.player);r.team_change_from_prior_game=prev?prev.team!==r.team:false;const snap=r.snap_share;const band=snap==null?'UNK':snap>=0.75?'HIGH':snap>=0.4?'MID':'LOW';r.role_regime_id=`${r.player}|${r.team}|${r.season}|${band}`;r.role_regime_reason=r.team_change_from_prior_game?'TEAM_CHANGE':`SNAP_SHARE_BAND_${band}`;r.data_quality_flags=Array.isArray(r.data_quality_flags)?r.data_quality_flags:[];if(r.team_change_from_prior_game&&!r.data_quality_flags.includes('TEAM_CHANGE'))r.data_quality_flags.push('TEAM_CHANGE');if(snap==null&&!r.data_quality_flags.includes('MISSING_USAGE_DATA'))r.data_quality_flags.push('MISSING_USAGE_DATA');lastByPlayer.set(r.player,r);}

const duplicate=[];const seen=new Set();for(const r of rows){const k=`${r.player}|${r.season}|${r.week}`;if(seen.has(k))duplicate.push(k);seen.add(k)}
const enriched={schema_version:'1.1.0',season_target:2026,history_window:seasons,generated_at:new Date().toISOString(),sources,market_inputs_used:false,row_count:rows.length,rows};
const report={generated_at:enriched.generated_at,result:duplicate.length?'BLOCKED':'PASS',base_rows:core.rows.length,enriched_rows:rows.length,schedule_matched_rows:scheduleMatched,snap_matched_rows:snapMatched,injury_matched_rows:injuryMatched,active_zero_rows_added:activeZeroAdded,official_injury_out_rows_added:injuryInactiveAdded,duplicate_player_season_week_keys:duplicate.slice(0,100),unpopulated_by_design:['started (until a direct start source is added)','partial_game unless directly evidenced','head_coach','offensive_coordinator','primary_play_caller','routes_run','route_share','neutral_pass_rate','precipitation','opponent_defense_bucket'],notes:['No sportsbook line, odds, spread, or total is used.','ACTIVE_ZERO requires >0 offensive snaps.','INACTIVE_OUT requires official weekly injury report status OUT.','Role regimes are deterministic team-season + snap-share bands and are not betting labels.']};
fs.writeFileSync(path.join(outDir,'historical-enriched-2021-2025.json'),JSON.stringify(enriched,null,2)+'\n');
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(duplicate.length)process.exit(1);
