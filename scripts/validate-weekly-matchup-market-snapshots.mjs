import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const inputPath='data/market/weekly-matchup-market-snapshots-2026.json';
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const finite=x=>Number.isFinite(Number(x));
const validAmerican=x=>Number.isInteger(Number(x))&&Math.abs(Number(x))>=100;
const validKind=new Set(['EARLY','OPEN','CURRENT','PREDICTION_TIME','CLOSE']);
function selfTest(){return {schema_version:'self-test',season:2026,status:'SELF_TEST',market_context_only:true,probability_fit_input:false,games:{'2026-W1-AAA-BBB':{week:1,away_team:'AAA',home_team:'BBB',kickoff:'2026-09-10T19:20:00-05:00',snapshots:[
  {snapshot_id:'s1',snapshot_kind:'EARLY',book:'SELF_TEST_BOOK',captured_at:'2026-08-25T13:30:00-05:00',source:'self-test',home_spread:-2.5,home_spread_price:-110,away_spread_price:-110,total:47.5,over_price:-110,under_price:-110,home_moneyline:-135,away_moneyline:115},
  {snapshot_id:'s2',snapshot_kind:'CURRENT',book:'SELF_TEST_BOOK',captured_at:'2026-09-08T12:00:00-05:00',source:'self-test',home_spread:-3.5,home_spread_price:-105,away_spread_price:-115,total:46.5,over_price:-108,under_price:-112,home_moneyline:-155,away_moneyline:130},
  {snapshot_id:'s3',snapshot_kind:'PREDICTION_TIME',book:'SELF_TEST_BOOK',captured_at:'2026-09-10T10:00:00-05:00',source:'self-test',home_spread:-3,home_spread_price:-110,away_spread_price:-110,total:46,over_price:-110,under_price:-110}
]}}};}
const src=process.argv.includes('--self-test')?selfTest():read(inputPath),blocked=[];let games=0,snapshots=0,moneylines=0;
if(src.season!==2026)blocked.push('season must be 2026');
if(src.market_context_only!==true)blocked.push('market_context_only must be true');
if(src.probability_fit_input!==false)blocked.push('probability_fit_input must be false');
const ids=new Set();
for(const [gameId,g] of Object.entries(src.games||{})){
  games++;
  if(!Number.isInteger(Number(g.week))||Number(g.week)<1||Number(g.week)>18)blocked.push(`${gameId} invalid week`);
  if(!g.away_team||!g.home_team||g.away_team===g.home_team)blocked.push(`${gameId} invalid teams`);
  if(!g.kickoff||Number.isNaN(Date.parse(g.kickoff)))blocked.push(`${gameId} invalid kickoff`);
  let priorTime=-Infinity;const bookTime=new Set();
  for(const s of g.snapshots||[]){
    snapshots++;
    if(!s.snapshot_id||ids.has(s.snapshot_id))blocked.push(`${gameId} duplicate/missing snapshot_id ${s.snapshot_id||''}`);else ids.add(s.snapshot_id);
    if(!validKind.has(s.snapshot_kind))blocked.push(`${gameId} ${s.snapshot_id} invalid snapshot_kind`);
    if(!s.book||!s.source)blocked.push(`${gameId} ${s.snapshot_id} missing book/source`);
    const t=Date.parse(s.captured_at);if(Number.isNaN(t))blocked.push(`${gameId} ${s.snapshot_id} invalid captured_at`);else if(t<priorTime)blocked.push(`${gameId} snapshots not chronological`);else priorTime=t;
    const bt=`${s.book}|${s.captured_at}`;if(bookTime.has(bt))blocked.push(`${gameId} duplicate same-book timestamp ${bt}`);bookTime.add(bt);
    if(!finite(s.home_spread)||!validAmerican(s.home_spread_price)||!validAmerican(s.away_spread_price))blocked.push(`${gameId} ${s.snapshot_id} invalid spread market`);
    if(!finite(s.total)||Number(s.total)<=0||!validAmerican(s.over_price)||!validAmerican(s.under_price))blocked.push(`${gameId} ${s.snapshot_id} invalid total market`);
    const hasHome=s.home_moneyline!=null,hasAway=s.away_moneyline!=null;
    if(hasHome!==hasAway)blocked.push(`${gameId} ${s.snapshot_id} incomplete moneyline pair`);
    if(hasHome&&hasAway){moneylines++;if(!validAmerican(s.home_moneyline)||!validAmerican(s.away_moneyline))blocked.push(`${gameId} ${s.snapshot_id} invalid moneyline market`);}
    if(g.kickoff&&!Number.isNaN(Date.parse(g.kickoff))&&!Number.isNaN(t)&&t>Date.parse(g.kickoff)&&s.snapshot_kind!=='CLOSE')blocked.push(`${gameId} ${s.snapshot_id} post-kickoff snapshot must be CLOSE`);
  }
}
if(process.argv.includes('--self-test')&&(games!==1||snapshots!==3||moneylines!==2))blocked.push('self-test fixture count failure');
fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});
const report={generated_at:new Date().toISOString(),result:blocked.length?'BLOCKED':'PASS',season:2026,games,snapshots,moneyline_snapshots:moneylines,market_context_only:true,probability_fit_input:false,blocked,safeguards:[
  'Spread, total and optional two-way moneyline snapshots are market context and are prohibited as football probability-fit inputs.',
  'Each sportsbook snapshot preserves timestamp, line and both sides of available pricing.',
  'Snapshots are append-only by unique snapshot_id; same-book/game/timestamp duplicates are blocked.',
  'EARLY/OPEN/CURRENT/PREDICTION_TIME/CLOSE labels preserve line movement rather than overwriting history.',
  'Closing snapshots are stored for CLV/backtest evaluation, not retroactively substituted for the line available at prediction time.'
]};
fs.writeFileSync(path.join(root,'guardrails/weekly-matchup-market-snapshot-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);
