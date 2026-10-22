import {evaluateRevisedQuote,quarterbackStatus} from './lib/qb-receiver-projections.mjs';
const statKey=s=>({passing_yards:'pass_yards',passing_tds:'pass_tds',passing_attempts:'pass_attempts',rushing_yards:'rush_yards'}[s]||s);
export function applyLiveQBFeed({projection,distribution,feed,availability,now=Date.now()}){
 const holds=new Set();if(availability&&now-Date.parse(availability.observed_at)<=30*60000)for(const s of Object.values(feed?.scenarios||{})){
  const report=quarterbackStatus({name:s.starter,athlete_id:s.starter_id,team:s.team,injury_reports:[]},availability,{event_id:s.event_id,event_start:s.kickoff},now);
  if(report.out&&s.status!=='BACKUP_EXPECTED'&&Date.parse(s.kickoff)>now)holds.add(s.game_id+':'+s.team);
 }
 const sameRevision=!!feed?.revision_id&&projection?.quarterback_revision_id===feed.revision_id&&distribution?.quarterback_revision_id===feed.revision_id;
 const age=now-Date.parse(feed?.checked_at||feed?.simulated_at),valid=!!feed&&feed.season===2026&&feed.sportsbook_inputs_used===false&&feed.model_version==='qb-receiver-effects-2026-v1'&&Number(feed.week)===Number(projection?.week)&&Number(feed.week)===Number(distribution?.week)&&age>=-300000&&age<=30*60000&&(sameRevision||feed.base_generated_at===projection?.generated_at&&feed.distribution_generated_at===distribution?.generated_at)&&feed.health?.status!=='STALE';
 if(!valid)return {valid:false,projection,distribution,feed,holds};
 if(sameRevision&&!feed.simulation)return {valid:true,feed,projection,distribution,holds};
 return {valid:true,feed,holds,projection:{...projection,players:{...projection.players,...feed.players}},distribution:{...distribution,distributions:{...distribution.distributions,...feed.distributions}}};
}
export function liveQBQuote(snapshot,existing,state){
 if(state?.holds?.has(snapshot.game_id+':'+snapshot.team))return null;
 const scenario=Object.values(state?.feed?.scenarios||{}).find(s=>s.game_id===snapshot.game_id&&s.team===snapshot.team);
 const restored=state?.feed?.players?.[snapshot.player]?.qb_restored;
 const obsolete=state?.projection?.players?.[snapshot.player]?.qb_scenario?.expected_qb&&state.projection.players[snapshot.player].qb_scenario.expected_qb!==scenario?.expected_qb;
 if(!scenario||!restored&&!obsolete&&!['BACKUP_EXPECTED','REVIEW_REQUIRED'].includes(scenario.status))return existing;
 if(!state.valid||scenario.status==='REVIEW_REQUIRED')return null;
 const p=state.projection.players[snapshot.player],spec=state.distribution.distributions[snapshot.player]?.distributions?.[statKey(snapshot.stat)];
 if(p?.status==='UNAVAILABLE'||spec?.status!=='SHADOW_ONLY')return null;
 return evaluateRevisedQuote(snapshot,spec,{...scenario,restored:restored||false,updated_at:state.feed.changed_at||state.feed.simulated_at,revision_id:state.feed.revision_id||state.feed.base_revision_id,simulation:state.feed.simulation||false});
}
