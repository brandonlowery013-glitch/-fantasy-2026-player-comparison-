import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root=process.cwd();
const seasons=[2021,2022,2023,2024,2025];
const inputPath=path.join(root,'data/probability/generated/historical-enriched-2021-2025.json');
if(!fs.existsSync(inputPath)) throw new Error('Run prior historical enrichment steps first');
const data=JSON.parse(fs.readFileSync(inputPath,'utf8'));
const rows=data.rows.map(r=>({...r}));

function parseCsv(text){const rs=[];let row=[],f='',q=false;for(let i=0;i<text.length;i++){const c=text[i];if(q){if(c==='"'&&text[i+1]==='"'){f+='"';i++;}else if(c==='"')q=false;else f+=c;}else{if(c==='"')q=true;else if(c===','){row.push(f);f='';}else if(c==='\n'){row.push(f.replace(/\r$/,''));rs.push(row);row=[];f='';}else f+=c;}}if(f.length||row.length){row.push(f);rs.push(row)}const h=rs.shift()||[];return rs.filter(r=>r.length>1).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])))}
const num=v=>v===''||v==null||Number.isNaN(Number(v))?null:Number(v);
const truth=v=>v===1||v==='1'||v===true||String(v).toLowerCase()==='true';
const val=(r,...ks)=>{for(const k of ks){if(r[k]!==undefined&&r[k]!==null&&r[k]!=='')return r[k]}return null};
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const quantile=(arr,q)=>{if(!arr.length)return null;const a=[...arr].sort((x,y)=>x-y);const p=(a.length-1)*q,lo=Math.floor(p),hi=Math.ceil(p);return lo===hi?a[lo]:a[lo]+(a[hi]-a[lo])*(p-lo)};

const playersUrl='https://github.com/nflverse/nflverse-data/releases/download/players/players.csv';
const pr=await fetch(playersUrl,{headers:{'user-agent':'fantasy-2026-probability-pipeline'}});
if(!pr.ok) throw new Error(`Failed nflverse players: ${pr.status}`);
const playerMaster=parseCsv(await pr.text());
const playerById=new Map();
for(const p of playerMaster){const id=val(p,'gsis_id');if(id)playerById.set(String(id),val(p,'display_name','full_name','football_name')||null);}

const teamGames=[];
const byKey=new Map();
const sourceFiles=[{type:'players',url:playersUrl}];
const getRec=(season,week,team,opp,gameId)=>{const k=`${season}|${week}|${team}`;if(!byKey.has(k)){const r={season,week,team,opponent:opp,game_id:gameId,team_plays:0,pass_plays:0,rush_plays:0,neutral_plays:0,neutral_pass_plays:0,pass_yards:0,rush_yards:0,pass_tds:0,rush_tds:0,epa_sum:0,epa_n:0,pace_intervals:[],passers:new Map(),last_drive:null,last_game_seconds:null};byKey.set(k,r);teamGames.push(r);}return byKey.get(k)};

