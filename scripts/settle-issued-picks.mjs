import fs from 'node:fs';
import {finalResult,settlePicks,historyFeed} from '../lib/pick-settlement.mjs';
import {finalBehavior,appendBehavior,behaviorState,predictionLearning} from '../lib/football-learning.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),save=(p,d)=>{const s=JSON.stringify(d,null,2)+'\n';if(!fs.existsSync(p)||fs.readFileSync(p,'utf8')!==s)fs.writeFileSync(p,s);};
const base='data/market/',history=read(base+'issued-pick-history-2026.json'),schedule=read('data/calibration/weekly-event-schedule-2026.json');
const path=base+'issued-pick-results-2026.json',ledger=fs.existsSync(path)?read(path):{schema_version:'1.0.0',events:{},settlements:[]};
const now=new Date().toISOString(),events={...ledger.events},results={},errors=[],behavior=[];
for(const p of history.records){const g=p.source_event_id?{event_id:p.source_event_id,home_team:p.home_team,away_team:p.away_team}:schedule.games[p.game_id];if(g?.event_id)events[p.game_id]={event_id:String(g.event_id),home_team:g.home_team,away_team:g.away_team};}
// Preserve event IDs through weekly rollover, and fetch each relevant game once.
const settledIds=new Set(ledger.settlements.map(s=>s.record_id));
const due=new Set(history.records.filter(p=>p.decision==='PICK'&&Date.parse(p.kickoff)<Date.now()&&(!settledIds.has(p.record_id)||Date.now()-Date.parse(p.kickoff)<7*86400000)).map(p=>p.game_id));
for(const id of due){
 try{
  if(!events[id])throw Error('Missing event mapping');
  const r=await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${encodeURIComponent(events[id].event_id)}`,{signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error(`Result HTTP ${r.status}`);
  const summary=await r.json(),final=finalResult(summary,events[id]);if(final){results[id]=final;const p=history.records.find(p=>p.game_id===id);behavior.push(...finalBehavior(summary,events[id],{week:p.week,season:p.season,observedAt:now}));}
 }catch(e){errors.push(`${id}: ${e.message}`);}
}
if(errors.length)throw Error(errors.join('\n')); // Keep last verified feed when source fails.
const settled=settlePicks({history,ledger:{...ledger,events},results,now});
const observations=appendBehavior(ledger.football_learning?.observations,behavior);
const regimePath='data/ingestion/nfl-event-ledger-2026.json',regimeEvents=fs.existsSync(regimePath)?read(regimePath).events||[]:[];
settled.football_learning={schema_version:1,numeric_authority:0,observations,state:behaviorState(observations,{season:schedule.season,week:schedule.week,asOf:now,regimeEvents}),regime_events:regimeEvents.filter(e=>Number.isFinite(Date.parse(e.captured_at))&&Date.parse(e.captured_at)<=Date.parse(now)),half_life_games:4,policy:'Dated verified finals; prior weeks only; gradual descriptive learning; no unvalidated score adjustments; corrections append revisions'};
settled.prediction_reason_learning=predictionLearning(history,settled);
save(path,settled);save(base+'betting-history-ui-2026.json',historyFeed(history,settled,events));
console.log(JSON.stringify({games_checked:due.size,settlements:settled.settlements.length,streams:new Set(history.records.map(r=>r.stream_id)).size}));
