// Direction follows the football probability distribution, independently of price/EV gates.
export function modelPropPick(q) {
  if (![q?.over,q?.under,q?.push].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1) || Math.abs(q.over+q.under+q.push-1)>1e-5)
    return {status:'UNAVAILABLE',side:null,reason:'MISSING_OR_INVALID_DISTRIBUTION'};
  if (Math.abs(q.over-q.under)<1e-10) return {status:'EVEN',side:null,reason:'EQUAL_MODEL_PROBABILITIES'};
  const side=q.over>q.under?'OVER':'UNDER',win=Math.max(q.over,q.under);
  return {status:'AVAILABLE',side,win_probability:win,conditional_win_probability:win/(q.over+q.under),push_probability:q.push};
}
