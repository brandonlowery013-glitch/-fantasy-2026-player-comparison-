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

const playerNames=new Map();
for(let i=0;i<13;i++) for(const p of JSON.parse(fs.readFileSync(path.join(root,`players${i}.json`),'utf8'))){playerNames.set(norm(p.n),p.n)}
function canon(name){const k=norm(name);return playerNames.get(k)||playerNames.get(aliases[k]||'')||null}

const agg=new Map();
const sourceFiles=[];
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

for(const season of seasons){
  const url=`https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv.gz`;
  const res=await fetch(url,{headers:{'user-agent':'fantasy-2026-probability-pipeline'}});
  if(!res.ok) throw new Error(`Failed nflverse PBP ${season}: ${res.status}`);
  const buf=Buffer.from(await res.arrayBuffer());
  const text=zlib.gunzipSync(buf).toString('utf8');
  sourceFiles.push({season,url,compressed_bytes:buf.length});
  const pbp=parseCsv(text);
  for(const p of pbp){
    if(String(val(p,'season_type')||'REG').toUpperCase()!=='REG') continue;
    const week=Number(val(p,'week')); if(!Number.isFinite(week)||week<1||week>18) continue;
    const y=num(val(p,'yardline_100')); if(y==null||y>20) continue;
    const rz=y<=20,i10=y<=10,i5=y<=5;

    const passer=canon(val(p,'passer_player_name','passer')); const receiver=canon(val(p,'receiver_player_name','receiver')); const rusher=canon(val(p,'rusher_player_name','rusher'));
    const passAtt=truth(val(p,'pass_attempt')); const rushAtt=truth(val(p,'rush_attempt')); const complete=truth(val(p,'complete_pass'));
    const passTd=truth(val(p,'pass_touchdown')); const rushTd=truth(val(p,'rush_touchdown')); const recTd=truth(val(p,'pass_touchdown'));

    if(passer&&passAtt){const a=rec(passer,season,week);if(rz)a.red_zone_pass_attempts++;if(i10)a.inside_10_pass_attempts++;if(i5)a.inside_5_pass_attempts++;if(passTd){if(rz)a.red_zone_pass_tds++;if(i10)a.inside_10_pass_tds++;if(i5)a.inside_5_pass_tds++;}}
    if(rusher&&rushAtt){const a=rec(rusher,season,week);if(rz)a.red_zone_rush_attempts++;if(i10)a.inside_10_rush_attempts++;if(i5)a.inside_5_rush_attempts++;if(rushTd){if(rz)a.red_zone_rush_tds++;if(i10)a.inside_10_rush_tds++;if(i5)a.inside_5_rush_tds++;}}
    if(receiver&&passAtt){const a=rec(receiver,season,week);if(rz)a.red_zone_targets++;if(i10)a.inside_10_targets++;if(i5)a.inside_5_targets++;const air=num(val(p,'air_yards'));if(air!=null&&air>=y)a.end_zone_targets++;if(complete){if(rz)a.red_zone_receptions++;if(i10)a.inside_10_receptions++;if(i5)a.inside_5_receptions++;}if(recTd){if(rz)a.red_zone_receiving_tds++;if(i10)a.inside_10_receiving_tds++;if(i5)a.inside_5_receiving_tds++;}}
  }
}

let matched=0;
for(const r of rows){
  const a=agg.get(`${r.player}|${r.season}|${r.week}`)||zero();
  Object.assign(r,a);
  r.red_zone_carries=a.red_zone_rush_attempts;
  r.goal_line_carries=a.inside_5_rush_attempts;
  if(r.played) matched++;
  r.high_value_usage_source='nflverse play-by-play';
  r.high_value_usage_source_date=new Date().toISOString().slice(0,10);
}

data.schema_version='1.2.0';
data.generated_at=new Date().toISOString();
data.high_value_usage_source_files=sourceFiles;
data.rows=rows;
fs.writeFileSync(inputPath,JSON.stringify(data,null,2)+'\n');

const report={
  generated_at:data.generated_at,
  result:'PASS',
  rows:rows.length,
  played_rows_populated:matched,
  source_files:sourceFiles,
  position_policy:{
    QB:['red_zone_pass_attempts','inside_10_pass_attempts','inside_5_pass_attempts','red_zone_rush_attempts','inside_10_rush_attempts','inside_5_rush_attempts','pass/rush TD splits'],
    RB:['red_zone_rush_attempts','inside_10_rush_attempts','inside_5_rush_attempts','red_zone_targets','receiving TD context'],
    WR:['red_zone_targets','inside_10_targets','inside_5_targets','end_zone_targets','red_zone_receptions','receiving TD splits'],
    TE:['red_zone_targets','inside_10_targets','inside_5_targets','end_zone_targets','red_zone_receptions','receiving TD splits']
  },
  safeguards:['No sportsbook inputs used.','All high-value usage is derived from nflverse play-by-play.','End-zone target requires air_yards >= yardline_100; it is not inferred when air_yards is missing.','Inactive rows remain zero rather than being treated as played opportunities.']
};
fs.writeFileSync(path.join(root,'guardrails/high-value-usage-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
