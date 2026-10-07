// These are the canonical seven-component weights used by the existing reflow model.
export const weights={pd:.35,ce:.20,r:.15,e:.10,a:.10,rl:.05,su:.05};
export const numeric=x=>typeof x==='number'&&Number.isFinite(x);
export const round=(x,d=6)=>Number(x.toFixed(d));
// Same nearest-12 same-position regression as build-substantive-component-recalculation-v2.
export function fitProduction(players,position,ppr){
  if(!numeric(ppr)) return null;
  const pts=players.filter(p=>p.p===position&&numeric(p.mp)&&numeric(p.pd)).map(p=>({x:p.mp,y:p.pd}));
  if(pts.length<5)return null;
  const near=pts.sort((a,b)=>Math.abs(a.x-ppr)-Math.abs(b.x-ppr)).slice(0,12);
  const mx=near.reduce((s,p)=>s+p.x,0)/near.length,my=near.reduce((s,p)=>s+p.y,0)/near.length;
  const den=near.reduce((s,p)=>s+(p.x-mx)**2,0);if(!den)return null;
  const slope=near.reduce((s,p)=>s+(p.x-mx)*(p.y-my),0)/den;
  return round(Math.max(0,Math.min(10,my+slope*(ppr-mx))),3);
}
export const score=components=>round(Object.entries(weights).reduce((s,[k,w])=>s+components[k]*w,0));
