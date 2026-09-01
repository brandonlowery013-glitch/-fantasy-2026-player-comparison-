import fs from 'node:fs';
import path from 'node:path';

const CONTRACT='data/sources/historical-game-trend-db-2026.json';
const OUT='data/probability/generated/historical-game-trend-db-2021-2025.json';
const canon=x=>({LA:'LAR',JAC:'JAX',WSH:'WAS'}[String(x||'').toUpperCase()]||String(x||'').toUpperCase());
const num=x=>x===''||x==null?null:(Number.isFinite(Number(x))?Number(x):null);
const bool=x=>/^(1|true|yes)$/i.test(String(x||''));

function parseCSV(t){
  const lines=t.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);
  const parse=l=>{let a=[],s='',q=false;for(let i=0;i<=l.length;i++){const c=l[i]??',';if(c==='"'){if(q&&l[i+1]==='"'){s+='"';i++}else q=!q}else if(c===','&&!q){a.push(s);s=''}else s+=c}return a};
  const h=parse(lines.shift());
  return lines.map(l=>{const a=parse(l),o={};h.forEach((k,i)=>o[k]=a[i]??'');return o});
}

async function loadGames(){
  const c=JSON.parse(fs.readFileSync(CONTRACT,'utf8'));
  const r=await fetch(c.source.url,{headers:{'user-agent':'fantasy-2026-historical-trend-db'}});
  if(!r.ok)throw new Error(`historical source fetch ${r.status}`);
  const rows=parseCSV(await r.text());
  return rows.filter(g=>String(g.game_type).toUpperCase()==='REG'&&c.source.history_window.includes(Number(g.season))&&num(g.home_score)!=null&&num(g.away_score)!=null)
    .map(g=>({
      id:g.game_id,season:Number(g.season),week:Number(g.week),home:canon(g.home_team),away:canon(g.away_team),
      hs:num(g.home_score),as:num(g.away_score),spread:num(g.spread_line),total:num(g.total_line),
      hr:num(g.home_rest),ar:num(g.away_rest),div:bool(g.div_game),surface:String(g.surface||'').trim()||null,roof:String(g.roof||'').trim()||null
    }))
    .sort((a,b)=>a.season-b.season||a.week-b.week||String(a.id).localeCompare(String(b.id)));
}

const rec=()=>({w:0,l:0,t:0,g:0});
const pushResult=(r,x)=>{r.g++;if(x==='W')r.w++;else if(x==='L')r.l++;else r.t++;};
const pct=r=>r.g?(r.w+r.t*.5)/r.g:null;
const outcome=(v,eps=1e-9)=>v>eps?'W':v<-eps?'L':'T';
const ouOutcome=(v,eps=1e-9)=>v>eps?'O':v<-eps?'U':'P';
const marketRec=()=>({w:0,l:0,p:0,g:0});
const pushATS=(r,x)=>{r.g++;if(x==='W')r.w++;else if(x==='L')r.l++;else r.p++;};
const ouRec=()=>({o:0,u:0,p:0,g:0});
const pushOU=(r,x)=>{r.g++;if(x==='O')r.o++;else if(x==='U')r.u++;else r.p++;};

function recordMap(games){
  const pre=new Map(), currentSeason=new Map();
  for(const g of games){
    for(const t of [g.home,g.away]){
      const k=`${g.season}:${t}`;
      if(!currentSeason.has(k))currentSeason.set(k,rec());
      pre.set(`${g.id}:${t}`,structuredClone(currentSeason.get(k)));
    }
    const homeR=currentSeason.get(`${g.season}:${g.home}`), awayR=currentSeason.get(`${g.season}:${g.away}`);
    const hm=g.hs-g.as;
    pushResult(homeR,outcome(hm));pushResult(awayR,outcome(-hm));
  }
  return pre;
}

function teamRows(games){
  const pre=recordMap(games), seenPair=new Set(), rows=[];
  for(const g of games){
    const pair=`${g.season}:${[g.home,g.away].sort().join('-')}`;
    const rematch=seenPair.has(pair);
    for(const side of ['home','away']){
      const team=side==='home'?g.home:g.away, opp=side==='home'?g.away:g.home, home=side==='home';
      const teamMargin=home?g.hs-g.as:g.as-g.hs;
      const oppPre=pre.get(`${g.id}:${opp}`)||rec();
      const oppPct=pct(oppPre);
      const spreadAvailable=g.spread!=null;
      const totalAvailable=g.total!=null;
      const teamLine=spreadAvailable?(home?-g.spread:g.spread):null;
      const favorite=spreadAvailable?(teamLine<0?'FAVORITE':teamLine>0?'DOG':'PICKEM'):'UNKNOWN';
      const rest=home?g.hr:g.ar;
      const restBucket=rest==null?'UNKNOWN':rest<=6?'SHORT_REST_LE_6':rest>=10?'LONG_REST_GE_10':'NORMAL_REST_7_9';
      const surface=(g.surface||'').toLowerCase();
      const surfaceBucket=!surface?'UNKNOWN':surface.includes('grass')?'GRASS':surface.includes('turf')||surface.includes('artificial')?'TURF':'OTHER';
      rows.push({
        game_id:g.id,season:g.season,week:g.week,team,opponent:opp,home,
        points_for:home?g.hs:g.as,points_against:home?g.as:g.hs,team_margin:teamMargin,
        spread_line:g.spread,total_line:g.total,team_spread:teamLine,
        su:outcome(teamMargin),ats:spreadAvailable?outcome(teamMargin+teamLine):null,
        ou:totalAvailable?ouOutcome(g.hs+g.as-g.total):null,
        opponent_pregame_games:oppPre.g,opponent_pregame_win_pct:oppPct,
        opponent_bucket:oppPre.g===0?'UNKNOWN':oppPct>=.5?'OPPONENT_500_PLUS':'OPPONENT_BELOW_500',
        venue:home?'HOME':'ROAD',favorite_status:favorite,week_bucket:g.week===1?'WEEK_1':'WEEK_2_PLUS',
        rest_days:rest,rest_bucket:restBucket,division_game:g.div,division_bucket:g.div?'DIVISION':'NON_DIVISION',
        surface:g.surface,surface_bucket:surfaceBucket,same_season_rematch:rematch,rematch_bucket:rematch?'REMATCH':'FIRST_MEETING'
      });
    }
    seenPair.add(pair);
  }
  return rows;
}

