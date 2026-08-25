import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const seasons=[2021,2022,2023,2024,2025];
const validPositions=new Set(['QB','RB','WR','TE']);
const outDir=path.join(root,'data/probability/generated');
fs.mkdirSync(outDir,{recursive:true});
fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});

function parseCsv(text){
  const rs=[];let row=[],f='',q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){if(c==='"'&&text[i+1]==='"'){f+='"';i++;}else if(c==='"')q=false;else f+=c;}
    else{if(c==='"')q=true;else if(c===','){row.push(f);f='';}else if(c==='\n'){row.push(f.replace(/\r$/,''));rs.push(row);row=[];f='';}else f+=c;}
  }
  if(f.length||row.length){row.push(f);rs.push(row);}
  const h=rs.shift()||[];
  return rs.filter(r=>r.length>1).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])));
}
const val=(r,...ks)=>{for(const k of ks){if(r[k]!==undefined&&r[k]!==null&&r[k]!=='')return r[k]}return null};
const num=v=>v===''||v==null||Number.isNaN(Number(v))?null:Number(v);
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
async function csv(url){const res=await fetch(url,{headers:{'user-agent':'fantasy-2026-probability-pipeline'}});if(!res.ok)throw new Error(`${res.status} ${url}`);const text=await res.text();return {data:parseCsv(text),url,bytes:Buffer.byteLength(text)}}

const live=[];for(let i=0;i<13;i++)live.push(...JSON.parse(fs.readFileSync(path.join(root,`players${i}.json`),'utf8')));
if(live.length!==162)throw new Error(`Live player universe changed unexpectedly: ${live.length}`);
const liveNames=new Set(live.map(p=>norm(p.n)));

const playersUrl='https://github.com/nflverse/nflverse-data/releases/download/players/players.csv';
const playerRes=await csv(playersUrl);
const masterByGsis=new Map();
const masterByPfr=new Map();
const masterNameBuckets=new Map();
for(const p of playerRes.data){
  const gsis=val(p,'gsis_id');
  if(!gsis)continue;
  const position=String(val(p,'position','position_group')||'').toUpperCase();
  const name=val(p,'display_name','full_name','football_name','short_name');
  const rec={gsis_id:String(gsis),pfr_id:val(p,'pfr_id','pfr_player_id'),name:name||String(gsis),position};
  masterByGsis.set(String(gsis),rec);
  if(rec.pfr_id)masterByPfr.set(String(rec.pfr_id),rec);
  if(name){const k=norm(name);if(!masterNameBuckets.has(k))masterNameBuckets.set(k,[]);masterNameBuckets.get(k).push(rec);}
}

const rows=[];
const byKey=new Map();
const sources=[{type:'players',url:playersUrl,bytes:playerRes.bytes}];
let weeklyRowsRead=0,weeklyRowsUsed=0,weeklyRowsSkippedNoGsis=0,weeklyRowsSkippedPosition=0;

