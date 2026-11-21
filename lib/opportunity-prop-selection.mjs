import {OPPORTUNITY_VERSION,playerIdentity,empiricalTails} from './opportunity-props.mjs';
const aliases={passing_yards:'pass_yards',passing_tds:'pass_tds',passing_attempts:'pass_attempts',rushing_yards:'rush_yards',rushing_attempts:'rush_attempts',rushing_tds:'rush_tds'};
export function opportunityProp(artifact,{player,stat,season,week,gameId,kickoff,now=Date.now()}){
 if(artifact?.version!==OPPORTUNITY_VERSION||artifact.sportsbook_inputs_used!==false||artifact.season!==season||Number(artifact.week)!==Number(week))return null;
 const generated=Date.parse(artifact.generated_at),expires=Date.parse(artifact.expires_at),start=Date.parse(kickoff);
 if(!Number.isFinite(generated)||generated>now||now-generated>20*60000||!Number.isFinite(expires)||expires<=now||!Number.isFinite(start)||start<=now||generated>=start)return null;
 const matches=Object.entries(artifact.players||{}).filter(([name])=>playerIdentity(name)===playerIdentity(player));if(matches.length!==1)return null;
 const [name,p]=matches[0];if(Date.parse(p.kickoff)!==start||p.game_id!==gameId||!artifact.games?.[gameId])return null;
 const spec=p.distributions?.[aliases[stat]||stat];if(spec?.family!=='empirical_joint'||spec.market_price_used_in_probability!==false)return null;
 try{empiricalTails(spec.parameters?.samples||spec.parameters,0);}catch{return null;}
 return {name,player:p,spec,version:artifact.version,generated_at:artifact.generated_at,validation:artifact.validation,eligible_for_pick:artifact.validation?.status==='PROSPECTIVE_VALIDATED'&&artifact.validation?.eligible_for_pick===true&&p.eligible_for_pick===true&&p.expected_active===true&&p.missing?.length===0};
}
export function applyOpportunityGate(e,candidate){
 if(!candidate)return e;
 e.model_version=candidate.version;e.opportunity_model={version:candidate.version,generated_at:candidate.generated_at,method:candidate.player.opportunity_method,history_games:candidate.player.history_games,validation:candidate.validation?.status||'UNVALIDATED',missing:candidate.player.missing,eligible_for_pick:candidate.eligible_for_pick};
 if(!candidate.eligible_for_pick){for(const s of e.sides){s.decision='INELIGIBLE';s.confidence=null;}e.recommendation={...e.recommendation,decision:'WAIT',side:null,confidence:null,reason:'OPPORTUNITY_MODEL_VALIDATION_OR_CURRENT_CONTEXT_REQUIRED'};e.eligibility={...e.eligibility,eligible_for_pick:false};}
 return e;
}
export function opportunityWork(e,candidate,legacyProjection){
 const s=candidate.spec,p=candidate.player,summary=`Joint workload model projects ${s.mean.toFixed(2)} ${e.stat}; middle 80% of simulated outcomes: ${s.p10}–${s.p90}.`,missing=p.missing||[];
 const details=[summary,`Method: ${p.opportunity_method}. Team opportunities and QB/receiver production reconcile in shared simulations.`,`Opponent adjustments use earlier completed games only. No sportsbook input changes this football forecast.`,`Current status: ${e.recommendation.decision}. ${missing.length?'Missing or unverified: '+missing.join('; '):'Prospective validation is required.'}`];
 return {version:1,decision:e.recommendation.decision,final_probability:null,final_confidence:null,reconciliation:'JOINT_OPPORTUNITY_MODEL_REPLACES_LEGACY_ADJUSTMENTS_ONCE',additional_probability_adjustment:0,math:details,paragraphs:details,context:{status:'REVIEW_REQUIRED',missing,rows:[]},legacy_baseline_mean:legacyProjection?.mean??null,reader:{summary,details,matchup:[],sources:[],reconciliation:'The frozen baseline is retained separately; its percentage adjustments are not reapplied.',verdict:'Research projection; wait for validated current inputs before a betting recommendation.',limit:'Historical diagnostic accuracy does not establish a betting edge.'}};
}
