import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),JSON.stringify(x,null,2)+'\n');};
const finite=x=>Number.isFinite(Number(x));
const round=(x,d=6)=>Number(Number(x).toFixed(d));
const parseTime=x=>{const t=Date.parse(String(x||''));return Number.isFinite(t)?t:null;};
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex').slice(0,24);
const nval=x=>{const s=String(x??'').replace(/,/g,'').trim();const n=Number(s);return Number.isFinite(n)?n:null;};

const LABEL_MAP={
  passing:{YDS:'pass_yards',TD:'pass_tds'},
  rushing:{YDS:'rush_yards',TD:'rush_tds'},
  receiving:{REC:'receptions',YDS:'receiving_yards',TD:'receiving_tds',TGTS:'targets'}
};

export function parseFinalBoxscore(summary){
  const status=summary?.header?.competitions?.[0]?.status?.type||{};
  const final=status.completed===true||String(status.name||'').toUpperCase()==='STATUS_FINAL';
  const players=new Map();
  for(const team of summary?.boxscore?.players||[]){
    for(const group of team.statistics||[]){
      const groupName=String(group.name||'').toLowerCase();
      const mapping=LABEL_MAP[groupName];if(!mapping)continue;
      const labels=(group.labels||[]).map(x=>String(x).toUpperCase());
      for(const row of group.athletes||[]){
        const name=row?.athlete?.displayName||row?.athlete?.shortName;if(!name)continue;
        const key=norm(name);if(!players.has(key))players.set(key,{name,stats:{},groups:new Set()});
        const p=players.get(key);p.groups.add(groupName);
        const values=row.stats||[];
        for(let i=0;i<labels.length;i++){
          const stat=mapping[labels[i]];if(!stat)continue;
          const v=nval(values[i]);if(v!=null)p.stats[stat]=v;
        }
      }
    }
  }
  return {final,status_name:status.name||null,players};
}

function latestSettlements(ledger){
  const map=new Map();
  for(const s of ledger.settlements||[]){
    const id=String(s.forecast_id||'');if(!id)continue;
    const old=map.get(id);if(!old||Number(s.revision||0)>Number(old.revision||0))map.set(id,s);
  }
  return map;
}

export function settleFromSummaries({forecasts,schedule,ledger,summaries,nowIso}){
  const blocked=[],skipped=[],added=[];const now=parseTime(nowIso);if(now==null)throw new Error('nowIso invalid');
  const latest=latestSettlements(ledger),allByForecast=new Map();
  for(const s of ledger.settlements||[]){if(!allByForecast.has(s.forecast_id))allByForecast.set(s.forecast_id,[]);allByForecast.get(s.forecast_id).push(s);}
  for(const f of forecasts.forecasts||[]){
    if(f.frozen!==true||String(f.split||'').toUpperCase()!=='HOLDOUT'){blocked.push(`${f.forecast_id||'MISSING'} forecast must remain frozen HOLDOUT`);continue;}
    if(!finite(f.mean)||!finite(f.sd)||Number(f.sd)<=0){blocked.push(`${f.forecast_id} invalid frozen mean/sd`);continue;}
    const game=schedule.games?.[f.game_id];if(!game){skipped.push(`${f.forecast_id} missing schedule game ${f.game_id}`);continue;}
    const eventId=String(game.event_id||'');if(!eventId){skipped.push(`${f.forecast_id} missing source event_id`);continue;}
    const parsed=summaries.get(eventId);if(!parsed){skipped.push(`${f.forecast_id} no postgame summary available`);continue;}
    if(!parsed.final){skipped.push(`${f.forecast_id} game not final`);continue;}
    const player=parsed.players.get(norm(f.player));if(!player){skipped.push(`${f.forecast_id} player absent from final stat tables; no zero assumed`);continue;}
    if(!Object.prototype.hasOwnProperty.call(player.stats,f.stat)){skipped.push(`${f.forecast_id} ${f.player} ${f.stat} absent from final stat row; no zero assumed`);continue;}
    const actual=Number(player.stats[f.stat]);if(!finite(actual)){blocked.push(`${f.forecast_id} non-finite final result`);continue;}
    const old=latest.get(f.forecast_id);if(old&&Number(old.actual)===actual&&String(old.source_event_id)===eventId)continue;
    const revisions=allByForecast.get(f.forecast_id)||[],revision=revisions.reduce((m,x)=>Math.max(m,Number(x.revision||0)),0)+1;
    const row={settlement_id:`S-${hash(`${f.forecast_id}|${revision}|${actual}|${eventId}`)}`,forecast_id:f.forecast_id,revision,season:f.season,week:f.week,game_id:f.game_id,player:f.player,position:f.position,stat:f.stat,event_start:f.event_start,actual,settled_at:new Date(now).toISOString(),verified_final:true,source:'ESPN public NFL game summary feed',source_event_id:eventId,source_status:parsed.status_name,frozen_forecast_mean:Number(f.mean),frozen_forecast_sd:Number(f.sd),split:'HOLDOUT'};
    added.push(row);latest.set(f.forecast_id,row);if(!allByForecast.has(f.forecast_id))allByForecast.set(f.forecast_id,[]);allByForecast.get(f.forecast_id).push(row);
  }
  return {blocked,skipped,added,ledger:{...ledger,status:added.length?'SETTLEMENTS_APPENDED':(ledger.settlements||[]).length?'CURRENT_NO_NEW_SETTLEMENTS':'AWAITING_FINAL_GAMES',settlements:[...(ledger.settlements||[]),...added]}};
}

