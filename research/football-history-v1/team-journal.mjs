// Research library. It is intentionally not imported by the live application.
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const time=x=>{const n=Date.parse(x);if(!Number.isFinite(n))throw Error('Dated evidence required');return n;};
const confirmed=new Set(['CONFIRMED_STARTER_CHANGE','CONFIRMED_STARTER_RETURN','COACH_RETAINS_STARTER']);
export function teamContext(events,{team,gameId,cutoff}){
 const at=time(cutoff),rows=events.filter(e=>e.team===team&&time(e.available_at)<=at&&(!e.game_id||e.game_id===gameId)).sort((a,b)=>time(a.available_at)-time(b.available_at));
 const state={team,game_id:gameId,expected_qb:null,starter_evidence:null,uncertainties:[],injuries:{},events:[]};
 for(const e of rows){if(!e.id||!/^https:\/\//.test(e.source||''))throw Error('Evidence ID and public source required');state.events.push(e.id);
  if(confirmed.has(e.type)){state.expected_qb=e.player;state.starter_evidence=e;state.uncertainties=state.uncertainties.filter(u=>u.kind!=='BENCH_SPECULATION'&&!(e.type==='CONFIRMED_STARTER_RETURN'&&u.kind==='QB_INJURY_EXIT'&&u.player===e.player));}
  else if(e.type==='BENCH_SPECULATION')state.uncertainties.push({kind:e.type,player:e.player,source:e.source});
  else if(e.type==='QB_INJURY_EXIT')state.uncertainties.push({kind:e.type,player:e.player,reason:'Previous-game exit does not confirm next-game absence',source:e.source});
  else if(e.type==='PREGAME_STATUS'){if(!e.game_id)throw Error('Pregame status must identify the game');state.injuries[e.player]={status:e.status,source:e.source,available_at:e.available_at};}
  else if(e.type==='PARTICIPATION'){state.uncertainties=state.uncertainties.filter(u=>!(u.player===e.player&&u.kind==='QB_INJURY_EXIT'));}
 }
 return state;
}
export function injuryExposure({depthRank,targetShare,carryShare,snapShare}){return {starter:Number.isInteger(depthRank)?depthRank===1:null,target_share:finite(targetShare)?targetShare:null,carry_share:finite(carryShare)?carryShare:null,snap_share:finite(snapShare)?snapShare:null,numeric_probability_adjustment:null};}
const implied=o=>o<0?-o/(100-o):100/(100+o),logit=p=>Math.log(p/(1-p)),sigmoid=z=>1/(1+Math.exp(-Math.max(-30,Math.min(30,z))));
export function moneylineResearch(fit,{home,away,homeOdds,awayOdds,capturedAt,kickoff,features,context}){
 if(![homeOdds,awayOdds].every(o=>finite(o)&&Math.abs(o)>=100))throw Error('Exact two-sided American odds required');if(time(capturedAt)>=time(kickoff))throw Error('Pregame quote required');
 if(!context?.[home]?.expected_qb||!context?.[away]?.expected_qb)return {status:'QB_REVIEW_REQUIRED',selection:null};
 const homeDog=homeOdds>awayOdds;if(homeOdds===awayOdds)throw Error('Pick-em has no unique underdog');const ph=implied(homeOdds)/(implied(homeOdds)+implied(awayOdds)),market=homeDog?ph:1-ph;let z=logit(market)+fit.beta[0];const steps=[];
 for(let i=0;i<fit.columns.length;i++){const k=fit.columns[i],x=features[k],value=finite(x)?Math.max(-3,Math.min(3,(x-fit.mean[i])/fit.sd[i])):0;const before=sigmoid(z);z+=fit.beta[i+1]*value;steps.push({feature:k,value:finite(x)?x:null,change_pp:100*(sigmoid(z)-before)});}
 const dogProbability=sigmoid(z),hp=homeDog?dogProbability:1-dogProbability;return {status:'RESEARCH_ONLY',selection:hp>.5?home:away,home_probability:hp,away_probability:1-hp,underdog_probability:dogProbability,steps,live_authority:false};
}
