import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const seasons=[2021,2022,2023,2024,2025];
const outDir=path.join(root,'data/probability/generated');
fs.mkdirSync(outDir,{recursive:true});
fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});

const players=[];
for(let i=0;i<13;i++) players.push(...JSON.parse(fs.readFileSync(path.join(root,`players${i}.json`),'utf8')));

const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
const aliases={
  'gabrieldavis':'gavedavis',
  'kennethwalkeriii':'kennethwalker',
  'marvinharrisonjr':'marvinharrison',
  'briantomjr':'brianthomas',
  'michaelpittmanjr':'michaelpittman',
  'odellbeckhamjr':'odellbeckham',
  'ronaldmoore':'rondalemoore'
};
const canonical=new Map();
for(const p of players){
  const k=norm(p.n); canonical.set(k,p);
  const a=aliases[k]; if(a) canonical.set(a,p);
}

function parseCsv(text){
  const rows=[]; let row=[],field='',q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){
      if(c==='"'&&text[i+1]==='"'){field+='"';i++;}
      else if(c==='"') q=false;
      else field+=c;
    }else{
      if(c==='"') q=true;
      else if(c===','){row.push(field);field='';}
      else if(c==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}
      else field+=c;
    }
  }
  if(field.length||row.length){row.push(field);rows.push(row);}
  const h=rows.shift()||[];
  return rows.filter(r=>r.length>1).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])));
}
const num=v=>v===''||v==null?null:Number(v);
const val=(r,...keys)=>{for(const k of keys) if(r[k]!==undefined&&r[k]!=='') return r[k]; return null;};
const bool=v=>v===true||v==='1'||String(v).toLowerCase()==='true';
const cleanPos=p=>String(p||'').toUpperCase();

const rows=[];
const sourceFiles=[];
const sourceNames=new Set();
const unmatchedNames=new Map();
for(const season of seasons){
  const url=`https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`;
  const res=await fetch(url,{headers:{'user-agent':'fantasy-2026-probability-pipeline'}});
  if(!res.ok) throw new Error(`Failed nflverse ${season}: ${res.status}`);
  const text=await res.text();
  sourceFiles.push({season,url,bytes:Buffer.byteLength(text)});
  const data=parseCsv(text);
  for(const r of data){
    if(String(val(r,'season_type','seasonType')||'REG').toUpperCase()!=='REG') continue;
    const display=val(r,'player_display_name','player_name','player');
    if(!display) continue;
    const nk=norm(display);
    sourceNames.add(nk);
    let p=canonical.get(nk);
    if(!p){
      const alias=aliases[nk]; if(alias) p=canonical.get(alias);
    }
    if(!p){unmatchedNames.set(display,(unmatchedNames.get(display)||0)+1);continue;}
    const pos=cleanPos(val(r,'position','position_group'));
    if(pos && p.p && pos!==p.p && !(p.p==='RB'&&pos==='FB')) continue;
    const week=Number(val(r,'week'));
    if(!Number.isFinite(week)||week<1||week>18) continue;
    const team=val(r,'recent_team','team');
    const opp=val(r,'opponent_team','opponent');
    rows.push({
      player:p.n,
      position:p.p,
      season,
      week,
      team:team||null,
      opponent:opp||null,
      played:true,
      started:null,
      active_status:'ACTIVE_PLAYED',
      pass_attempts:num(val(r,'attempts','passing_attempts')),
      pass_yards:num(val(r,'passing_yards','pass_yards')),
      pass_tds:num(val(r,'passing_tds','pass_tds')),
      rush_attempts:num(val(r,'carries','rushing_attempts','rush_attempts')),
      rush_yards:num(val(r,'rushing_yards','rush_yards')),
      rush_tds:num(val(r,'rushing_tds','rush_tds')),
      targets:num(val(r,'targets')),
      receptions:num(val(r,'receptions')),
      receiving_yards:num(val(r,'receiving_yards')),
      receiving_tds:num(val(r,'receiving_tds')),
      receiving_air_yards:num(val(r,'receiving_air_yards')),
      receiving_yards_after_catch:num(val(r,'receiving_yards_after_catch')),
      target_share:num(val(r,'target_share')),
      air_yards_share:num(val(r,'air_yards_share')),
      wopr:num(val(r,'wopr')),
      fantasy_points_ppr:num(val(r,'fantasy_points_ppr')),
      source:'nflverse player_stats weekly',
      source_url:url,
      source_date:new Date().toISOString().slice(0,10),
      data_quality_flags:[]
    });
  }
}

rows.sort((a,b)=>a.player.localeCompare(b.player)||a.season-b.season||a.week-b.week);
const byPlayer=new Map();
for(const r of rows){if(!byPlayer.has(r.player))byPlayer.set(r.player,[]);byPlayer.get(r.player).push(r);}
const playerSummary=players.map(p=>({player:p.n,position:p.p,rows:(byPlayer.get(p.n)||[]).length,seasons:[...new Set((byPlayer.get(p.n)||[]).map(r=>r.season))]}));
const withHistory=playerSummary.filter(x=>x.rows>0);
const noHistory=playerSummary.filter(x=>x.rows===0);
const duplicateKeys=[]; const seen=new Set();
for(const r of rows){const k=`${r.player}|${r.season}|${r.week}`;if(seen.has(k))duplicateKeys.push(k);seen.add(k);}

const dataset={
  schema_version:'1.0.0',
  season_target:2026,
  history_window:seasons,
  generated_at:new Date().toISOString(),
  source_license:'nflverse/nflverse-data CC-BY-4.0',
  source_files:sourceFiles,
  row_count:rows.length,
  player_universe:players.length,
  players_with_nflverse_history:withHistory.length,
  players_without_history:noHistory.map(x=>x.player),
  rows
};
const report={
  generated_at:dataset.generated_at,
  result:duplicateKeys.length?'BLOCKED':'PASS',
  player_universe:players.length,
  rows:rows.length,
  players_with_history:withHistory.length,
  players_without_history:noHistory.length,
  no_history_players:noHistory,
  duplicate_player_season_week_keys:duplicateKeys.slice(0,100),
  source_files:sourceFiles,
  coverage_by_position:Object.fromEntries(['QB','RB','WR','TE'].map(pos=>{const a=playerSummary.filter(x=>x.position===pos);return [pos,{total:a.length,with_history:a.filter(x=>x.rows>0).length,rows:a.reduce((s,x)=>s+x.rows,0)}]})),
  note:'Core weekly player-stat ingestion only. Inactive weeks, starts, injury-limited/partial-game tags, coach/QB context, weather and proprietary advanced usage are separate enrichment passes.'
};
fs.writeFileSync(path.join(outDir,'historical-core-2021-2025.json'),JSON.stringify(dataset,null,2)+'\n');
fs.writeFileSync(path.join(root,'guardrails/historical-core-ingestion-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(duplicateKeys.length) process.exit(1);
if(players.length!==162) throw new Error(`Expected 162-player universe, got ${players.length}`);
if(withHistory.length<100) throw new Error(`Historical mapping coverage unexpectedly low: ${withHistory.length}/162`);