function aggregate(rows){
  const n=rows.length;if(!n)return null;
  let ae=0,se=0,e=0,c1=0,c2=0,az=0;
  for(const r of rows){const err=Number(r.actual)-Number(r.mean),z=err/Number(r.sd);ae+=Math.abs(err);se+=err*err;e+=err;c1+=Math.abs(z)<=1?1:0;c2+=Math.abs(z)<=2?1:0;az+=Math.abs(z);}
  return {n,mae:round(ae/n),rmse:round(Math.sqrt(se/n)),bias:round(e/n),coverage_1sd:round(c1/n),coverage_2sd:round(c2/n),mean_abs_z:round(az/n)};
}

export function scoreForecasts(forecasts,ledger,nowIso){
  const forecastMap=new Map((forecasts.forecasts||[]).map(f=>[f.forecast_id,f])),latest=latestSettlements(ledger),blocked=[],rows=[];
  for(const [id,s] of latest){
    const f=forecastMap.get(id);if(!f){blocked.push(`settlement without forecast ${id}`);continue;}
    if(s.verified_final!==true||!finite(s.actual)){blocked.push(`${id} invalid verified result`);continue;}
    if(!finite(f.mean)||!finite(f.sd)||Number(f.sd)<=0){blocked.push(`${id} invalid forecast mean/sd`);continue;}
    rows.push({forecast_id:id,player:f.player,position:f.position,stat:f.stat,week:f.week,mean:Number(f.mean),sd:Number(f.sd),actual:Number(s.actual),revision:Number(s.revision||1)});
  }
  const group=key=>{const m=new Map();for(const r of rows){const k=r[key]||'UNKNOWN';if(!m.has(k))m.set(k,[]);m.get(k).push(r);}return Object.fromEntries([...m].sort().map(([k,v])=>[k,aggregate(v)]));};
  return {schema_version:'1.0.0',season:2026,generated_at:nowIso,status:blocked.length?'BLOCKED':rows.length?'SHADOW_CALIBRATION_AVAILABLE':'AWAITING_SETTLED_FORECASTS',mode:'SHADOW_ONLY',actionable:false,settled_forecasts:rows.length,metrics:aggregate(rows),by_stat:group('stat'),by_position:group('position'),sportsbook_inputs_used:false,same_sample_tuning_allowed:false,blocked};
}

async function fetchSummary(eventId,template){
  const url=template.replace('{event_id}',encodeURIComponent(eventId));
  const r=await fetch(url,{headers:{'user-agent':'fantasy-2026-postgame-settlement'}});if(!r.ok)throw new Error(`postgame summary fetch ${eventId} failed ${r.status}`);
  return parseFinalBoxscore(await r.json());
}

function syntheticSummary(yards=84,completed=true){return {header:{competitions:[{status:{type:{name:completed?'STATUS_FINAL':'STATUS_IN_PROGRESS',completed}}}]},boxscore:{players:[{statistics:[{name:'receiving',labels:['REC','YDS','AVG','TD','LONG','TGTS'],athletes:[{athlete:{displayName:'Test Receiver'},stats:['6',String(yards),'14.0','1','25','8']}]}]}]}};}

