// Only a forecast saved before kickoff and before its outcome can count toward
// prospective evaluation. Multiple markets from one game count once.
export function quarterbackReleaseCheck({policy,modelVersion,observations=[],historicalReport}){
 const reasons=[],eligible=new Map();
 for(const r of observations){
  const saved=Date.parse(r.saved_at),kickoff=Date.parse(r.kickoff),settled=Date.parse(r.settled_at);
  if(r.model_version!==modelVersion||r.retrospective!==false||!r.forecast_hash||!r.game_id||![saved,kickoff,settled].every(Number.isFinite)||saved>=kickoff||settled<=kickoff||r.final_verified!==true)continue;
  if(!eligible.has(r.game_id))eligible.set(r.game_id,r);
 }
 const floor=policy.minimum_samples.prospective_challenger_observations;
 if(eligible.size<floor)reasons.push(`Prospective games: ${eligible.size} of ${floor} required.`);
 for(const fold of historicalReport?.folds||[]){
  const p=fold.probability_validation?.groups?.starter_changes;
  if(!p||p.candidate.brier==null||p.baseline.brier==null||p.candidate.brier>=p.baseline.brier)reasons.push(`${fold.season}: starter-change probabilities have not improved over the baseline.`);
 }
 if(!historicalReport?.folds?.length)reasons.push('Historical probability validation is missing.');
 // Reaching the sample floor is never itself approval or a numerical override.
 reasons.push('A reviewed prospective comparison and append-only promotion decision are required.');
 return {model_version:modelVersion,status:'HOLD',production_numeric_authority:0,prospective_games:eligible.size,required_prospective_games:floor,reasons};
}
