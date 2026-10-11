import {createHash} from 'node:crypto';
const time=v=>Date.parse(v);
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const finite=v=>typeof v==='number'&&Number.isFinite(v);
function predict(model,x){
 if(!model||!finite(model.a)||!Array.isArray(x)||x.length!==model.beta?.length||x.length!==model.mu?.length||x.length!==model.sd?.length||!x.every(finite)||!model.beta.every(finite)||!model.mu.every(finite)||!model.sd.every(v=>finite(v)&&v>0))throw new Error('Incomplete quarterback scoring inputs');
 return model.a+x.reduce((sum,v,i)=>sum+(v-model.mu[i])/model.sd[i]*model.beta[i],0);
}
// Score-only shadow inference. Never reuses baseline probabilities for changed scores.
export function quarterbackShadowForecast({gameId,kickoff,now,previous,input,model}){
 const at=time(now),start=time(kickoff);
 if(!Number.isFinite(at)||!Number.isFinite(start))throw new Error('Invalid forecast clock');
 if(previous?.game_id&&previous.game_id!==gameId)throw new Error('Wrong forecast game');
 if(previous?.locked_at)return structuredClone(previous);
 if(previous&&at<time(previous.updated_at))throw new Error('Out-of-order forecast');
 if(at>=start)return previous?{...structuredClone(previous),locked_at:kickoff}:null;
 if(!input&&!previous)return null;
 const result={game_id:gameId,updated_at:now,locked_at:null,status:'WAITING_FOR_REPORT',actionable:false,probability:null,expected_return:null,scenarios:[],reason:'Waiting for a dated quarterback update.'};
 const valid=(input?.reports||[]).filter(r=>r.game_id===gameId&&r.id&&r.team&&r.source_url&&r.verified===true&&Number.isFinite(time(r.reported_at))&&Number.isFinite(time(r.received_at))&&time(r.reported_at)<=time(r.received_at)&&time(r.received_at)<=at);
 const reports=new Map();for(const r of valid.sort((a,b)=>time(a.reported_at)-time(b.reported_at)||time(a.received_at)-time(b.received_at)))reports.set(r.team,r);
 const r=[...reports.values()][0];
 // Joint QB changes need a joint scenario, not two independently added penalties.
 if(reports.size>1)result.reason='Both teams have quarterback updates. A combined forecast is required.';
 else if(r&&previous?.report&&time(r.reported_at)<time(previous.report.reported_at))return structuredClone(previous);
 else if(r){
  result.report=structuredClone(r);
  const ids=r.status==='QUESTIONABLE'?[r.starter_id,r.backup_id]:['CONFIRMED_PLAYING','REPLACEMENT_CONFIRMED'].includes(r.status)?[r.confirmed_starter_id]:[];
  result.reason=r.status==='LATE_SETBACK'?'The previous forecast was withdrawn after a late quarterback setback.':'Waiting for the starting quarterback to be confirmed.';
  if(ids.length&&ids.every(Boolean)&&new Set(ids).size===ids.length){
   try{
    if(!model?.version||model.status!=='RESEARCH_ONLY'||!(time(model.trained_through)<start))throw new Error('The quarterback scoring model is unavailable for this game');
    result.scenarios=ids.map(id=>{
     const s=input.scenarios?.find(s=>s.player_id===id&&s.report_id===r.id&&s.reported_at===r.reported_at&&s.model_version===model.version&&s.game_id===gameId);
     if(!s||!s.player_name||!s.source_ids?.length||!Number.isFinite(time(s.inputs_as_of))||time(s.inputs_as_of)>time(r.received_at)||time(s.inputs_as_of)>=start||time(model.trained_through)>time(s.inputs_as_of)||s.coverage_complete!==true)throw new Error('Waiting for complete pregame quarterback and matchup inputs');
     const margin=predict(model.margin,s.margin_features),total=predict(model.total,s.total_features),home=(total+margin)/2,away=(total-margin)/2;
     if(home<0||away<0)throw new Error('The test forecast produced invalid team scores');
     return {player_id:id,player_name:s.player_name,home_score:home,away_score:away,home_margin:margin,total,inputs_as_of:s.inputs_as_of,source_ids:s.source_ids,explanation:`With ${s.player_name}, the test forecast is ${away.toFixed(1)} away points and ${home.toFixed(1)} home points. The scores include the quarterback profile and supporting matchup. Betting probability has not been validated.`};
    });
    result.model_version=model.version;result.status=ids.length===2?'STARTER_SCENARIOS':'UPDATED_SHADOW_FORECAST';result.reason=ids.length===2?'Waiting on quarterback news. Both score scenarios are shown.':'The confirmed-starter score forecast has been recalculated. Betting probability remains unvalidated.';
   }catch(e){result.scenarios=[];result.status='WAITING_FOR_INPUTS';result.reason=e.message;}
  }
 }
 const fingerprint=hash({...result,updated_at:null});
 if(previous?.fingerprint===fingerprint)return structuredClone(previous);
 return {...result,fingerprint,history:[...structuredClone(previous?.history||[]),{at:now,report_id:r?.id??null,status:result.status,scenarios:structuredClone(result.scenarios),reason:result.reason}]};
}
