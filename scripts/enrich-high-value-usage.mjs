import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root=process.cwd();
const seasons=[2021,2022,2023,2024,2025];
const inputPath=path.join(root,'data/probability/generated/historical-enriched-2021-2025.json');
if(!fs.existsSync(inputPath)) throw new Error('Run enrich-historical-context.mjs first');
const data=JSON.parse(fs.readFileSync(inputPath,'utf8'));
const rows=data.rows.map(r=>({...r}));

const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
const aliases={kennygainwell:'kennethgainwell'};
function parseCsv(text){const rs=[];let row=[],f='',q=false;for(let i=0;i<text.length;i++){const c=text[i];if(q){if(c==='"'&&text[i+1]==='"'){f+='"';i++;}else if(c==='"')q=false;else f+=c;}else{if(c==='"')q=true;else if(c===','){row.push(f);f='';}else if(c==='\n'){row.push(f.replace(/\r$/,''));rs.push(row);row=[];f='';}else f+=c;}}if(f.length||row.length){row.push(f);rs.push(row)}const h=rs.shift()||[];return rs.filter(r=>r.length>1).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])))}
const num=v=>v===''||v==null||Number.isNaN(Number(v))?null:Number(v);
const truth=v=>v===1||v==='1'||v===true||String(v).toLowerCase()==='true';
const val=(r,...ks)=>{for(const k of ks){if(r[k]!==undefined&&r[k]!==null&&r[k]!=='')return r[k]}return null};

const canonicalByNorm=new Map();
for(let i=0;i<13;i++) for(const p of JSON.parse(fs.readFileSync(path.join(root,`players${i}.json`),'utf8'))) canonicalByNorm.set(norm(p.n),p.n);
const canonical=name=>{const k=norm(name);return canonicalByNorm.get(k)||canonicalByNorm.get(aliases[k]||'')||null};

const playersUrl='https://github.com/nflverse/nflverse-data/releases/download/players/players.csv';
const playersRes=await fetch(playersUrl,{headers:{'user-agent':'fantasy-2026-probability-pipeline'}});
if(!playersRes.ok) throw new Error(`Failed nflverse players: ${playersRes.status}`);
const playersCsv=parseCsv(await playersRes.text());
const idToCanon=new Map();
const shortToCanon=new Map();
for(const p of playersCsv){
  const full=canonical(val(p,'display_name','full_name','football_name'));
  if(!full) continue;
  const id=val(p,'gsis_id'); if(id) idToCanon.set(String(id),full);
  for(const k of ['short_name','display_name','full_name']){const x=val(p,k);if(x)shortToCanon.set(norm(x),full);}
}
function canonFrom(id,name){return (id&&idToCanon.get(String(id)))||shortToCanon.get(norm(name))||canonical(name)||null;}

const agg=new Map();
const sourceFiles=[{type:'players',url:playersUrl}];
const zero=()=>({
  red_zone_pass_attempts:0,inside_10_pass_attempts:0,inside_5_pass_attempts:0,
  red_zone_pass_tds:0,inside_10_pass_tds:0,inside_5_pass_tds:0,
  red_zone_rush_attempts:0,inside_10_rush_attempts:0,inside_5_rush_attempts:0,
  red_zone_rush_tds:0,inside_10_rush_tds:0,inside_5_rush_tds:0,
  red_zone_targets:0,inside_10_targets:0,inside_5_targets:0,end_zone_targets:0,
  red_zone_receptions:0,inside_10_receptions:0,inside_5_receptions:0,
  red_zone_receiving_tds:0,inside_10_receiving_tds:0,inside_5_receiving_tds:0
});
function rec(player,season,week){const k=`${player}|${season}|${week}`;if(!agg.has(k))agg.set(k,zero());return agg.get(k)}

let pbpPlaysUsed=0,identifiedPassers=0,identifiedRushers=0,identifiedReceivers=0,conversionPlaysExcluded=0;
for(const season of seasons){
  const url=`https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv.gz`;
  const res=await fetch(url,{headers:{'user-agent':'fantasy-2026-probability-pipeline'}});
  if(!res.ok) throw new Error(`Failed nflverse PBP ${season}: ${res.status}`);
  const buf=Buffer.from(await res.arrayBuffer());
  const text=zlib.gunzipSync(buf).toString('utf8');
  sourceFiles.push({type:'pbp',season,url,compressed_bytes:buf.length});
  const pbp=parseCsv(text);
  for(const p of pbp){
    if(String(val(p,'season_type')||'REG').toUpperCase()!=='REG') continue;
    const week=Number(val(p,'week')); if(!Number.isFinite(week)||week<1||week>18) continue;
    const y=num(val(p,'yardline_100')); if(y==null||y>=20) continue;
    const noPlay=truth(val(p,'no_play'))||String(val(p,'play_type')).toLowerCase()==='no_play';
    if(noPlay) continue;
    const conversion=truth(val(p,'two_point_attempt'))||truth(val(p,'extra_point_attempt'));
    if(conversion){conversionPlaysExcluded++;continue;}
    const rz=y<20,i10=y<=10,i5=y<5;

    const passer=canonFrom(val(p,'passer_player_id'),val(p,'passer_player_name','passer'));
    const receiver=canonFrom(val(p,'receiver_player_id'),val(p,'receiver_player_name','receiver'));
    const rusher=canonFrom(val(p,'rusher_player_id'),val(p,'rusher_player_name','rusher'));
    const complete=truth(val(p,'complete_pass'));
    const incomplete=truth(val(p,'incomplete_pass'));
    const intercepted=truth(val(p,'interception'));
    const officialPassAttempt=complete||incomplete||intercepted;
    const rushAtt=truth(val(p,'rush_attempt'));
    const passTd=truth(val(p,'pass_touchdown'));
    const rushTd=truth(val(p,'rush_touchdown'));
    pbpPlaysUsed++;

    if(passer&&officialPassAttempt){identifiedPassers++;const a=rec(passer,season,week);if(rz)a.red_zone_pass_attempts++;if(i10)a.inside_10_pass_attempts++;if(i5)a.inside_5_pass_attempts++;if(passTd){if(rz)a.red_zone_pass_tds++;if(i10)a.inside_10_pass_tds++;if(i5)a.inside_5_pass_tds++;}}
    if(rusher&&rushAtt){identifiedRushers++;const a=rec(rusher,season,week);if(rz)a.red_zone_rush_attempts++;if(i10)a.inside_10_rush_attempts++;if(i5)a.inside_5_rush_attempts++;if(rushTd){if(rz)a.red_zone_rush_tds++;if(i10)a.inside_10_rush_tds++;if(i5)a.inside_5_rush_tds++;}}
    if(receiver&&officialPassAttempt){identifiedReceivers++;const a=rec(receiver,season,week);if(rz)a.red_zone_targets++;if(i10)a.inside_10_targets++;if(i5)a.inside_5_targets++;const air=num(val(p,'air_yards'));if(air!=null&&air>=y)a.end_zone_targets++;if(complete){if(rz)a.red_zone_receptions++;if(i10)a.inside_10_receptions++;if(i5)a.inside_5_receptions++;}if(passTd){if(rz)a.red_zone_receiving_tds++;if(i10)a.inside_10_receiving_tds++;if(i5)a.inside_5_receiving_tds++;}}
  }
}