async function selfTest(){
  const forecasts={forecasts:[
    {forecast_id:'F1',season:2026,week:1,game_id:'G1',player:'Test Receiver',position:'WR',stat:'receiving_yards',event_start:'2026-09-10T20:00:00Z',mean:70,sd:20,frozen:true,split:'HOLDOUT'},
    {forecast_id:'F2',season:2026,week:1,game_id:'G1',player:'Test Receiver',position:'WR',stat:'receptions',event_start:'2026-09-10T20:00:00Z',mean:5,sd:2,frozen:true,split:'HOLDOUT'}
  ]},schedule={games:{G1:{event_id:'123'}}},empty={schema_version:'1.0.0',season:2026,status:'AWAITING_FINAL_GAMES',settlements:[]},now='2026-09-11T02:00:00Z',failures=[];
  const summaries=new Map([['123',parseFinalBoxscore(syntheticSummary())]]),first=settleFromSummaries({forecasts,schedule,ledger:empty,summaries,nowIso:now});
  if(first.blocked.length||first.added.length!==2)failures.push('final boxscore should settle two forecasts');
  const repeat=settleFromSummaries({forecasts,schedule,ledger:first.ledger,summaries,nowIso:'2026-09-11T03:00:00Z'});if(repeat.added.length!==0)failures.push('repeat final summary must be idempotent');
  const corrected=new Map([['123',parseFinalBoxscore(syntheticSummary(85,true))]]),revision=settleFromSummaries({forecasts,schedule,ledger:first.ledger,summaries:corrected,nowIso:'2026-09-11T04:00:00Z'});if(revision.added.length!==1||revision.added[0].revision!==2)failures.push('official stat correction must append revision 2');
  const nonfinal=new Map([['123',parseFinalBoxscore(syntheticSummary(84,false))]]),late=settleFromSummaries({forecasts,schedule,ledger:empty,summaries:nonfinal,nowIso:now});if(late.added.length!==0)failures.push('non-final game must not settle');
  const score=scoreForecasts(forecasts,revision.ledger,'2026-09-11T04:00:00Z');if(score.settled_forecasts!==2||score.blocked.length)failures.push('latest verified revisions must score exactly two forecasts');
  if(score.by_stat.receiving_yards?.n!==1||Math.abs(score.by_stat.receiving_yards.mae-15)>1e-9)failures.push('calibration must use corrected receiving-yards result');
  const report={generated_at:new Date().toISOString(),result:failures.length?'BLOCKED':'PASS',tests:6,failed:failures.length,failures,settled:first.added.length,revision_rows:revision.added.length,scored:score.settled_forecasts};
  write('guardrails/postgame-forecast-settlement-test-report.json',report);console.log(JSON.stringify(report,null,2));if(failures.length)process.exit(1);
}

async function main(){
  if(process.argv.includes('--self-test'))return selfTest();
  const contract=read('data/sources/postgame-forecast-settlement-2026.json'),forecasts=read(contract.forecast_source),schedule=read(contract.schedule_source),ledger=read(contract.result_ledger),nowIso=process.env.SETTLE_NOW||new Date().toISOString(),now=parseTime(nowIso);if(now==null)throw new Error('SETTLE_NOW invalid');
  const latest=latestSettlements(ledger),eventIds=new Set();
  for(const f of forecasts.forecasts||[]){const g=schedule.games?.[f.game_id],eventId=String(g?.event_id||'');if(!eventId)continue;const start=parseTime(f.event_start);if(start==null||start>now)continue;const old=latest.get(f.forecast_id),withinCorrectionWindow=now-start<=7*24*3600*1000;if(!old||withinCorrectionWindow)eventIds.add(eventId);}
  const summaries=new Map(),fetchErrors=[];
  for(const eventId of eventIds){try{summaries.set(eventId,await fetchSummary(eventId,contract.result_source.url_template));}catch(e){fetchErrors.push(String(e.message||e));}}
  const result=settleFromSummaries({forecasts,schedule,ledger,summaries,nowIso}),blocked=[...result.blocked,...fetchErrors];write(contract.result_ledger,result.ledger);
  const calibration=scoreForecasts(forecasts,result.ledger,nowIso);calibration.blocked=[...calibration.blocked,...fetchErrors];if(calibration.blocked.length)calibration.status='BLOCKED';write(contract.calibration_output,calibration);
  const report={generated_at:nowIso,result:blocked.length||calibration.blocked.length?'BLOCKED':'PASS',events_checked:eventIds.size,settlements_added:result.added.length,total_settlement_rows:result.ledger.settlements.length,latest_scored_forecasts:calibration.settled_forecasts,blocked:[...new Set([...blocked,...calibration.blocked])],skipped:result.skipped};write('guardrails/postgame-forecast-settlement-report.json',report);console.log(JSON.stringify(report,null,2));if(report.blocked.length)process.exit(1);
}

main().catch(e=>{console.error(e);process.exit(1);});
