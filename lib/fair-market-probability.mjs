export const FAIR_MARKET_METHOD='PROPORTIONAL_TWO_WAY';

const finite=x=>Number.isFinite(Number(x));
const assertProbability=(p,label)=>{p=Number(p);if(!finite(p)||p<=0||p>=1)throw new Error(`${label} must be strictly between 0 and 1`);return p;};

export function americanToImpliedProbability(odds){
  const o=Number(odds);
  if(!finite(o)||o===0)throw new Error('American odds must be finite and non-zero');
  return o<0?(-o)/((-o)+100):100/(o+100);
}

export function americanNetProfitPerUnit(odds){
  const o=Number(odds);
  if(!finite(o)||o===0)throw new Error('American odds must be finite and non-zero');
  return o<0?100/(-o):o/100;
}

export function probabilityToFairAmerican(probability){
  const p=assertProbability(probability,'Fair probability');
  if(Math.abs(p-0.5)<1e-15)return 100;
  return p>0.5?-100*p/(1-p):100*(1-p)/p;
}

export function devigTwoWayProbabilities(sideA,sideB){
  const a=assertProbability(sideA,'Side A raw implied probability');
  const b=assertProbability(sideB,'Side B raw implied probability');
  const sum=a+b;
  if(!finite(sum)||sum<=0)throw new Error('Two-way raw implied probability sum must be positive');
  const fairA=a/sum,fairB=b/sum;
  return {
    method:FAIR_MARKET_METHOD,
    raw_side_a_probability:a,
    raw_side_b_probability:b,
    raw_probability_sum:sum,
    book_margin:sum-1,
    fair_side_a_probability:fairA,
    fair_side_b_probability:fairB,
    fair_side_a_american:probabilityToFairAmerican(fairA),
    fair_side_b_american:probabilityToFairAmerican(fairB)
  };
}

export function fairTwoWayAmerican(sideAOdds,sideBOdds){
  return devigTwoWayProbabilities(
    americanToImpliedProbability(sideAOdds),
    americanToImpliedProbability(sideBOdds)
  );
}

export function expectedValueAmerican(modelProbability,offeredOdds){
  const p=Number(modelProbability);
  if(!finite(p)||p<0||p>1)throw new Error('Model probability must be between 0 and 1');
  // FIRE DRILL ONLY: intentionally incorrect sign on losing-probability term.
  return p*americanNetProfitPerUnit(offeredOdds)+(1-p);
}