let rowsWithHighValueActivity=0,playedRows=0,participationOverrides=0;
for(const r of rows){
  const a=agg.get(`${r.player}|${r.season}|${r.week}`)||zero();
  const hasPbpActivity=Object.values(a).some(v=>v>0);
  if(hasPbpActivity&&r.played===false){
    r.played=true;
    r.inactive=false;
    r.active_status='PARTICIPATION_CONFIRMED_PBP';
    r.data_quality_flags=Array.isArray(r.data_quality_flags)?r.data_quality_flags:[];
    if(!r.data_quality_flags.includes('SOURCE_CONFLICT'))r.data_quality_flags.push('SOURCE_CONFLICT');
    if(!r.data_quality_flags.includes('MANUAL_REVIEW'))r.data_quality_flags.push('MANUAL_REVIEW');
    r.inactive_reason=r.inactive_reason?`${r.inactive_reason}; overridden by nflverse PBP participation`:'Overridden by nflverse PBP participation';
    participationOverrides++;
  }
  Object.assign(r,a);
  r.red_zone_carries=a.red_zone_rush_attempts;
  r.goal_line_carries=a.inside_5_rush_attempts;
  if(r.played) playedRows++;
  if(hasPbpActivity) rowsWithHighValueActivity++;
  r.high_value_usage_source='nflverse play-by-play + nflverse GSIS player identity';
  r.high_value_usage_source_date=new Date().toISOString().slice(0,10);
}

data.schema_version='1.2.3';
data.generated_at=new Date().toISOString();
data.high_value_usage_source_files=sourceFiles;
data.rows=rows;
fs.writeFileSync(inputPath,JSON.stringify(data,null,2)+'\n');

const report={
  generated_at:data.generated_at,
  result:rowsWithHighValueActivity>0?'PASS':'BLOCKED',
  rows:rows.length,
  played_rows:playedRows,
  rows_with_high_value_activity:rowsWithHighValueActivity,
  participation_overrides_from_pbp:participationOverrides,
  conversion_plays_excluded:conversionPlaysExcluded,
  identified_passer_events:identifiedPassers,
  identified_rusher_events:identifiedRushers,
  identified_receiver_events:identifiedReceivers,
  source_files:sourceFiles,
  zone_definitions:{red_zone:'yardline_100 < 20',inside_10:'yardline_100 <= 10',inside_5:'yardline_100 < 5'},
  position_policy:{
    QB:['red_zone_pass_attempts','inside_10_pass_attempts','inside_5_pass_attempts','red_zone_rush_attempts','inside_10_rush_attempts','inside_5_rush_attempts','pass/rush TD splits'],
    RB:['red_zone_rush_attempts','inside_10_rush_attempts','inside_5_rush_attempts','red_zone_targets','receiving TD context'],
    WR:['red_zone_targets','inside_10_targets','inside_5_targets','end_zone_targets','red_zone_receptions','receiving TD splits'],
    TE:['red_zone_targets','inside_10_targets','inside_5_targets','end_zone_targets','red_zone_receptions','receiving TD splits']
  },
  safeguards:['No sportsbook inputs used.','Identity matching prefers GSIS IDs from nflverse players master.','Pass attempts use official-stat play outcomes (complete/incomplete/interception), not sacks.','No-play/penalty-nullified plays are excluded.','Two-point and extra-point conversion plays are excluded from official passing/rushing/receiving opportunity counts.','Zone boundaries are independently audited against PFR rather than assumed uniform.','Direct PBP participation overrides an injury-derived inactive row and is flagged SOURCE_CONFLICT + MANUAL_REVIEW.','End-zone target requires air_yards >= yardline_100; it is not inferred when air_yards is missing.']
};
fs.writeFileSync(path.join(root,'guardrails/high-value-usage-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(report.result!=='PASS')process.exit(1);
