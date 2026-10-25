// Copy only the containers that model delivery modifies. Large evidence trees
// stay read-only instead of being duplicated for every delivery layer.
export function copyGameFeed(base){return {...base,...(base.games?{games:Object.fromEntries(Object.entries(base.games).map(([id,g])=>[id,{...g,...(g.current_recommendations?{current_recommendations:{...g.current_recommendations}}:{}),...(g.snapshot_evaluations?{snapshot_evaluations:g.snapshot_evaluations.map(s=>({...s,...(s.markets?{markets:{...s.markets}}:{})}))}:{})}]))}:{})};}
