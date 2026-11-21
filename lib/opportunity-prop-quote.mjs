import {opportunityProp,applyOpportunityGate,opportunityWork} from './opportunity-prop-selection.mjs';
import {empiricalTails,canonicalTeam} from './opportunity-props.mjs';
const net=o=>o>0?o/100:100/-o;
export function evaluateOpportunityQuote(s,{opportunity,schedule,policy,availability,now=Date.now()}={}){
 const game=schedule?.games?.[s?.game_id],start=Date.parse(s?.kickoff),at=Date.parse(s?.captured_at);
 if(s?.horizon!=='WEEKLY'||schedule?.season!==2026||Number(schedule.week)!==Number(s.week)||!game||Date.parse(game.event_start||game.kickoff)!==start||!Number.isFinite(at)||at>now||now-at>60*60000||start<=now)return null;
 if(![game.home_team,game.away_team].map(canonicalTeam).includes(canonicalTeam(s.team))||!Number.isFinite(s.line)||![s.over_price,s.under_price].every(o=>Number.isInteger(o)&&Math.abs(o)>=100))return null;
 const c=opportunityProp(opportunity,{player:s.player,stat:s.stat,season:2026,week:s.week,gameId:s.game_id,kickoff:s.kickoff,now});
 if(!c||canonicalTeam(c.player.team)!==canonicalTeam(s.team)||c.player.position!==s.position||c.player.expected_active===false||availability?.state==='UNAVAILABLE')return null;
 const q=empiricalTails(c.spec.parameters.samples||c.spec.parameters,s.line),ih=1/(1+net(s.over_price)),iu=1/(1+net(s.under_price)),sides=[['OVER',q.over,q.under,s.over_price,ih],['UNDER',q.under,q.over,s.under_price,iu]].map(([side,win,loss,odds,implied])=>{const conditional=win+loss?win/(win+loss):0,fair=implied/(ih+iu),edge=conditional-fair,ev=win*net(odds)-loss;return {side,offered_odds:odds,model_win_probability:win,model_loss_probability:loss,model_push_probability:q.push,model_conditional_win_probability:conditional,no_vig_market_probability:fair,probability_edge:edge,expected_value:ev,decision:'INELIGIBLE',confidence:null};});
 sides.sort((a,b)=>b.expected_value-a.expected_value);
 const side=q.over>q.under?'OVER':q.under>q.over?'UNDER':null;
 let e={...s,evaluated_at:new Date(now).toISOString(),evaluation_source:'CURRENT_QUOTE_JOINT_OPPORTUNITY_DISTRIBUTION',model_generated_at:c.generated_at,model:{over_probability:q.over,under_probability:q.under,push_probability:q.push},model_pick:{status:side?'RESEARCH':'EVEN',side,conditional_on_availability:true},eligibility:{eligible_for_projection:true,eligible_for_pick:false},projection_availability:availability,sides,recommendation:{decision:'WAIT',side:null,confidence:null,expected_value:sides[0].expected_value,probability_edge:sides[0].probability_edge,reason:'OPPORTUNITY_MODEL_FORWARD_VALIDATION_REQUIRED'}};
 e=applyOpportunityGate(e,c);e.show_work=opportunityWork(e,c,null);return e;
}