for(const season of seasons){
  const url=`https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv.gz`;
  const res=await fetch(url,{headers:{'user-agent':'fantasy-2026-probability-pipeline'}});
  if(!res.ok) throw new Error(`Failed nflverse PBP ${season}: ${res.status}`);
  const buf=Buffer.from(await res.arrayBuffer());
  const pbp=parseCsv(zlib.gunzipSync(buf).toString('utf8'));
  sourceFiles.push({type:'pbp',season,url,compressed_bytes:buf.length});
  for(const p of pbp){
    if(String(val(p,'season_type')||'REG').toUpperCase()!=='REG') continue;
    const week=Number(val(p,'week')); if(!Number.isFinite(week)||week<1||week>18) continue;
    if(truth(val(p,'no_play'))||String(val(p,'play_type')).toLowerCase()==='no_play') continue;
    if(truth(val(p,'two_point_attempt'))||truth(val(p,'extra_point_attempt'))) continue;
    const team=val(p,'posteam'); const opp=val(p,'defteam'); if(!team||!opp) continue;
    const complete=truth(val(p,'complete_pass')),incomplete=truth(val(p,'incomplete_pass')),interception=truth(val(p,'interception'));
    const sack=truth(val(p,'sack'));
    const passPlay=complete||incomplete||interception||sack;
    const rushPlay=truth(val(p,'rush_attempt'));
    if(!passPlay&&!rushPlay) continue;
    const r=getRec(season,week,team,opp,val(p,'game_id'));
    r.team_plays++;
    if(passPlay)r.pass_plays++;
    if(rushPlay)r.rush_plays++;
    const qtr=num(val(p,'qtr'));const sd=num(val(p,'score_differential'));
    if(qtr!=null&&qtr<=3&&sd!=null&&Math.abs(sd)<=7){r.neutral_plays++;if(passPlay)r.neutral_pass_plays++;}
    const py=num(val(p,'passing_yards'));if(py!=null)r.pass_yards+=py;
    const ry=num(val(p,'rushing_yards'));if(ry!=null)r.rush_yards+=ry;
    if(truth(val(p,'pass_touchdown')))r.pass_tds++;
    if(truth(val(p,'rush_touchdown')))r.rush_tds++;
    const epa=num(val(p,'epa'));if(epa!=null){r.epa_sum+=epa;r.epa_n++;}
    const drive=val(p,'drive');const gs=num(val(p,'game_seconds_remaining'));
    if(drive!=null&&gs!=null&&r.last_drive===drive&&r.last_game_seconds!=null){const d=r.last_game_seconds-gs;if(d>=0&&d<=60)r.pace_intervals.push(d);}
    r.last_drive=drive;r.last_game_seconds=gs;
    if(passPlay){const pid=val(p,'passer_player_id');if(pid){const k=String(pid);r.passers.set(k,(r.passers.get(k)||0)+1);}}
  }
}

for(const r of teamGames){
  r.pass_rate=r.team_plays?r.pass_plays/r.team_plays:null;
  r.neutral_pass_rate=r.neutral_plays?r.neutral_pass_plays/r.neutral_plays:null;
  r.seconds_per_play=avg(r.pace_intervals);
  r.epa_per_play=r.epa_n?r.epa_sum/r.epa_n:null;
  r.yards_per_play=r.team_plays?(r.pass_yards+r.rush_yards)/r.team_plays:null;
  const ranked=[...r.passers.entries()].sort((a,b)=>b[1]-a[1]);
  if(ranked.length){const [id,att]=ranked[0];r.primary_game_qb=playerById.get(id)||null;r.primary_game_qb_id=id;r.primary_qb_pass_play_share=r.pass_plays?att/r.pass_plays:null;}
}
teamGames.sort((a,b)=>a.season-b.season||a.week-b.week||a.team.localeCompare(b.team));

const teamHistory=new Map(),defHistory=new Map();
const pregame=new Map();
for(const season of seasons){
  for(let week=1;week<=18;week++){
    const current=teamGames.filter(g=>g.season===season&&g.week===week);
    const leagueDefYpp=[];
    for(const arr of defHistory.values()) for(const x of arr.filter(x=>x.season===season&&x.week<week).slice(-4)) if(x.ypp!=null) leagueDefYpp.push(x.ypp);
    const q1=quantile(leagueDefYpp,.25),q3=quantile(leagueDefYpp,.75);
    for(const g of current){
      const th=(teamHistory.get(`${season}|${g.team}`)||[]).slice(-4);
      const dh=(defHistory.get(`${season}|${g.opponent}`)||[]).slice(-4);
      const dYpp=avg(dh.map(x=>x.ypp).filter(x=>x!=null));
      const dPass=avg(dh.map(x=>x.pass_yards).filter(x=>x!=null));
      const dRush=avg(dh.map(x=>x.rush_yards).filter(x=>x!=null));
      let bucket=null;if(dYpp!=null&&q1!=null&&q3!=null)bucket=dYpp<=q1?'TOUGH':dYpp>=q3?'SOFT':'AVERAGE';
      pregame.set(`${season}|${week}|${g.team}`,{
        pregame_team_games:th.length,
        pregame_team_plays:avg(th.map(x=>x.team_plays)),
        pregame_team_pass_rate:avg(th.map(x=>x.pass_rate).filter(x=>x!=null)),
        pregame_team_neutral_pass_rate:avg(th.map(x=>x.neutral_pass_rate).filter(x=>x!=null)),
        pregame_team_seconds_per_play:avg(th.map(x=>x.seconds_per_play).filter(x=>x!=null)),
        pregame_team_epa_per_play:avg(th.map(x=>x.epa_per_play).filter(x=>x!=null)),
        pregame_opponent_def_games:dh.length,
        pregame_opponent_yards_per_play_allowed:dYpp,
        pregame_opponent_pass_yards_allowed:dPass,
        pregame_opponent_rush_yards_allowed:dRush,
        opponent_defense_bucket:dh.length>=2?bucket:null
      });
    }
    for(const g of current){
      const tk=`${season}|${g.team}`;if(!teamHistory.has(tk))teamHistory.set(tk,[]);teamHistory.get(tk).push(g);
      const dk=`${season}|${g.opponent}`;if(!defHistory.has(dk))defHistory.set(dk,[]);defHistory.get(dk).push({season,week,ypp:g.yards_per_play,pass_yards:g.pass_yards,rush_yards:g.rush_yards});
    }
  }
}

