import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),JSON.stringify(x,null,2)+'\n');};
const contextPath='data/probability/weekly-football-context-inputs-2026.json';
const schedulePath='data/calibration/weekly-event-schedule-2026.json';
const context=read(contextPath);
const schedule=read(schedulePath);

if(context.sportsbook_inputs_used!==false) throw new Error('weekly context must remain sportsbook-free');
if(schedule.sportsbook_inputs_used!==false) throw new Error('schedule must remain sportsbook-free');

const existing=Object.keys(context.players||{}).length;
if(existing>0){
  console.log(JSON.stringify({result:'PASS',mode:'LIVE_CONTEXT_PRESENT',players:existing,seeded:0,sportsbook_inputs_used:false},null,2));
  process.exit(0);
}

const live=[];
for(let i=0;i<13;i++) live.push(...read(`players${i}.json`));
if(live.length!==162) throw new Error(`authoritative player universe changed: ${live.length}`);
const byName=new Map(live.map(p=>[p.n,{name:p.n,position:String(p.p||'').toUpperCase()}]));
const scheduledNames=new Set(Object.values(schedule.games||{}).flatMap(g=>g.players||[]));
const players={};
for(const name of scheduledNames){
  const p=byName.get(name);
  if(!p) throw new Error(`scheduled player missing from authoritative universe: ${name}`);
  if(!['QB','RB','WR','TE'].includes(p.position)) continue;
  players[p.name]={
    player:p.name,
    position:p.position,
    prior_player:null,
    expected_active:null,
    context_status:'REVIEW_REQUIRED',
    availability_status:'UNRESOLVED',
    signals:{}
  };
}
if(!Object.keys(players).length) throw new Error('no scheduled authoritative players available for baseline fallback');

const out={
  ...context,
  schema_version:'2.3.0',
  season:2026,
  week:Number(schedule.week),
  status:'BASELINE_ONLY_AVAILABILITY_UNRESOLVED',
  generated_at:new Date().toISOString(),
  sportsbook_inputs_used:false,
  players
};
write(contextPath,out);
write('guardrails/weekly-baseline-context-fallback-report.json',{
  generated_at:out.generated_at,
  result:'PASS',
  mode:'SHADOW_ONLY',
  actionable:false,
  week:out.week,
  scheduled_players:Object.keys(players).length,
  expected_active_inferred:false,
  sportsbook_inputs_used:false,
  safeguards:[
    'This fallback is used only when normalized live weekly context contains zero players.',
    'Schedule membership is used only to identify who has a Week 1 game; it does not imply active status.',
    'expected_active remains null and availability_status remains UNRESOLVED.',
    'No role, injury, matchup, team-environment, sportsbook, line or price adjustment is invented.',
    'Generated projections and distributions remain SHADOW_ONLY and cannot become betting recommendations until downstream availability and market gates pass.'
  ]
});
console.log(JSON.stringify({result:'PASS',mode:'BASELINE_ONLY_AVAILABILITY_UNRESOLVED',players:Object.keys(players).length,expected_active_inferred:false,sportsbook_inputs_used:false},null,2));
