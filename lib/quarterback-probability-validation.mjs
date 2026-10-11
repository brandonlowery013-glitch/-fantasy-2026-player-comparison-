export function marginProbabilities(mean,residuals){
 if(!Number.isFinite(mean)||!residuals.length||residuals.some(x=>!Number.isFinite(x)))throw new Error('Finite forecast and residuals required');
 const counts=[0,0,0];for(const e of residuals){const margin=Math.round(mean+e);counts[margin>0?0:margin===0?1:2]++;}
 return counts.map(n=>n/residuals.length);
}
export function probabilityMetrics(rows,residuals){
 if(!rows.length)return {games:0,brier:null,home_win_calibration:[]};
 const bins=Array.from({length:5},()=>({games:0,probability:0,wins:0}));let score=0;
 for(const r of rows){const p=marginProbabilities(r.predictedMargin,residuals),actual=r.ym>0?0:r.ym===0?1:2;score+=p.reduce((s,x,i)=>s+(x-+(i===actual))**2,0);const b=bins[Math.min(4,Math.floor(p[0]*5))];b.games++;b.probability+=p[0];b.wins+=+(actual===0);}
 return {games:rows.length,brier:score/rows.length,home_win_calibration:bins.map((b,i)=>({range:[i*.2,(i+1)*.2],games:b.games,predicted:b.games?b.probability/b.games:null,observed:b.games?b.wins/b.games:null}))};
}
