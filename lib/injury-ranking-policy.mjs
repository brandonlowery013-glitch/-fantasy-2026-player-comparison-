// A Questionable designation alone is informational. It must not create a
// numerical injury penalty in either weekly rank or football projection math.
export function numericInjuryAdjustmentAllowed(signal){
  const raw=String(signal?.evidence?.status||signal?.game_status||'').trim().toLowerCase();
  const status=['out','o','doubtful','d','ir','injured reserve'].includes(raw)?raw:String(signal?.evidence?.display_status||raw).trim().toLowerCase();
  return status!=='q'&&status!=='questionable';
}
