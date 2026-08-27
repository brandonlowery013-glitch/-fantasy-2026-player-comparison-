import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>fs.writeFileSync(path.join(root,p),JSON.stringify(x,null,2)+'\n');
const finite=x=>Number.isFinite(Number(x));
const canonical=x=>JSON.stringify(x,Object.keys(x).sort());
const hash=x=>crypto.createHash('sha256').update(x).digest('hex').slice(0,24);
const parseTime=x=>{const t=Date.parse(x);return Number.isFinite(t)?t:null;};

export function forecastId({season,week,player,stat,event_start}){
  return `F-${hash([season,week,player,stat,event_start].join('|'))}`;
}

function frozenModelShape(row){
  return {
    forecast_id:row.forecast_id,season:row.season,week:row.week,player:row.player,position:row.position,stat:row.stat,event_start:row.event_start,
    distribution_family:row.distribution_family,mean:row.mean,sd:row.sd,parameters:row.parameters,probability_source_generated_at:row.probability_source_generated_at
  };
}

function sameFrozenModel(a,b){return canonical(frozenModelShape(a))===canonical(frozenModelShape(b));}

export function captureForecasts({distributions,schedule,ledger,nowIso}){
  const blocked=[],skipped=[],added=[];
  const now=parseTime(nowIso);if(now==null)throw new Error('nowIso must be a valid timestamp');
  const games=Object.entries(schedule.games||{});
  const playerGames=new Map();
  for(const [gameId,g] of games){
    const start=parseTime(g.event_start||g.kickoff);
    if(start==null){blocked.push(`${gameId} missing valid event_start`);continue;}
    if(g.verified!==true){skipped.push(`${gameId} event start not verified`);continue;}
    for(const player of g.players||[]){if(!playerGames.has(player))playerGames.set(player,[]);playerGames.get(player).push({gameId,start,event_start:new Date(start).toISOString()});}
  }
  const existing=new Map();
  for(const row of ledger.forecasts||[]){
    if(existing.has(row.forecast_id))blocked.push(`duplicate existing forecast_id ${row.forecast_id}`);
    existing.set(row.forecast_id,row);
  }
  const week=Number(distributions.week),season=Number(distributions.season);
  for(const [player,p] of Object.entries(distributions.distributions||{})){
    const matches=playerGames.get(player)||[];
    if(matches.length===0){skipped.push(`${player} missing verified event mapping`);continue;}
    if(matches.length>1){blocked.push(`${player} mapped to multiple verified games`);continue;}
    const game=matches[0];
    if(now>=game.start){skipped.push(`${player} kickoff already reached`);continue;}
    for(const [stat,spec] of Object.entries(p.distributions||{})){
      if(spec?.status!=='SHADOW_ONLY'){skipped.push(`${player} ${stat} not deployable shadow distribution`);continue;}
      if(!finite(spec.mean)||!finite(spec.sd)||Number(spec.sd)<=0){blocked.push(`${player} ${stat} invalid mean/sd`);continue;}
      const row={
        forecast_id:forecastId({season,week,player,stat,event_start:game.event_start}),season,week,game_id:game.gameId,player,position:p.position,stat,event_start:game.event_start,
        distribution_family:spec.family,mean:Number(spec.mean),sd:Number(spec.sd),parameters:spec.parameters??null,probability_source_generated_at:distributions.generated_at||null,
        captured_at:new Date(now).toISOString(),frozen:true,split:'HOLDOUT',source:'weekly-probability-distributions-2026.json'
      };
      const old=existing.get(row.forecast_id);
      if(old){if(!sameFrozenModel(old,row))blocked.push(`${row.forecast_id} attempted frozen forecast rewrite`);continue;}
      existing.set(row.forecast_id,row);added.push(row);
    }
  }
  return {blocked,skipped,added,ledger:{...ledger,status:added.length?'CAPTURED':'NO_NEW_FORECASTS',forecasts:[...(ledger.forecasts||[]),...added]}};
}

function selfTest(){
  const distributions={season:2026,week:1,generated_at:'2026-09-09T12:00:00Z',distributions:{
    'Test Player':{position:'WR',distributions:{receiving_yards:{status:'SHADOW_ONLY',family:'normal',mean:71,sd:24,parameters:{mu:71,sigma:24}},receiving_tds:{status:'REVIEW_REQUIRED'}}}
  }};
  const schedule={games:{G1:{event_start:'2026-09-10T20:00:00Z',verified:true,players:['Test Player']}}};
  const empty={schema_version:'1.0.0',season:2026,status:'AWAITING_WEEKLY_FORECASTS',forecasts:[]};
  const first=captureForecasts({distributions,schedule,ledger:empty,nowIso:'2026-09-10T12:00:00Z'});
  const second=captureForecasts({distributions,schedule,ledger:first.ledger,nowIso:'2026-09-10T13:00:00Z'});
  const changed=structuredClone(distributions);changed.distributions['Test Player'].distributions.receiving_yards.mean=80;
  const rewrite=captureForecasts({distributions:changed,schedule,ledger:first.ledger,nowIso:'2026-09-10T13:00:00Z'});
  const late=captureForecasts({distributions,schedule,ledger:empty,nowIso:'2026-09-10T20:00:00Z'});
  const failures=[];
  if(first.blocked.length||first.added.length!==1)failures.push('first valid capture should add exactly one row');
  if(second.blocked.length||second.added.length!==0||second.ledger.forecasts.length!==1)failures.push('repeat capture must be idempotent');
  if(!rewrite.blocked.some(x=>x.includes('rewrite')))failures.push('changed frozen forecast must block');
  if(late.added.length!==0)failures.push('at/post-kickoff capture must add nothing');
  if(first.added[0]?.split!=='HOLDOUT'||first.added[0]?.frozen!==true)failures.push('captured row must be frozen HOLDOUT');
  return {result:failures.length?'BLOCKED':'PASS',tests:5,failed:failures.length,failures};
}

if(process.argv.includes('--self-test')){
  const report={generated_at:new Date().toISOString(),...selfTest()};fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});write('guardrails/weekly-forecast-capture-test-report.json',report);console.log(JSON.stringify(report,null,2));if(report.failed)process.exit(1);
}else{
  const distributions=read('data/probability/generated/weekly-probability-distributions-2026.json'),schedule=read('data/calibration/weekly-event-schedule-2026.json'),ledger=read('data/calibration/weekly-forecast-capture-2026.json');
  const nowIso=process.env.CAPTURE_NOW||new Date().toISOString();const result=captureForecasts({distributions,schedule,ledger,nowIso});
  fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});write('data/calibration/weekly-forecast-capture-2026.json',result.ledger);
  const report={generated_at:new Date().toISOString(),result:result.blocked.length?'BLOCKED':'PASS',added:result.added.length,total_forecasts:result.ledger.forecasts.length,blocked:result.blocked,skipped:result.skipped};write('guardrails/weekly-forecast-capture-report.json',report);console.log(JSON.stringify(report,null,2));if(result.blocked.length)process.exit(1);
}
