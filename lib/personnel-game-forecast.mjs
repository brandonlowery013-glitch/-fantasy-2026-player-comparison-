import {teamFeatures} from './personnel-inputs.mjs';
import {predict,explainContributions} from './personnel-matchup.mjs';
import {quarterbackStatus} from './qb-receiver-projections.mjs';
export function buildPersonnelGame({gameId,game,event,inputs,availability,quarterbacks,model,now=Date.now()}){
 const kickoff=event.event_start,baseline=game.model;if(!baseline||!Number.isFinite(baseline.home_minus_away_margin)||!Number.isFinite(baseline.model_total))throw Error('Missing scoring baseline');
 const contexts={};
 for(const [side,team,opp] of [['home',event.home_team,event.away_team],['away',event.away_team,event.home_team]]){
  const q=Object.values(quarterbacks.scenarios||{}).find(q=>q.game_id===gameId&&q.team===team&&q.event_id===event.event_id&&Date.parse(q.kickoff)===Date.parse(kickoff));
  if(!q?.expected_qb||q.status==='REVIEW_REQUIRED')throw Error('Expected QB or replacement is ambiguous for '+team);
  const names=[...new Set([...(availability.injuries||[]).filter(r=>r.team===team).map(r=>r.name),...(availability.games||[]).filter(g=>g.team===team&&String(g.event_id)===String(event.event_id)).flatMap(g=>g.inactive_names||[])])];
  const absent=names.filter(name=>quarterbackStatus({name,team,injury_reports:[]},availability,event,now).out);
  contexts[side]={team,...teamFeatures(inputs,team,opp,q.expected_qb,absent),qb_scenario:{status:q.status,starter:q.starter,expected_qb:q.expected_qb,report:q.report}};
 }
 const x=[baseline.home_minus_away_margin,...contexts.home.features.map((v,i)=>v-contexts.away.features[i])],raw=predict(model.model,x),total=baseline.model_total,margin=Math.max(-total,Math.min(total,raw));
 return {game_id:gameId,home_team:event.home_team,away_team:event.away_team,kickoff,status:'EXPERIMENTAL_CONDITIONAL',simulation:false,home_score_mean:(total+margin)/2,away_score_mean:(total-margin)/2,margin,model_home_spread:-margin,baseline_home_margin:baseline.home_minus_away_margin,margin_change:margin-baseline.home_minus_away_margin,total_unchanged:true,score_domain_clipped:raw!==margin,contexts,contributions:explainContributions(model.model,x,baseline.home_minus_away_margin),model_version:model.version,actionable:false};
}
