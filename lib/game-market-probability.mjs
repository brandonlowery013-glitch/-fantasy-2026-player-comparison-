import crypto from 'node:crypto';
import {fairTwoWayAmerican,americanNetProfitPerUnit} from './fair-market-probability.mjs';

const finite=x=>Number.isFinite(Number(x));
const round=(x,d=6)=>Number(Number(x).toFixed(d));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function rng(seed){let x=parseInt(crypto.createHash('sha256').update(seed).digest('hex').slice(0,8),16)>>>0;return()=>{x+=0x6D2B79F5;let t=x;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function normal(r){let u=0,v=0;while(u===0)u=r();while(v===0)v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}

export function simulateGameDistribution(gameId,game){
  const hm=Number(game?.model?.home_score_mean),am=Number(game?.model?.away_score_mean);
  const n=Number(game?.distribution?.simulations),sd=Number(game?.distribution?.team_score_sd),rho=clamp(Number(game?.distribution?.home_away_score_correlation),-.5,.5);
  if(!finite(hm)||!finite(am)||!Number.isInteger(n)||n<1000||!finite(sd)||sd<=0||!finite(rho))throw new Error(`Invalid Step 14 distribution for ${gameId}`);
  const r=rng(gameId),draws=[];
  for(let i=0;i<n;i++){
    const z1=normal(r),z2=rho*z1+Math.sqrt(1-rho*rho)*normal(r);
    const home=Math.max(0,Math.round(hm+sd*z1)),away=Math.max(0,Math.round(am+sd*z2));
    draws.push({home,away,margin:home-away,total:home+away});
  }
  return draws;
}

export function outcomeProbabilities(values,threshold,direction){
  if(!Array.isArray(values)||!values.length||!finite(threshold))throw new Error('Invalid outcome probability request');
  let win=0,push=0,loss=0;
  const t=Number(threshold);
  for(const x of values){
    const v=Number(x);
    if(Math.abs(v-t)<1e-12)push++;
    else if(direction==='OVER'?(v>t):(v<t))win++;
    else loss++;
  }
  const n=values.length,den=win+loss;
  return {win_probability:win/n,push_probability:push/n,loss_probability:loss/n,conditional_win_probability:den?win/den:null};
}

export function moneylineProbabilities(draws,side){
  let win=0,push=0,loss=0;
  for(const d of draws){
    if(d.home===d.away)push++;
    else if((side==='HOME'&&d.home>d.away)||(side==='AWAY'&&d.away>d.home))win++;
    else loss++;
  }
  const n=draws.length,den=win+loss;
  return {win_probability:win/n,push_probability:push/n,loss_probability:loss/n,conditional_win_probability:den?win/den:null};
}

export function expectedValueWithPush(winProbability,pushProbability,odds){
  const w=Number(winProbability),p=Number(pushProbability),l=1-w-p;
  if(!finite(w)||!finite(p)||w<0||p<0||l<-1e-12)throw new Error('Invalid win/push probabilities');
  return w*americanNetProfitPerUnit(odds)-Math.max(0,l);
}

export function evaluateTwoWay({sideA,sideB,sideAOdds,sideBOdds,thresholds}){
  const fair=fairTwoWayAmerican(sideAOdds,sideBOdds);
  const aEdge=sideA.conditional_win_probability-fair.fair_side_a_probability;
  const bEdge=sideB.conditional_win_probability-fair.fair_side_b_probability;
  const aEv=expectedValueWithPush(sideA.win_probability,sideA.push_probability,sideAOdds);
  const bEv=expectedValueWithPush(sideB.win_probability,sideB.push_probability,sideBOdds);
  return {
    fair_market:{method:fair.method,book_margin:round(fair.book_margin),raw_probability_sum:round(fair.raw_probability_sum),side_a_probability:round(fair.fair_side_a_probability),side_b_probability:round(fair.fair_side_b_probability),side_a_fair_american:round(fair.fair_side_a_american,2),side_b_fair_american:round(fair.fair_side_b_american,2)},
    side_a:{...sideA,conditional_win_probability:round(sideA.conditional_win_probability),probability_edge:round(aEdge),expected_value:round(aEv),offered_odds:Number(sideAOdds)},
    side_b:{...sideB,conditional_win_probability:round(sideB.conditional_win_probability),probability_edge:round(bEdge),expected_value:round(bEv),offered_odds:Number(sideBOdds)},
    thresholds:thresholds||null
  };
}

export function recommendation(evaluation,policy,labels){
  const candidates=[['A',evaluation.side_a],['B',evaluation.side_b]].sort((x,y)=>y[1].expected_value-x[1].expected_value);
  const [key,best]=candidates[0];
  const clears=best.probability_edge>=policy.minimum_probability_edge&&best.expected_value>=policy.minimum_expected_value&&best.conditional_win_probability>=policy.minimum_model_conditional_win_probability;
  if(!clears)return {decision:'PASS',selection:null,confidence:null,reason:'No side clears locked probability-edge, EV, and model-probability minimums'};
  let confidence='LEAN';
  if(best.probability_edge>=policy.confidence.HIGH.minimum_probability_edge&&best.expected_value>=policy.confidence.HIGH.minimum_expected_value)confidence='HIGH';
  else if(best.probability_edge>=policy.confidence.MODERATE.minimum_probability_edge&&best.expected_value>=policy.confidence.MODERATE.minimum_expected_value)confidence='MODERATE';
  return {decision:'PICK',selection:key==='A'?labels.side_a:labels.side_b,confidence,probability_edge:best.probability_edge,expected_value:best.expected_value,model_conditional_win_probability:best.conditional_win_probability};
}
