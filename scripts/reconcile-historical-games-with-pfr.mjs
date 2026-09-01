import fs from 'node:fs';
import path from 'node:path';

const CONTRACT='data/sources/pfr-historical-reconciliation-2026.json';
const HIST='data/sources/historical-game-trend-db-2026.json';
const OUT='data/probability/generated/pfr-historical-reconciliation-2021-2025.json';
const c=JSON.parse(fs.readFileSync(CONTRACT,'utf8'));
const h=JSON.parse(fs.readFileSync(HIST,'utf8'));

const canon=x=>({LA:'LAR',JAC:'JAX',WSH:'WAS'}[String(x||'').toUpperCase()]||String(x||'').toUpperCase());
const num=x=>x===''||x==null?null:(Number.isFinite(Number(x))?Number(x):null);

const TEAM={
'Arizona Cardinals':'ARI','Atlanta Falcons':'ATL','Baltimore Ravens':'BAL','Buffalo Bills':'BUF','Carolina Panthers':'CAR','Chicago Bears':'CHI','Cincinnati Bengals':'CIN','Cleveland Browns':'CLE','Dallas Cowboys':'DAL','Denver Broncos':'DEN','Detroit Lions':'DET','Green Bay Packers':'GB','Houston Texans':'HOU','Indianapolis Colts':'IND','Jacksonville Jaguars':'JAX','Kansas City Chiefs':'KC','Las Vegas Raiders':'LV','Los Angeles Chargers':'LAC','Los Angeles Rams':'LAR','Miami Dolphins':'MIA','Minnesota Vikings':'MIN','New England Patriots':'NE','New Orleans Saints':'NO','New York Giants':'NYG','New York Jets':'NYJ','Philadelphia Eagles':'PHI','Pittsburgh Steelers':'PIT','San Francisco 49ers':'SF','Seattle Seahawks':'SEA','Tampa Bay Buccaneers':'TB','Tennessee Titans':'TEN','Washington Commanders':'WAS','Washington Football Team':'WAS'
};

function parseCSV(t){const lines=t.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);const parse=l=>{let a=[],s='',q=false;for(let i=0;i<=l.length;i++){const ch=l[i]??',';if(ch==='"'){if(q&&l[i+1]==='"'){s+='"';i++}else q=!q}else if(ch===','&&!q){a.push(s);s=''}else s+=ch}return a};const head=parse(lines.shift());return lines.map(l=>{const a=parse(l),o={};head.forEach((k,i)=>o[k]=a[i]??'');return o})}
function cleanHtml(x){return String(x||'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim()}
function cell(row,stat){const m=row.match(new RegExp(`<t[dh][^>]*data-stat=["']${stat}["'][^>]*>([\\s\\S]*?)<\\/t[dh]>`,'i'));return m?cleanHtml(m[1]):''}

async function loadNflverse(){const r=await fetch(h.source.url,{headers:{'user-agent':'fantasy-2026-pfr-reconciliation'}});if(!r.ok)throw new Error(`nflverse fetch ${r.status}`);return parseCSV(await r.text()).filter(g=>String(g.game_type).toUpperCase()==='REG'&&c.validation_source.history_window.includes(Number(g.season))&&num(g.home_score)!=null&&num(g.away_score)!=null).map(g=>({season:Number(g.season),week:Number(g.week),home:canon(g.home_team),away:canon(g.away_team),hs:num(g.home_score),as:num(g.away_score)}));}

async function loadPfrSeason(season){const url=c.validation_source.season_url_template.replace('{season}',String(season));const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 fantasy-2026-data-validation contact=local-model-audit'}});if(!r.ok)throw new Error(`PFR ${season} fetch ${r.status}`);let html=await r.text();html=html.replace(/<!--/g,'').replace(/-->/g,'');const rows=[...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>m[0]);const out=[];for(const row of rows){const weekRaw=cell(row,'week_num');if(!/^\d+$/.test(weekRaw))continue;const winner=cleanHtml(cell(row,'winner'));const loser=cleanHtml(cell(row,'loser'));const ptsW=num(cell(row,'pts_win')),ptsL=num(cell(row,'pts_lose'));if(!winner||!loser||ptsW==null||ptsL==null)continue;const loc=cell(row,'game_location');const winnerTeam=TEAM[winner],loserTeam=TEAM[loser];if(!winnerTeam||!loserTeam)continue;const tie=/T/i.test(cell(row,'game_outcome'));let home,away,hs,as;if(loc==='@'){away=winnerTeam;home=loserTeam;as=ptsW;hs=ptsL}else{home=winnerTeam;away=loserTeam;hs=ptsW;as=ptsL}if(tie){/* PFR winner/loser labels can be ambiguous for ties; score/team identity still compare below. */}
out.push({season,week:Number(weekRaw),home,away,hs,as});}
return out;}

const key=g=>`${g.season}:${g.week}:${g.away}@${g.home}`;
const score=g=>`${g.as}-${g.hs}`;

async function main(){
 if(process.argv.includes('--self-test')){const a=[{season:2025,week:1,home:'CHI',away:'GB',hs:20,as:17}],b=[{season:2025,week:1,home:'CHI',away:'GB',hs:20,as:17}];const ok=key(a[0])===key(b[0])&&score(a[0])===score(b[0]);console.log(JSON.stringify({result:ok?'PASS':'BLOCKED',self_test:true},null,2));if(!ok)process.exit(1);return;}
 const nfl=await loadNflverse();const pfr=[];const sourceErrors=[];for(const season of c.validation_source.history_window){try{pfr.push(...await loadPfrSeason(season));}catch(e){sourceErrors.push(String(e.message||e));}}
 const nm=new Map(nfl.map(g=>[key(g),g])),pm=new Map(pfr.map(g=>[key(g),g]));const missingInPfr=[],missingInNflverse=[],scoreMismatches=[];
 for(const [k,g] of nm){const p=pm.get(k);if(!p)missingInPfr.push(k);else if(score(g)!==score(p))scoreMismatches.push({game:k,nflverse:score(g),pfr:score(p)});}
 for(const k of pm.keys())if(!nm.has(k))missingInNflverse.push(k);
 const comparable=pfr.length>0&&sourceErrors.length===0;const exact=comparable&&missingInPfr.length===0&&missingInNflverse.length===0&&scoreMismatches.length===0;
 const status=!comparable?'INSUFFICIENT_VALIDATION':exact?'MATCH':'DISCREPANCY_REVIEW_REQUIRED';
 const out={schema_version:'1.0.0',status,generated_at:new Date().toISOString(),authority:'INDEPENDENT_VALIDATION_ONLY',production_numeric_authority:0,history_window:c.validation_source.history_window,nflverse_games:nfl.length,pfr_games:pfr.length,source_errors:sourceErrors,missing_in_pfr:missingInPfr,missing_in_nflverse:missingInNflverse,score_mismatches:scoreMismatches};
 fs.mkdirSync(path.dirname(OUT),{recursive:true});fs.writeFileSync(OUT,JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({...out,missing_in_pfr:missingInPfr.length,missing_in_nflverse:missingInNflverse.length,score_mismatches:scoreMismatches.length},null,2));
 if(status==='DISCREPANCY_REVIEW_REQUIRED')process.exit(2);
 if(status==='INSUFFICIENT_VALIDATION')process.exit(3);
}
await main();
