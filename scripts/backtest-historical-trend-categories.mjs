import fs from 'node:fs';
import path from 'node:path';

const CONTRACT='data/sources/historical-trend-category-backtest-2026.json';
const STEP4='data/sources/historical-game-trend-db-2026.json';
const OUT='data/probability/generated/historical-trend-category-backtest-2021-2025.json';
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
  const s4=JSON.parse(fs.readFileSync(STEP4,'utf8'));
  const r=await fetch(s4.source.url,{headers:{'user-agent':'fantasy-2026-step5-trend-backtest'}});
  if(!r.ok)throw new Error(`historical source fetch ${r.status}`);
  return parseCSV(await r.text())
    .filter(g=>String(g.game_type).toUpperCase()==='REG'&&s4.source.history_window.includes(Number(g.season))&&num(g.home_score)!=null&&num(g.away_score)!=null)
    .map(g=>({id:g.game_id,season:Number(g.season),week:Number(g.week),home:canon(g.home_team),away:canon(g.away_team),hs:num(g.home_score),as:num(g.away_score),spread:num(g.spread_line),total:num(g.total_line),hr:num(g.home_rest),ar:num(g.away_rest),div:bool(g.div_game),surface:String(g.surface||'').trim()||null}))
    .sort((a,b)=>a.season-b.season||a.week-b.week||String(a.id).localeCompare(String(b.id)));
}

const rec=()=>({w:0,l:0,t:0,g:0});
const pushSU=(r,x)=>{r.g++;if(x==='W')r.w++;else if(x==='L')r.l++;else r.t++;};
const pct=r=>r.g?(r.w+r.t*.5)/r.g:null;
const side=v=>v>1e-9?'W':v<-1e-9?'L':'P';
const ou=v=>v>1e-9?'O':v<-1e-9?'U':'P';

function pregameRecords(games){
  const pre=new Map(), season=new Map();
  for(const g of games){
    for(const t of [g.home,g.away]){
      const k=`${g.season}:${t}`;
      if(!season.has(k))season.set(k,rec());
      pre.set(`${g.id}:${t}`,structuredClone(season.get(k)));
    }
    const hm=g.hs-g.as;
    pushSU(season.get(`${g.season}:${g.home}`),side(hm));
    pushSU(season.get(`${g.season}:${g.away}`),side(-hm));
  }
  return pre;
}

function teamRows(games){
  const pre=pregameRecords(games), seen=new Set(), rows=[];
  for(const g of games){
    const pair=`${g.season}:${[g.home,g.away].sort().join('-')}`;
    const rematch=seen.has(pair);
    for(const home of [true,false]){
      const team=home?g.home:g.away, opponent=home?g.away:g.home;
      const margin=home?g.hs-g.as:g.as-g.hs;
      const oppPre=pre.get(`${g.id}:${opponent}`)||rec();
      const oppPct=pct(oppPre);
      const teamSpread=g.spread==null?null:(home?-g.spread:g.spread);
      const fav=teamSpread==null?'UNKNOWN':teamSpread<0?'FAVORITE':teamSpread>0?'DOG':'PICKEM';
      const rest=home?g.hr:g.ar;
      const restBucket=rest==null?'UNKNOWN':rest<=6?'SHORT_REST_LE_6':rest>=10?'LONG_REST_GE_10':'NORMAL_REST_7_9';
      const sf=(g.surface||'').toLowerCase();
      const surfaceBucket=!sf?'UNKNOWN':sf.includes('grass')?'GRASS':(sf.includes('turf')||sf.includes('artificial'))?'TURF':'OTHER';
      rows.push({game_id:g.id,season:g.season,week:g.week,team,opponent,
        ats:teamSpread==null?null:side(margin+teamSpread),
        ou:g.total==null?null:ou(g.hs+g.as-g.total),
        venue:home?'HOME':'ROAD',favorite_status:fav,
        opponent_bucket:oppPre.g===0?'UNKNOWN':oppPct>=.5?'OPPONENT_500_PLUS':'OPPONENT_BELOW_500',
        week_bucket:g.week===1?'WEEK_1':'WEEK_2_PLUS',rest_bucket:restBucket,
        division_bucket:g.div?'DIVISION':'NON_DIVISION',surface_bucket:surfaceBucket,
        rematch_bucket:rematch?'REMATCH':'FIRST_MEETING'});
    }
    seen.add(pair);
  }
  return rows;
}

const dimensions={
  ALL:r=>'ALL',HOME_ROAD:r=>r.venue,FAVORITE_DOG_PICKEM:r=>r.favorite_status,
  OPPONENT_PREGAME_WINNING_500_PLUS_OR_BELOW:r=>r.opponent_bucket,WEEK_1_OR_LATER:r=>r.week_bucket,
  REST_BUCKET:r=>r.rest_bucket,DIVISION_OR_NON_DIVISION:r=>r.division_bucket,SURFACE:r=>r.surface_bucket,
  SAME_SEASON_REMATCH:r=>r.rematch_bucket
};