for(const season of seasons){
  const url=`https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`;
  const res=await csv(url);sources.push({type:'weekly_stats',season,url,bytes:res.bytes});
  for(const r of res.data){
    weeklyRowsRead++;
    if(String(val(r,'season_type','seasonType')||'REG').toUpperCase()!=='REG')continue;
    const week=Number(val(r,'week'));if(!Number.isFinite(week)||week<1||week>18)continue;
    const gsis=val(r,'player_id','gsis_id');
    if(!gsis){weeklyRowsSkippedNoGsis++;continue;}
    const m=masterByGsis.get(String(gsis));
    const position=String(val(r,'position','position_group')||m?.position||'').toUpperCase();
    if(!validPositions.has(position)){weeklyRowsSkippedPosition++;continue;}
    const name=val(r,'player_display_name','player_name','player')||m?.name||String(gsis);
    const key=`${gsis}|${season}|${week}`;
    const row={
      player_id:String(gsis),player:name,position,season,week,
      team:val(r,'recent_team','team'),opponent:val(r,'opponent_team','opponent'),
      played:true,active_status:'ACTIVE_STAT_ROW',offensive_snaps:null,snap_share:null,
      pass_attempts:num(val(r,'attempts','passing_attempts')),pass_yards:num(val(r,'passing_yards','pass_yards')),pass_tds:num(val(r,'passing_tds','pass_tds')),
      interceptions:num(val(r,'interceptions','passing_interceptions')),
      rush_attempts:num(val(r,'carries','rushing_attempts','rush_attempts')),rush_yards:num(val(r,'rushing_yards','rush_yards')),rush_tds:num(val(r,'rushing_tds','rush_tds')),
      targets:num(val(r,'targets')),receptions:num(val(r,'receptions')),receiving_yards:num(val(r,'receiving_yards')),receiving_tds:num(val(r,'receiving_tds')),
      receiving_air_yards:num(val(r,'receiving_air_yards')),receiving_yards_after_catch:num(val(r,'receiving_yards_after_catch')),
      target_share:num(val(r,'target_share')),air_yards_share:num(val(r,'air_yards_share')),wopr:num(val(r,'wopr')),fantasy_points_ppr:num(val(r,'fantasy_points_ppr')),
      is_live_162:liveNames.has(norm(name)),
      source:'nflverse weekly player stats',source_url:url
    };
    if(byKey.has(key))throw new Error(`Duplicate weekly GSIS-season-week key: ${key}`);
    byKey.set(key,row);rows.push(row);weeklyRowsUsed++;
  }
}

let snapRowsRead=0,snapRowsMatched=0,activeZeroAdded=0,snapAmbiguousNameSkipped=0,snapUnmappedSkipped=0;
for(const season of seasons){
  const url=`https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_${season}.csv`;
  const res=await csv(url);sources.push({type:'snap_counts',season,url,bytes:res.bytes});
  for(const s of res.data){
    snapRowsRead++;
    const week=Number(val(s,'week'));if(!Number.isFinite(week)||week<1||week>18)continue;
    const snaps=num(val(s,'offense_snaps','offensive_snaps'));if(!(snaps>0))continue;
    let m=null;
    const pfr=val(s,'pfr_player_id','pfr_id');if(pfr)m=masterByPfr.get(String(pfr))||null;
    if(!m){
      const name=val(s,'player','player_name','pfr_player_name');
      const bucket=masterNameBuckets.get(norm(name))||[];
      if(bucket.length===1)m=bucket[0];
      else if(bucket.length>1){snapAmbiguousNameSkipped++;continue;}
    }
    if(!m){snapUnmappedSkipped++;continue;}
    if(!validPositions.has(m.position))continue;
    const key=`${m.gsis_id}|${season}|${week}`;
    const pct=num(val(s,'offense_pct','offensive_pct'));
    if(byKey.has(key)){
      const r=byKey.get(key);r.offensive_snaps=snaps;r.snap_share=pct==null?null:(pct>1?pct/100:pct);r.snap_source_url=url;snapRowsMatched++;continue;
    }
    const name=m.name;
    const row={
      player_id:m.gsis_id,player:name,position:m.position,season,week,
      team:val(s,'team'),opponent:val(s,'opponent'),played:true,active_status:'ACTIVE_ZERO_CONFIRMED_SNAPS',
      offensive_snaps:snaps,snap_share:pct==null?null:(pct>1?pct/100:pct),
      pass_attempts:0,pass_yards:0,pass_tds:0,interceptions:0,
      rush_attempts:0,rush_yards:0,rush_tds:0,targets:0,receptions:0,receiving_yards:0,receiving_tds:0,
      receiving_air_yards:null,receiving_yards_after_catch:null,target_share:null,air_yards_share:null,wopr:null,fantasy_points_ppr:0,
      is_live_162:liveNames.has(norm(name)),source:'nflverse/PFR snap-count active-zero reconstruction',source_url:url,snap_source_url:url
    };
    byKey.set(key,row);rows.push(row);activeZeroAdded++;
  }
}

