// A Questionable designation alone is informational. It must not create a
// numerical injury penalty in either weekly rank or football projection math.
import {fantasyInjuryStatus} from './weekly-ranking-availability.mjs';
export function numericInjuryAdjustmentAllowed(signal){
  // Use the same resolved designation as the player detail feed. A retained
  // provider D report must not penalize a player whose resolved display is Q.
  const evidence={...signal?.evidence,status:signal?.evidence?.status||signal?.game_status||''};
  return fantasyInjuryStatus({signals:{injury:{...signal,evidence}}}).tag!=='Q';
}