const dims=[
  ['ALL',r=>'ALL'],['HOME_ROAD',r=>r.venue],['FAVORITE_DOG_PICKEM',r=>r.favorite_status],
  ['OPPONENT_PREGAME_WINNING_500_PLUS_OR_BELOW',r=>r.opponent_bucket],['WEEK_1_OR_LATER',r=>r.week_bucket],
  ['REST_BUCKET',r=>r.rest_bucket],['DIVISION_OR_NON_DIVISION',r=>r.division_bucket],['SURFACE',r=>r.surface_bucket],
  ['SAME_SEASON_REMATCH',r=>r.rematch_bucket]
];

function aggregateRows(rows){
  const byTeam={};
  for(const row of rows){
    byTeam[row.team]??={};
    for(const [dimension,getValue] of dims){
      const value=getValue(row); const key=`${dimension}:${value}`;
      const slot=byTeam[row.team][key]??={dimension,value,full:{su:rec(),ats:marketRec(),ou:ouRec()},by_season:{},_rows:[]};
      pushResult(slot.full.su,row.su); if(row.ats)pushATS(slot.full.ats,row.ats); if(row.ou)pushOU(slot.full.ou,row.ou);
      const ss=slot.by_season[row.season]??={su:rec(),ats:marketRec(),ou:ouRec()};
      pushResult(ss.su,row.su); if(row.ats)pushATS(ss.ats,row.ats); if(row.ou)pushOU(ss.ou,row.ou);
      slot._rows.push(row);
    }
  }
  for(const team of Object.keys(byTeam))for(const slot of Object.values(byTeam[team])){
    const ordered=slot._rows.sort((a,b)=>a.season-b.season||a.week-b.week||String(a.game_id).localeCompare(String(b.game_id)));
    const recent=n=>{const a=ordered.slice(-n),x={su:rec(),ats:marketRec(),ou:ouRec()};for(const r of a){pushResult(x.su,r.su);if(r.ats)pushATS(x.ats,r.ats);if(r.ou)pushOU(x.ou,r.ou)}return x};
    slot.recent_last_5=recent(5);slot.recent_last_10=recent(10);delete slot._rows;
  }
  return byTeam;
}

function synthetic(){return [
  {id:'2025_01_A_B',season:2025,week:1,home:'A',away:'B',hs:20,as:10,spread:3,total:35,hr:7,ar:7,div:false,surface:'grass',roof:'outdoors'},
  {id:'2025_02_B_C',season:2025,week:2,home:'B',away:'C',hs:21,as:20,spread:-2,total:40,hr:7,ar:7,div:false,surface:'turf',roof:'dome'},
  {id:'2025_03_A_B',season:2025,week:3,home:'A',away:'B',hs:17,as:20,spread:4,total:38,hr:10,ar:6,div:true,surface:'grass',roof:'outdoors'}
]}

async function main(){
  const self=process.argv.includes('--self-test'); const games=self?synthetic():await loadGames();
  const rows=teamRows(games), trends=aggregateRows(rows);
  const market={games:games.length,spread_available_games:games.filter(g=>g.spread!=null).length,total_available_games:games.filter(g=>g.total!=null).length};
  const out={schema_version:'1.0.0',status:'SHADOW_DESCRIPTIVE_CONTEXT_ONLY',generated_at:self?'2026-09-01T00:00:00Z':new Date().toISOString(),history_window:[2021,2022,2023,2024,2025],source:'nflverse nfldata schedules/games.csv',production_numeric_authority:0,actionable:false,market_coverage:market,trend_dimensions:dims.map(x=>x[0]),teams:trends};
  const blocked=[];
  if(self){
    const a=rows.find(r=>r.game_id==='2025_01_A_B'&&r.team==='A'); const b=rows.find(r=>r.game_id==='2025_01_A_B'&&r.team==='B');
    if(a?.ats!=='W'||b?.ats!=='L')blocked.push('ATS sign convention failed');
    if(a?.ou!=='U')blocked.push('OU convention failed');
    const rematch=rows.find(r=>r.game_id==='2025_03_A_B'&&r.team==='A'); if(rematch?.same_season_rematch!==true)blocked.push('rematch detection failed');
    const week2=rows.find(r=>r.game_id==='2025_02_B_C'&&r.team==='B'); if(week2?.opponent_bucket!=='UNKNOWN')blocked.push('pregame opponent record leakage check failed');
  }
  if(!self){fs.mkdirSync(path.dirname(OUT),{recursive:true});fs.writeFileSync(OUT,JSON.stringify(out,null,2)+'\n');}
  console.log(JSON.stringify({result:blocked.length?'BLOCKED':'PASS',games:games.length,team_rows:rows.length,teams:Object.keys(trends).length,market_coverage:market,blocked},null,2));
  if(blocked.length)process.exit(1);
}
await main();
