import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const validKinds=new Set(['EARLY','OPEN','CURRENT','PREDICTION_TIME','CLOSE']);
const validHorizons=new Set(['SEASON','WEEKLY']);
const validStats=new Set(['passing_yards','passing_tds','rushing_yards','rushing_tds','receiving_yards','receiving_tds','receptions']);
const american=x=>Number.isInteger(Number(x))&&Math.abs(Number(x))>=100;
function fixture(){return {schema_version:'self-test',season:2026,market_context_only:true,probability_fit_input:false,snapshots:[
{snapshot_id:'w1',horizon:'WEEKLY',week:1,player:'SELF TEST',position:'WR',stat:'receiving_yards',line:74.5,over_price:-110,under_price:-110,book:'BOOK',captured_at:'2026-09-08T12:00:00Z',snapshot_kind:'CURRENT',source:'self-test'},
{snapshot_id:'s1',horizon:'SEASON',player:'SELF TEST',position:'WR',stat:'receiving_yards',line:1049.5,over_price:-115,under_price:-105,book:'BOOK',captured_at:'2026-08-24T12:00:00Z',snapshot_kind:'CURRENT',source:'self-test'}]};}
const src=process.argv.includes('--self-test')?fixture():read('data/market/player-prop-market-snapshots-2026.json');
const blocked=[],ids=new Set();let weekly=0,season=0;
if(src.season!==2026)blocked.push('season must be 2026');
if(src.market_context_only!==true)blocked.push('market_context_only must be true');
if(src.probability_fit_input!==false)blocked.push('probability_fit_input must be false');
for(const s of src.snapshots||[]){
 if(!s.snapshot_id||ids.has(s.snapshot_id))blocked.push(`duplicate/missing snapshot_id ${s.snapshot_id||''}`);else ids.add(s.snapshot_id);
 if(!validHorizons.has(s.horizon))blocked.push(`${s.snapshot_id} invalid horizon`);
 if(!validKinds.has(s.snapshot_kind))blocked.push(`${s.snapshot_id} invalid snapshot_kind`);
 if(!validStats.has(s.stat))blocked.push(`${s.snapshot_id} invalid stat`);
 if(!s.player||!s.position||!s.book||!s.source)blocked.push(`${s.snapshot_id} missing identity/source`);
 if(!Number.isFinite(Number(s.line))||Number(s.line)<0)blocked.push(`${s.snapshot_id} invalid line`);
 if(!american(s.over_price)||!american(s.under_price))blocked.push(`${s.snapshot_id} invalid two-sided prices`);
 if(Number.isNaN(Date.parse(s.captured_at)))blocked.push(`${s.snapshot_id} invalid captured_at`);
 if(s.horizon==='WEEKLY'){weekly++;if(!Number.isInteger(Number(s.week))||Number(s.week)<1||Number(s.week)>18)blocked.push(`${s.snapshot_id} invalid weekly week`);}else {season++;if(s.week!=null)blocked.push(`${s.snapshot_id} season snapshot must not set week`);}
}
if(process.argv.includes('--self-test')&&(weekly!==1||season!==1))blocked.push('self-test horizon coverage failure');
fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});
const report={generated_at:new Date().toISOString(),result:blocked.length?'BLOCKED':'PASS',snapshots:(src.snapshots||[]).length,weekly,season,market_context_only:true,probability_fit_input:false,blocked,safeguards:['Snapshots preserve player/stat/line/book/time and both sides of pricing.','Market snapshots cannot be probability-fit inputs.','Weekly and season horizons are explicit and cannot be silently mixed.','CLOSE is retained for evaluation rather than substituted for an earlier recommendation price.']};
fs.writeFileSync(path.join(root,'guardrails/player-prop-market-snapshot-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(blocked.length)process.exit(1);
