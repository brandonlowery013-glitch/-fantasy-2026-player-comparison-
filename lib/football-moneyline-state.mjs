import {availableTraining,fitResidual,FACTORS,gameFeatures} from './postgame-model-learning.mjs';
import {behaviorState} from './football-learning.mjs';
export const FOOTBALL_FACTORS=Object.fromEntries(Object.entries(FACTORS).filter(([k])=>!['consensus_home','money_minus_bets_home'].includes(k)));
export function buildFootballMoneylineState(ledger,schedule,projections,asOf){
 if(schedule.week!==projections.week||schedule.season!==projections.season)throw Error('Football learning slate mismatch');
 const rows=availableTraining(ledger,{week:schedule.week,asOf}).filter(r=>(r.market||'moneyline')==='moneyline').map(r=>({...r,features:Object.fromEntries(Object.keys(FOOTBALL_FACTORS).map(k=>[k,r.features?.[k]??null]))}));
 const fit=fitResidual(rows,FOOTBALL_FACTORS,'football-only-postgame-residual-v1'),state=behaviorState(ledger.observations||[],{season:schedule.season,week:schedule.week,asOf}),games={};
 for(const [id,g] of Object.entries(projections.games||{})){
  const e=schedule.games?.[id];if(!e||Date.parse(e.event_start)!==Date.parse(g.event_start))continue;
  const p=g.model?.home_win_probability/(g.model?.home_win_probability+g.model?.away_win_probability);
  if(!Number.isFinite(p)||p<=0||p>=1)continue;
  const features=gameFeatures({home_team:e.home_team,away_team:e.away_team,home_score_mean:g.model.home_score_mean,away_score_mean:g.model.away_score_mean,probability:p},state);
  games[id]={home_team:e.home_team,away_team:e.away_team,kickoff:e.event_start,features:Object.fromEntries(Object.keys(FOOTBALL_FACTORS).map(k=>[k,features[k]??null]))};
 }
 return {schema_version:1,season:schedule.season,week:schedule.week,generated_at:asOf,model_version:'ctd-football-moneyline-v1',learning_enabled:true,sportsbook_inputs_used:false,automatic_upset_override_enabled:false,fit,training_weeks:[...new Set(rows.map(r=>r.week))].sort((a,b)=>a-b),training_policy:'Earlier-week frozen football forecasts and verified final outcomes only; sportsbook and betting-split features excluded.',games};
}
