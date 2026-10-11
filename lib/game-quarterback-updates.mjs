import {createHash} from 'node:crypto';
import '../runtime-show-work-2026.js';
import {reviseQuarterbackPick} from './quarterback-pick-lifecycle.mjs';
const kinds=['spread','moneyline','total'];

// Production bridge for evidence and revision history. There is deliberately no
// approved QB adjustment version until the probability validation is completed.
export function applyQuarterbackUpdates(gameId,game,previous,now) {
  if(game.rerun)return game;
  const kickoff=Date.parse(game.kickoff),at=Date.parse(now);
  if(!Number.isFinite(kickoff)||!Number.isFinite(at))throw new Error('Invalid game decision time');
  const result=structuredClone(game),old=previous?.quarterback_updates;
  if(at>=kickoff) {
    const frozen=previous?structuredClone(previous):result;
    if(old)frozen.quarterback_updates=Object.fromEntries(Object.entries(old).map(([team,markets])=>[team,Object.fromEntries(Object.entries(markets).map(([kind,state])=>[kind,reviseQuarterbackPick({previous:state,gameId,kickoff:game.kickoff,now})]))]));
    return frozen;
  }
  const concerns=globalThis.CTD_SHOW_WORK.quarterbackConcerns(game,at);
  const teams=new Set([...concerns.map(c=>c.team),...Object.keys(old||{})]);
  if(!teams.size)return result;
  const quote=result.snapshot_evaluations?.find(s=>s.snapshot_id===result.current_recommendations?.snapshot_id);
  result.quarterback_updates={};
  for(const team of teams) {
    const concern=concerns.find(c=>c.team===team);
    // The current source establishes an adverse report, not a confirmed starter.
    // Do not invent a receipt timestamp or treat a depth chart as confirmation.
    const evidence=concern?{id:createHash('sha256').update(JSON.stringify(concern)).digest('hex'),game_id:gameId,verified:false,source:'Saved quarterback evidence',reported_at:concern.reported_at,display_reason:`${concern.player} was reported ${concern.status.toLowerCase()}. Waiting for a confirmed starter and an updated forecast.`,status:/questionable|doubtful/i.test(concern.status)?'QUESTIONABLE':'OUT'}:null;
    result.quarterback_updates[team]={};
    for(const kind of kinds) {
      const state=reviseQuarterbackPick({previous:old?.[team]?.[kind],gameId,kickoff:game.kickoff,now,report:evidence,quote:quote?{id:quote.snapshot_id,game_id:gameId,captured_at:quote.captured_at}:null});
      result.quarterback_updates[team][kind]=state;
      if(result.current_recommendations)result.current_recommendations[kind]={...state.current,confidence:null};
    }
  }
  for(const kind of kinds){
    const reasons=[...teams].map(team=>result.quarterback_updates[team][kind].current.reason).filter(Boolean);
    const reason=[...new Set(reasons)].join(' ');
    if(result.current_recommendations)result.current_recommendations[kind]={decision:'WAIT',selection:null,confidence:null,reason};
    if(quote?.markets?.[kind]){
      const market=quote.markets[kind];
      market.baseline_recommendation=market.baseline_recommendation||structuredClone(market.recommendation);
      market.recommendation={decision:'WAIT',selection:null,confidence:null,reason};
      market.context_validation={status:'HOLD',reason,checked_at:now,numeric_adjustment:0};
    }
  }
  return result;
}
