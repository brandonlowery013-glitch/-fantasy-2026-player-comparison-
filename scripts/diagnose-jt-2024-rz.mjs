import zlib from 'node:zlib';
function parseCsv(text){const rs=[];let row=[],f='',q=false;for(let i=0;i<text.length;i++){const c=text[i];if(q){if(c==='"'&&text[i+1]==='"'){f+='"';i++;}else if(c==='"')q=false;else f+=c;}else{if(c==='"')q=true;else if(c===','){row.push(f);f='';}else if(c==='\n'){row.push(f.replace(/\r$/,''));rs.push(row);row=[];f='';}else f+=c;}}if(f.length||row.length){row.push(f);rs.push(row)}const h=rs.shift()||[];return rs.filter(r=>r.length>1).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])))}
const truth=v=>v===1||v==='1'||v===true||String(v).toLowerCase()==='true';
const url='https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2024.csv.gz';
const res=await fetch(url,{headers:{'user-agent':'fantasy-2026-probability-pipeline'}});if(!res.ok)throw new Error(String(res.status));
const rows=parseCsv(zlib.gunzipSync(Buffer.from(await res.arrayBuffer())).toString('utf8'));
const out=[];
for(const p of rows){if(String(p.season_type).toUpperCase()!=='REG')continue;const name=String(p.rusher_player_name||'');if(name!=='J.Taylor')continue;const y=Number(p.yardline_100);if(!Number.isFinite(y)||y>=20)continue;if(!truth(p.rush_attempt))continue;if(truth(p.no_play)||String(p.play_type).toLowerCase()==='no_play')continue;if(truth(p.two_point_attempt)||truth(p.extra_point_attempt))continue;out.push({week:Number(p.week),play_id:p.play_id,yardline_100:y,play_type:p.play_type,rushing_yards:p.rushing_yards,penalty:p.penalty,penalty_team:p.penalty_team,penalty_type:p.penalty_type,penalty_yards:p.penalty_yards,desc:p.desc});}
console.log(JSON.stringify({count:out.length,inside10:out.filter(x=>x.yardline_100<=10).length,inside5:out.filter(x=>x.yardline_100<5).length,plays:out},null,2));
