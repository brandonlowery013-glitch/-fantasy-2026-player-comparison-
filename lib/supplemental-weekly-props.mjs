import {createHash} from 'node:crypto';
import {lineProbabilities} from './distribution-tail-math.mjs';
export const VERSION='weekly-receiving-usage-v1';
export const norm=x=>String(x||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const number=x=>x!==null&&x!==undefined&&String(x).trim()!==''&&String(x)!=='-'&&Number.isFinite(Number(x))?Number(x):null;
const fields={targets:'receivingTargets',receptions:'receptions',receiving_yards:'receivingYards'};
export function regularGames(body,{season,team,now=Date.now()}){
 const block=(body.seasonTypes||[]).find(s=>String(s.displayName).includes(String(season))&&/regular season/i.test(s.displayName));
 const seen=new Set(),games=[];
 for(const row of (block?.categories||[]).flatMap(c=>c.events||[])){
  const e=body.events?.[row.eventId];if(!e||seen.has(row.eventId)||!['W','L','T'].includes(e.gameResult)||e.team?.abbreviation!==team||!(Date.parse(e.gameDate)<now))continue;
  const values=Object.fromEntries(Object.entries(fields).map(([stat,field])=>[stat,number(row.stats?.[body.names?.indexOf(field)])]));
  if(Object.values(values).some(x=>x===null)||values.receptions>values.targets||values.receptions<0||values.targets<0)continue;
  seen.add(row.eventId);games.push({event_id:String(row.eventId),week:Number(e.week),date:e.gameDate,opponent:e.opponent?.abbreviation,...values});
 }
 return games.sort((a,b)=>a.week-b.week);
}
function quantile(spec,p){
 if(spec.family==='negative_binomial'||spec.family==='compound_receptions'){for(let k=0;k<=200;k++)if(lineProbabilities(spec,k+.5).under>=p)return k;return 200;}
 let lo=0,hi=10000;for(let i=0;i<70;i++){const m=(lo+hi)/2;if(lineProbabilities(spec,m).under<p)lo=m;else hi=m;}return (lo+hi)/2;
}
export function fitUsage(games,{week,generated_at,settled=[],player,athlete_id,team,position,game_id,kickoff}){
 const sample=games.filter(g=>g.week<week&&Date.parse(g.date)<Math.min(Date.parse(kickoff),Date.parse(generated_at))).slice(-7);
 if(sample.length<4||!['targets','receptions','receiving_yards'].every(stat=>sample.reduce((sum,g)=>sum+g[stat],0)>0))return null;
 const weights=sample.map((g,i)=>.8**(sample.length-1-i)),total=weights.reduce((a,b)=>a+b,0),w=weights.map(x=>x/total),effective=1/w.reduce((a,b)=>a+b*b,0);
 const usableSettled=settled.filter(x=>x.player===player&&Number(x.week)<Number(week)&&x.actual!==null&&Date.parse(x.settled_at)<=Date.parse(generated_at));
 const projections={},distributions={};
 for(const stat of Object.keys(fields)){
  const rawMean=sample.reduce((a,g,i)=>a+w[i]*g[stat],0),variance=sample.reduce((a,g,i)=>a+w[i]*(g[stat]-rawMean)**2,0)/(1-w.reduce((a,b)=>a+b*b,0));
  const results=usableSettled.filter(x=>x.stat===stat);
  const correction=results.length?Math.max(-.2*rawMean,Math.min(.2*rawMean,results.reduce((a,x)=>a+x.actual-(x.raw_mean??x.mean),0)/(results.length+20))):0;
  const mean=Math.max(0,rawMean+correction),predictiveVariance=Math.max(variance,stat==='receiving_yards'?1:mean)*(1+1/effective);
  let spec;
  if(mean===0)spec={family:'compound_receptions',parameters:{pmf:[1]}};
  else if(stat==='receiving_yards'){
   const logVariance=Math.log1p(predictiveVariance/(mean*mean));spec={family:'lognormal_shifted',parameters:{shift:0,log_mu:Math.log(mean)-logVariance/2,log_sigma:Math.sqrt(logVariance)}};
  }else{const v=Math.max(predictiveVariance,mean*1.05),r=mean*mean/(v-mean);spec={family:'negative_binomial',parameters:{r,p:r/(r+mean)}};}
  spec={...spec,status:'SHADOW_ONLY',market_price_used_in_probability:false,generated_at,supplemental_model:VERSION};
  const summary={status:'SHADOW_ONLY',mean,sd:Math.sqrt(predictiveVariance),floor:quantile(spec,.1),median:quantile(spec,.5),ceiling:quantile(spec,.9),sportsbook_inputs_used:false,baseline:{source:'2026 reported regular-season game logs',games:sample.length,recency_decay:.8,unadjusted_mean:rawMean},learning:{settled_forecasts:results.length,mean_correction:correction,prior_strength:20}};
  projections[stat]=summary;distributions[stat]=spec;
 }
 const input_hash=createHash('sha256').update(JSON.stringify({version:VERSION,athlete_id,team,game_id,week,sample,settled:usableSettled})).digest('hex');
 return {player,athlete_id,team,position,week,game_id,kickoff,generated_at,input_hash,status:'SHADOW_ONLY',projection:{position,status:'SHADOW_ONLY',projections},distribution:{distributions},sample,model_version:VERSION,sportsbook_inputs_used:false,source_url:`https://www.espn.com/nfl/player/gamelog/_/id/${athlete_id}/type/nfl/year/2026`,assumptions:['Conditional on playing with the recent receiving role.','Last seven reported regular-season games; recency weight is 0.8 per older game.','Counts use a negative-binomial predictive distribution; receiving yards use a positive lognormal predictive distribution.','Sampling uncertainty is inflated by 1 + 1/effective sample size.','No unsourced opponent, injury, or morale adjustment is applied.','Verified pregame forecast errors update the mean with 20 prior observations and a 20% correction cap.']};
}
export function mergeSupplemental(projection,distribution,feed,{week,now=Date.now(),blockedTeams=[]}={}){
 if(!projection||!distribution||feed?.season!==2026||Number(feed.week)!==Number(week)||feed.sportsbook_inputs_used!==false)return {projection,distribution};
 const extra=Object.values(feed.players||{}).filter(p=>p.model_version===VERSION&&!projection.players?.[p.player]&&!blockedTeams.includes(p.team)&&p.week===Number(week)&&Date.parse(p.kickoff)>now&&Date.parse(p.generated_at)<=now&&now-Date.parse(p.generated_at)<=24*3600000);
 return {projection:{...projection,players:{...Object.fromEntries(extra.map(p=>[p.player,p.projection])),...projection.players}},distribution:{...distribution,distributions:{...Object.fromEntries(extra.map(p=>[p.player,p.distribution])),...distribution.distributions}}};
}