let observedMatched=0,pregameMatched=0,qbContextMatched=0,defBuckets=0;
const teamGameByKey=new Map(teamGames.map(g=>[`${g.season}|${g.week}|${g.team}`,g]));
for(const r of rows){
  const k=`${r.season}|${r.week}|${r.team}`;const g=teamGameByKey.get(k);const pre=pregame.get(k);
  if(g){observedMatched++;r.team_plays=g.team_plays;r.pass_rate=g.pass_rate;r.neutral_pass_rate=g.neutral_pass_rate;r.seconds_per_play=g.seconds_per_play;r.team_epa_per_play_observed=g.epa_per_play;r.team_yards_per_play_observed=g.yards_per_play;r.primary_game_qb=g.primary_game_qb||null;r.primary_game_qb_id=g.primary_game_qb_id||null;r.primary_qb_pass_play_share=g.primary_qb_pass_play_share??null;if(g.primary_game_qb)qbContextMatched++;}
  if(pre){pregameMatched++;Object.assign(r,pre);if(pre.opponent_defense_bucket)defBuckets++;}
  r.deeper_context_source='nflverse play-by-play';
  r.deeper_context_source_date=new Date().toISOString().slice(0,10);
  r.starting_qb=r.starting_qb??null;
}

data.schema_version='1.3.0';
data.generated_at=new Date().toISOString();
data.deeper_context_source_files=sourceFiles;
data.rows=rows;
fs.writeFileSync(inputPath,JSON.stringify(data,null,2)+'\n');

const report={
  generated_at:data.generated_at,
  result:(observedMatched===rows.length&&pregameMatched===rows.length)?'PASS':'BLOCKED',
  rows:rows.length,
  observed_team_context_matched:observedMatched,
  pregame_context_matched:pregameMatched,
  rows_with_primary_game_qb:qbContextMatched,
  rows_with_leakage_safe_opponent_bucket:defBuckets,
  source_files:sourceFiles,
  leakage_policy:{
    observed_game_fields:'Stored for historical explanation only; must not be used as pregame predictive inputs.',
    pregame_fields:'Trailing up-to-4-game values use only games completed before the target week.',
    opponent_defense_bucket:'Built from prior defensive games only; requires at least 2 prior games.',
    sportsbook_inputs:false
  },
  qb_policy:'primary_game_qb is the GSIS-identified passer with the most pass plays in that team-game. It is a game-QB context field, not claimed to be an official starter. starting_qb remains null until a direct starter source is added.',
  pace_policy:'seconds_per_play uses within-drive gaps between consecutive offensive plays, bounded to 0-60 seconds.',
  neutral_policy:'neutral pass rate uses quarters 1-3 with absolute posteam score differential <= 7.',
  safeguards:['No sportsbook data used.','Observed game outcomes are explicitly separated from pregame rolling features.','No current-game data enters its own pregame rolling features.','Opponent defense context is prior-game only.','Official starting QB is not guessed from primary passer usage.']
};
fs.writeFileSync(path.join(root,'guardrails/deeper-football-context-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(report.result!=='PASS')process.exit(1);