function wilson(w,n,z=1.959963984540054){if(!n)return{lower:null,upper:null};const p=w/n,d=1+z*z/n,c=(p+z*z/(2*n))/d,m=z*Math.sqrt((p*(1-p)+z*z/(4*n))/n)/d;return{lower:c-m,upper:c+m}}
function trainSignal(rows,market,dimension,value,team,test,c){
  const m=market==='ATS'?'ats':'ou';
  const a=rows.filter(r=>r.team===team&&r.season<test&&dimensions[dimension](r)===value&&r[m]&&r[m]!=='P');
  if(a.length<c.signal_rule.minimum_training_market_games)return null;
  const positive=a.filter(r=>market==='ATS'?r.ats==='W':r.ou==='O').length, rate=positive/a.length;
  if(rate>=c.signal_rule.upper_rate_threshold)return{direction:market==='ATS'?'COVER':'OVER',training_n:a.length,training_rate:rate};
  if(rate<=c.signal_rule.lower_rate_threshold)return{direction:market==='ATS'?'FADE_COVER':'UNDER',training_n:a.length,training_rate:rate};
  return null;
}
function hit(row,market,direction){
  if(market==='ATS'){if(!row.ats||row.ats==='P')return null;return direction==='COVER'?row.ats==='W':row.ats==='L'}
  if(!row.ou||row.ou==='P')return null;return direction==='OVER'?row.ou==='O':row.ou==='U';
}
function emptyEval(){return{signals:0,hits:0,misses:0,n:0,hit_rate:null,wilson95:{lower:null,upper:null}}}
function finalize(x){x.n=x.hits+x.misses;x.hit_rate=x.n?x.hits/x.n:null;x.wilson95=wilson(x.hits,x.n);return x}

function evaluateFold(rows,test,c,dimension,market){
  const testRows=rows.filter(r=>r.season===test), out=emptyEval();
  for(const row of testRows){
    const value=dimensions[dimension](row);
    const s=trainSignal(rows,market,dimension,value,row.team,test,c);
    if(!s)continue;
    const h=hit(row,market,s.direction);if(h==null)continue;
    out.signals++;if(h)out.hits++;else out.misses++;
  }
  return finalize(out);
}
function combine(folds){const x=emptyEval();for(const f of folds){x.signals+=f.signals;x.hits+=f.hits;x.misses+=f.misses}return finalize(x)}
function classify(folds,pooled,c){
  if(!pooled.n)return'NO_TESTABLE_SAMPLE';
  const each=folds.filter(f=>f.n>0);
  const research=pooled.n>=c.evaluation.research_candidate_min_pooled_n&&pooled.hit_rate>=c.evaluation.research_candidate_min_pooled_hit_rate&&each.length===folds.length&&each.every(f=>f.hit_rate>=c.evaluation.research_candidate_min_each_fold_hit_rate);
  const robust=research&&pooled.wilson95.lower>c.evaluation.robust_candidate_requires_wilson_95_lower_above;
  return robust?'ROBUST_RESEARCH_CANDIDATE':research?'RESEARCH_CANDIDATE':'NO_STABLE_SIGNAL';
}

async function main(){
  const c=JSON.parse(fs.readFileSync(CONTRACT,'utf8'));
  if(process.argv.includes('--self-test')){
    const w=wilson(60,100);if(!(w.lower>.5&&w.upper<.7))throw new Error('wilson self-test');
    console.log(JSON.stringify({result:'PASS',mode:'SELF_TEST',wilson_60_of_100:w},null,2));return;
  }
  const games=await loadGames(), rows=teamRows(games), results=[];
  for(const dimension of c.dimensions)for(const market of c.markets){
    const folds=c.held_out_test_seasons.map(test_season=>({test_season,...evaluateFold(rows,test_season,c,dimension,market)}));
    const pooled=combine(folds);results.push({dimension,market,folds,pooled,classification:classify(folds,pooled,c)});
  }
  const summary={robust_research_candidates:results.filter(x=>x.classification==='ROBUST_RESEARCH_CANDIDATE').map(x=>`${x.dimension}:${x.market}`),research_candidates:results.filter(x=>x.classification==='RESEARCH_CANDIDATE').map(x=>`${x.dimension}:${x.market}`),no_stable_signal:results.filter(x=>x.classification==='NO_STABLE_SIGNAL').map(x=>`${x.dimension}:${x.market}`),no_testable_sample:results.filter(x=>x.classification==='NO_TESTABLE_SAMPLE').map(x=>`${x.dimension}:${x.market}`)};
  const out={schema_version:'1.0.0',status:'SHADOW_OUT_OF_SAMPLE_RESEARCH_ONLY',generated_at:new Date().toISOString(),source:'nflverse nfldata schedules/games.csv',history_window:c.history_window,held_out_test_seasons:c.held_out_test_seasons,training_rule:c.signal_rule,evaluation_rule:c.evaluation,production_numeric_authority:0,actionable:false,automatic_promotion:false,games_loaded:games.length,team_rows:rows.length,results,summary};
  fs.mkdirSync(path.dirname(OUT),{recursive:true});fs.writeFileSync(OUT,JSON.stringify(out,null,2)+'\n');
  console.log(JSON.stringify({result:'PASS',games_loaded:games.length,team_rows:rows.length,summary,results:results.map(x=>({dimension:x.dimension,market:x.market,classification:x.classification,n:x.pooled.n,hit_rate:x.pooled.hit_rate,wilson95_lower:x.pooled.wilson95.lower}))},null,2));
}
await main();
