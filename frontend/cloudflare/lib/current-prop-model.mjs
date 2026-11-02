import {lineProbabilities} from './distribution-tail-math.mjs';

const statKey=s=>({passing_yards:'pass_yards',passing_tds:'pass_tds',rushing_yards:'rush_yards',rushing_tds:'rush_tds'}[s]||s);
const canon=t=>({LAR:'LA',WSH:'WAS'}[t]||t);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const net=o=>o>0?o/100:100/-o;
// Evaluate a newly observed price from the existing football distribution.
// This changes neither that distribution nor the availability requirements.
export function evaluateCurrentProp(s,{projection,distribution,schedule,availability,policy,now=Date.now()}={}){
 const kickoff=Date.parse(s?.kickoff),at=Date.parse(s?.captured_at),week=Number(s?.week),game=schedule?.games?.[s?.game_id];
 if(s?.horizon!=='WEEKLY'||!Number.isInteger(week)||!Number.isFinite(kickoff)||kickoff<=now||!Number.isFinite(at)||at>now||now-at>150*60000)return null;
 if(![projection,distribution,schedule].every(d=>d?.season===2026&&Number(d.week)===week)||projection.sportsbook_inputs_used!==false||distribution.sportsbook_inputs_used!==false)return null;
 if(!game||Date.parse(game.event_start||game.kickoff)!==kickoff||![game.home_team,game.away_team].map(canon).includes(canon(s.team))||s.position==='UNKNOWN')return null;
 if(![projection,distribution].every(d=>Number.isFinite(Date.parse(d.generated_at))&&Date.parse(d.generated_at)<=now&&Date.parse(d.generated_at)<kickoff))return null;
 const player=projection.players?.[s.player],spec=distribution.distributions?.[s.player]?.distributions?.[statKey(s.stat)];
 if(spec?.generated_at&&(!Number.isFinite(Date.parse(spec.generated_at))||Date.parse(spec.generated_at)>now||Date.parse(spec.generated_at)>=kickoff))return null;
 if(!player||spec?.status!=='SHADOW_ONLY'||spec.market_price_used_in_probability!==false||!availability?.can_project||!policy)return null;
 if(!finite(s.line)||![s.over_price,s.under_price].every(o=>Number.isInteger(o)&&Math.abs(o)>=100))return null;
 const required=['minimum_probability_edge','minimum_expected_value','minimum_model_conditional_win_probability'];
 if(!required.every(k=>finite(policy[k]))||!['HIGH','MODERATE','LEAN'].every(k=>finite(policy.confidence?.[k]?.minimum_probability_edge)&&finite(policy.confidence?.[k]?.minimum_expected_value)))return null;
 let q;try{q=lineProbabilities(spec,s.line);}catch{return null;}
 if(![q.over,q.under,q.push].every(x=>finite(x)&&x>=0&&x<=1)||Math.abs(q.over+q.under+q.push-1)>1e-6||q.over+q.under<=0)return null;
 const ia=1/(1+net(s.over_price)),ib=1/(1+net(s.under_price)),confirmed=availability.confirmed_for_game===true&&availability.state==='AVAILABLE';
 const sides=[['OVER',q.over,q.under,s.over_price,ia],['UNDER',q.under,q.over,s.under_price,ib]].map(([side,win,loss,odds,implied])=>{
  const conditional=win/(win+loss),fair=implied/(ia+ib),edge=conditional-fair,ev=win*net(odds)-loss,clears=edge>=policy.minimum_probability_edge&&ev>=policy.minimum_expected_value&&conditional>=policy.minimum_model_conditional_win_probability;
  const confidence=clears?['HIGH','MODERATE','LEAN'].find(k=>edge>=policy.confidence[k].minimum_probability_edge&&ev>=policy.confidence[k].minimum_expected_value)||'LEAN':null;
  return {side,offered_odds:odds,model_win_probability:win,model_loss_probability:loss,model_push_probability:q.push,model_conditional_win_probability:conditional,no_vig_market_probability:fair,probability_edge:edge,expected_value:ev,decision:confirmed?(clears?'PICK':'PASS'):'INELIGIBLE',confidence:confirmed?confidence:null};
 });
 sides.sort((a,b)=>b.expected_value-a.expected_value);
 const best=sides[0],side=q.over>q.under?'OVER':q.under>q.over?'UNDER':null;
 return {...s,evaluated_at:new Date(now).toISOString(),evaluation_source:'CURRENT_QUOTE_EXISTING_FOOTBALL_DISTRIBUTION',model_generated_at:spec.generated_at||distribution.generated_at,model:{over_probability:q.over,under_probability:q.under,push_probability:q.push},model_pick:{status:side?'AVAILABLE':'EVEN',side,conditional_on_availability:!confirmed},eligibility:{eligible_for_projection:true,eligible_for_pick:confirmed},projection_availability:availability,sides,recommendation:{decision:confirmed?best.decision:'WAIT',side:confirmed&&best.decision==='PICK'?best.side:null,confidence:confirmed?best.confidence:null,expected_value:best.expected_value,probability_edge:best.probability_edge,...(!confirmed?{reason:'EXPLICIT_ACTIVE_STATUS_REQUIRED'}:{})}};
}