rows.sort((a,b)=>a.season-b.season||a.week-b.week||a.position.localeCompare(b.position)||a.player.localeCompare(b.player));
const duplicate=[];const seen=new Set();for(const r of rows){const k=`${r.player_id}|${r.season}|${r.week}`;if(seen.has(k))duplicate.push(k);seen.add(k)}
const players=new Map();for(const r of rows){if(!players.has(r.player_id))players.set(r.player_id,{player_id:r.player_id,player:r.player,position:r.position,is_live_162:r.is_live_162,games:0,seasons:new Set()});const p=players.get(r.player_id);p.games++;p.seasons.add(r.season);}
const summaries=[...players.values()].map(p=>({...p,seasons:[...p.seasons].sort()}));
const byPosition={};for(const pos of validPositions){const ps=summaries.filter(p=>p.position===pos);const rs=rows.filter(r=>r.position===pos);byPosition[pos]={unique_players:ps.length,player_games:rs.length,active_zero_rows:rs.filter(r=>r.active_status==='ACTIVE_ZERO_CONFIRMED_SNAPS').length,live_162_players:ps.filter(p=>p.is_live_162).length};}
const liveInReference=new Set(rows.filter(r=>r.is_live_162).map(r=>norm(r.player))).size;
const broadPlayers=summaries.length;
const nonLivePlayers=summaries.filter(p=>!p.is_live_162).length;
const blocked=[];
if(duplicate.length)blocked.push(`duplicate keys: ${duplicate.length}`);
if(broadPlayers<500)blocked.push(`reference population unexpectedly small: ${broadPlayers}`);
if(nonLivePlayers<300)blocked.push(`non-live reference population unexpectedly small: ${nonLivePlayers}`);
if(live.length!==162)blocked.push(`live universe changed: ${live.length}`);

const generatedAt=new Date().toISOString();
const dataset={
  schema_version:'1.0.0',season_target:2026,history_window:seasons,generated_at:generatedAt,
  purpose:'Historical prior and calibration reference population only; does not alter the authoritative 162-player live fantasy model.',
  source_license:'nflverse/nflverse-data CC-BY-4.0',sources,
  live_player_universe_count:live.length,reference_unique_players:broadPlayers,reference_non_live_players:nonLivePlayers,row_count:rows.length,
  rows
};
const report={
  generated_at:generatedAt,result:blocked.length?'BLOCKED':'PASS',live_player_universe_count:live.length,
  reference_unique_players:broadPlayers,reference_non_live_players:nonLivePlayers,live_162_names_seen_in_reference:liveInReference,
  reference_player_games:rows.length,active_zero_rows_added:activeZeroAdded,
  weekly_rows_read:weeklyRowsRead,weekly_rows_used:weeklyRowsUsed,weekly_rows_skipped_no_gsis:weeklyRowsSkippedNoGsis,weekly_rows_skipped_position:weeklyRowsSkippedPosition,
  snap_rows_read:snapRowsRead,snap_rows_matched_to_stat_rows:snapRowsMatched,snap_ambiguous_name_skipped:snapAmbiguousNameSkipped,snap_unmapped_skipped:snapUnmappedSkipped,
  duplicate_player_id_season_week_keys:duplicate.slice(0,100),coverage_by_position:byPosition,blocked,
  safeguards:[
    'The authoritative live fantasy universe remains exactly 162 players and is not rewritten by this script.',
    'Reference identity is GSIS-first; PFR ID is used for snap-count joins where available.',
    'Normalized-name snap fallback is allowed only when the nflverse player master has exactly one matching identity.',
    'A zero-stat player-game is added only when positive offensive snaps prove participation.',
    'QB/RB/WR/TE only; FB and other positions are not folded into RB priors.',
    'This dataset is for priors/calibration and is not itself a betting recommendation layer.',
    'No sportsbook data is used.'
  ],
  limitation:'This broad reference population contains core weekly production plus snap-confirmed active-zero games. Advanced route, injury, red-zone and deeper context enrichment for the entire broad population is a later step and must not be assumed present here.'
};
fs.writeFileSync(path.join(outDir,'historical-reference-population-2021-2025.json'),JSON.stringify(dataset,null,2)+'\n');
fs.writeFileSync(path.join(root,'guardrails/historical-reference-population-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);
