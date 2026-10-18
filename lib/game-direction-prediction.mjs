export function gameDirectionPrediction(game,snapshot,kind){
 if(!['moneyline','spread','total'].includes(kind))return null;
 const e=snapshot?.markets?.[kind],a=e?.side_a?.conditional_win_probability,b=e?.side_b?.conditional_win_probability;
 let home=a,away=b;
 if(kind==='moneyline'&&(!Number.isFinite(home)||!Number.isFinite(away))){
  const p=game.football_projection||{},sum=p.home_win_probability+p.away_win_probability;
  if(sum>0){home=p.home_win_probability/sum;away=p.away_win_probability/sum;}
 }
 if(!Number.isFinite(home)||!Number.isFinite(away))return {status:'UNAVAILABLE',selection:null,reason:'Matching model probability or spread line unavailable; no invented pick',betting_decision:e?.recommendation?.decision||'WAIT'};
 if(kind==='total'){
  const line=snapshot?.market?.total;
  if(!Number.isFinite(line))return {status:'UNAVAILABLE',selection:null,reason:'Total line unavailable',betting_decision:e?.recommendation?.decision||'WAIT'};
  const tie=Math.abs(a-b)<1e-12,over=a>=b,p=over?a:b;
  return {status:'MODEL_DIRECTION',side:over?'OVER':'UNDER',selection:`${over?'OVER':'UNDER'} ${line}`,probability:p,confidence:p<.52?'LOW':p<.6?'MODERATE':'HIGH',exact_probability_tie:tie,tie_break:tie?'Over before Under; no statistical preference':null,betting_decision:e?.recommendation?.decision||'WAIT',scope:'Prediction of the outcome; separate from value/availability-based betting recommendation'};
 }
 const tie=Math.abs(home-away)<1e-12,isHome=tie?game.home_team.localeCompare(game.away_team)<0:home>away;
 const team=isHome?game.home_team:game.away_team,p=isHome?home:away,line=snapshot?.market?.home_spread;
 if(kind==='spread'&&!Number.isFinite(line))return {status:'UNAVAILABLE',selection:null,reason:'Spread line unavailable',betting_decision:e?.recommendation?.decision||'WAIT'};
 const sideLine=isHome?line:-line;
 return {status:'MODEL_DIRECTION',team,selection:kind==='moneyline'?`${team} ML`:`${team} ${sideLine>0?'+':''}${sideLine}`,probability:p,confidence:p<.52?'LOW':p<.6?'MODERATE':'HIGH',exact_probability_tie:tie,tie_break:tie?'Alphabetical team code; no statistical preference':null,betting_decision:e?.recommendation?.decision||'WAIT',scope:'Prediction of the outcome; separate from value/availability-based betting recommendation'};
}
