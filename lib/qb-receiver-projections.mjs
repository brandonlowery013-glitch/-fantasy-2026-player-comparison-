import {playerKey} from './player-prop-availability.mjs';
import {compoundReceptionPmf,lineProbabilities} from './distribution-tail-math.mjs';
const absent=/^(out|inactive|injured reserve|ir|pup|physically unable to perform|suspended|suspension)$/i;
const time=s=>Date.parse(s),current=(s,now,h)=>Number.isFinite(time(s))&&time(s)<=now+300000&&now-time(s)<=h*3600000;
const round=n=>Math.round(n*1e6)/1e6;
export function quarterbackProfile(name,model,k=3){
 const p=model.profiles[playerKey(name)],n=p?.games||0,mean={},variance={},mean_variance={};
 for(const m of ['pass_attempts','receptions','receiving_yards','receiving_tds']){
  mean[m]=((p?.[m]||0)+k*model.league[m])/(n+k);
  const sum=p?.[m]||0,sq=p?.sum_squares?.[m]||0;
  variance[m]=(Math.max(0,sq-2*mean[m]*sum+n*mean[m]**2)+k*(model.league.variance[m]+(model.league[m]-mean[m])**2))/(n+k);
  mean_variance[m]=variance[m]/(n+k);
 }
 return {name,games:n,prior_games:k,source:n?'Historical primary-passer games, shrunk toward league starter prior':'League starter prior; no qualifying NFL starts in the historical sample',mean,variance,mean_variance};
}
export function quarterbackStatus(player,availability,game,now=Date.now()){
 const official=(availability.games||[]).find(g=>g.team===player.team&&String(g.event_id)===String(game.event_id)&&time(g.kickoff)===time(game.event_start)&&g.complete===true);
 if(official?.inactive_names?.some(n=>playerKey(n)===playerKey(player.name)))return {out:true,official:true,designation:'Inactive',source_url:official.source_url,reported_at:official.published_at};
 if(official)return {out:false,official:true,designation:'Available',concern:false,source_url:official.source_url,reported_at:official.published_at};
 const reports=[...(player.injury_reports||[]),...(availability.injuries||[]).filter(x=>x.team===player.team&&(x.athlete_id===String(player.athlete_id)||playerKey(x.name)===playerKey(player.name)))].sort((a,b)=>(time(b.source_updated_at)||0)-(time(a.source_updated_at)||0));
 const r=reports[0];if(r?.conflicting_reports||time(r?.source_updated_at)>now+300000)return {out:false,review:true,designation:'Conflicting reports'};
 const designation=r?.status||'';
 const long=/injured reserve|^ir$|^pup$|suspend|suspension/i.test(designation);
 return {out:absent.test(designation)&&(long||current(r?.source_updated_at,now,7*24)),designation:designation||'Unconfirmed',concern:/questionable|doubtful/i.test(designation),source_url:r?.source_url||'https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries',reported_at:r?.source_updated_at||null};
}
export function resolveQuarterbacks({personnel,context,schedule,availability,anchors={},now=Date.now()}){
 if(Number(personnel.week)!==Number(schedule.week)||Number(context.week)!==Number(schedule.week)||Number(availability.week)!==Number(schedule.week))throw Error('Quarterback inputs must match the current week');
 const scenarios={};
 for(const [game_id,game] of Object.entries(schedule.games||{}))for(const team of [game.home_team,game.away_team]){
  const record=personnel.teams?.[team],qbs=(record?.players||[]).filter(p=>p.position==='QB').map(p=>({...p,team,rank:Math.min(...(p.depth_roles||[]).filter(d=>d.position==='QB').map(d=>Number(d.rank)))})).filter(p=>Number.isFinite(p.rank)).sort((a,b)=>a.rank-b.rank),id=game_id+':'+team;
  const documented=Object.values(context.players||{}).map(p=>p.signals?.qb_context?.evidence).find(e=>e?.team===team&&e.expected_qb);
  const original=anchors[id]?.starter||documented?.expected_qb||(qbs.filter(p=>p.rank===1).length===1?qbs.find(p=>p.rank===1).name:null);
  if(!original){scenarios[id]={game_id,team,event_id:game.event_id,kickoff:game.event_start,status:'REVIEW_REQUIRED',reason:'Expected starting quarterback is ambiguous.'};continue;}
  const rosterStarter=(record?.players||[]).find(p=>p.position==='QB'&&playerKey(p.name)===playerKey(original));
  const starter=rosterStarter?{...rosterStarter,team}:anchors[id]?.starter_id?{name:original,athlete_id:anchors[id].starter_id,team,position:'QB',injury_reports:[]}:null;
  if(!starter){scenarios[id]={game_id,team,event_id:game.event_id,kickoff:game.event_start,starter:original,status:'REVIEW_REQUIRED',reason:'Original starter is no longer on the verified depth chart.'};continue;}
  const report=quarterbackStatus(starter,availability,game,now),base={game_id,team,event_id:game.event_id,kickoff:game.event_start,starter:original,starter_id:starter.athlete_id,report,depth_observed_at:record.captured_at,depth_source_url:record.source_url};
  if(time(game.event_start)<=now){scenarios[id]={...base,status:'GAME_STARTED'};continue;}
  if(!report.out){const rankOne=qbs.filter(p=>p.rank===1);if(!rosterStarter||rankOne.length!==1||playerKey(rankOne[0].name)!==playerKey(original)){scenarios[id]={...base,status:'REVIEW_REQUIRED',reason:'The original QB is no longer the unique depth-chart starter; updated starter evidence is required.'};continue;}scenarios[id]={...base,status:report.concern?'STARTER_INJURY_CONCERN':'EXPECTED_STARTER',expected_qb:original};continue;}
  if(!current(record.captured_at,now,48)){scenarios[id]={...base,status:'REVIEW_REQUIRED',reason:'Starter is unavailable; a fresh replacement depth chart is required.'};continue;}
  const candidates=qbs.filter(p=>p.athlete_id!==starter.athlete_id&&!quarterbackStatus(p,availability,game,now).out&&!quarterbackStatus(p,availability,game,now).review&&p.roster_status!=='Practice Squad');
  const rank=candidates[0]?.rank,first=candidates.filter(p=>p.rank===rank);
  if(first.length!==1){scenarios[id]={...base,status:'REVIEW_REQUIRED',reason:'No unique eligible replacement quarterback is documented.'};continue;}
  const backup=first[0],backupReport=quarterbackStatus(backup,availability,game,now);
  scenarios[id]={...base,status:'BACKUP_EXPECTED',expected_qb:backup.name,backup_id:backup.athlete_id,backup_rank:backup.rank,backup_concern:backupReport.concern||false,selection_basis:'First eligible quarterback on the current team depth chart; not a confirmed starting-lineup announcement'};
 }
 return scenarios;
}
export function receiverFactors(position,starter,backup,model){
 const result={};for(const [stat,effect] of Object.entries(model.effects[position]||{})){
  const a=quarterbackProfile(starter,model,effect.shrinkage_games),b=quarterbackProfile(backup,model,effect.shrinkage_games),metric=stat==='targets'?'pass_attempts':stat;
  const ratio=b.mean[metric]/a.mean[metric],factor=Math.max(.05,1+effect.beta*(ratio-1));
  const ratioVar=ratio**2*(b.mean_variance[metric]/b.mean[metric]**2+a.mean_variance[metric]/a.mean[metric]**2);
  result[stat]={multiplier:factor,multiplier_variance:effect.beta**2*ratioVar,beta:effect.beta,shrinkage_games:effect.shrinkage_games,starter_games:a.games,backup_games:b.games};
 }return result;
}
export function applyQuarterbackRevisions({projection,context,scenarios,model,availability,now=Date.now()}){
 const result=structuredClone(projection),changes={};
 for(const [name,p] of Object.entries(result.players||{})){
  if(p.qb_scenario&&time(p.qb_scenario.kickoff)<=now)continue;
  if(projection.qb_baseline_players?.[name])result.players[name]=structuredClone(projection.qb_baseline_players[name]);
  const clean=result.players[name];
  for(const s of Object.values(clean.projections||{}))if(s.qb_adjustment){Object.assign(s,s.qb_adjustment.baseline_before_qb);delete s.qb_adjustment;}
  if(p.qb_scenario){delete clean.qb_scenario;clean.qb_restored=true;changes[name]=clean;}
 }
 result.qb_baseline_players={};
 for(const [id,scenario] of Object.entries(scenarios)){
  if(scenario.status==='REVIEW_REQUIRED'&&scenario.report?.out&&time(scenario.kickoff)>now){
   for(const [name,p] of Object.entries(result.players||{}))if(context.players?.[name]?.signals?.role?.evidence?.team===scenario.team){
    if(!['QB','WR','TE','RB'].includes(p.position))continue;delete p.qb_restored;result.qb_baseline_players[name]=structuredClone(p);
    if(p.position==='QB'&&playerKey(name)===playerKey(scenario.starter)){p.projections={};p.status='UNAVAILABLE';}
    else if(['WR','TE','RB'].includes(p.position)){for(const stat of ['targets','receptions','receiving_yards','receiving_tds'])delete p.projections[stat];p.status='REVIEW_REQUIRED';}
    else continue;p.reason=scenario.reason;p.qb_scenario=scenario;changes[name]=p;
   }
   continue;
  }
  if(scenario.status!=='BACKUP_EXPECTED'||time(scenario.kickoff)<=now)continue;
  const profile=quarterbackProfile(scenario.expected_qb,model),adjusted=[];
  for(const [name,p] of Object.entries(result.players||{})){
   const team=context.players?.[name]?.signals?.role?.evidence?.team;if(team!==scenario.team)continue;delete p.qb_restored;
   if(playerKey(name)===playerKey(scenario.starter)){result.qb_baseline_players[name]=structuredClone(p);p.status='UNAVAILABLE';p.projections={};p.qb_scenario={...scenario,reason:'Starting QB ruled out'};changes[name]=p;continue;}
   if(playerKey(name)===playerKey(scenario.expected_qb)&&p.position==='QB'){
    result.qb_baseline_players[name]=structuredClone(p);
    for(const [stat,metric] of [['pass_yards','receiving_yards'],['pass_tds','receiving_tds'],['pass_attempts','pass_attempts']])p.projections[stat]={status:'SHADOW_ONLY',actionable:false,mean:round(profile.mean[metric]),sd:round(Math.sqrt(profile.variance[metric]+profile.mean_variance[metric])),combined_sd:round(Math.sqrt(profile.variance[metric]+profile.mean_variance[metric])),performance_sd:round(Math.sqrt(profile.variance[metric])),projection_error_sd:round(Math.sqrt(profile.mean_variance[metric])),sportsbook_inputs_used:false,baseline:{source:profile.source,games:profile.games}};
    p.qb_scenario={...scenario,model_version:model.version,backup_historical_games:profile.games};changes[name]=p;continue;
   }
   if(!['WR','TE','RB'].includes(p.position)||!Object.keys(p.projections||{}).length)continue;
   const playerReport=availability?quarterbackStatus({name,team,injury_reports:[]},availability,{event_id:scenario.event_id,event_start:scenario.kickoff},now):null;
   if(playerReport?.out||scenario.unavailable_receivers?.includes(name)){result.qb_baseline_players[name]=structuredClone(p);p.status='UNAVAILABLE';p.projections={};p.qb_scenario={...scenario,reason:'Pass catcher reported unavailable',availability_report:playerReport};changes[name]=p;scenario.unavailable_receivers=[...new Set([...(scenario.unavailable_receivers||[]),name])];continue;}
   const factors=receiverFactors(p.position,scenario.starter,scenario.expected_qb,model);
   for(const [stat,factor] of Object.entries(factors)){
    const statProjection=p.projections[stat];if(!statProjection||!Number.isFinite(statProjection.mean)||!Number.isFinite(statProjection.sd))continue;
    const base=statProjection.qb_adjustment?.baseline_before_qb||{mean:statProjection.mean,sd:statProjection.sd,performance_sd:statProjection.performance_sd,projection_error_sd:statProjection.projection_error_sd};
    const mean=base.mean*factor.multiplier,additionalVariance=base.mean**2*factor.multiplier_variance,sd=Math.sqrt(base.sd**2*factor.multiplier**2+additionalVariance);
    Object.assign(statProjection,{mean:round(mean),sd:round(sd),combined_sd:round(sd),performance_sd:round((base.performance_sd||base.sd)*factor.multiplier),projection_error_sd:round(Math.sqrt((base.projection_error_sd||0)**2*factor.multiplier**2+additionalVariance)),qb_adjustment:{...factor,baseline_before_qb:base,starter:scenario.starter,expected_qb:scenario.expected_qb,model_version:model.version}});
   }
   p.qb_scenario={...scenario,model_version:model.version,backup_historical_games:profile.games};changes[name]=p;adjusted.push(name);
  }
  scenario.affected_receivers=adjusted;scenario.backup_projection={pass_attempts:round(profile.mean.pass_attempts),pass_yards:round(profile.mean.receiving_yards),pass_tds:round(profile.mean.receiving_tds),historical_games:profile.games,source:profile.source};
 }
 result.quarterback_scenarios=scenarios;
 return {projection:result,changes};
}
function respec(spec,projection){
 const s=structuredClone(spec),m=Number(projection.mean),sd=Number(projection.sd);if(!(m>=0&&sd>0)||spec.status!=='SHADOW_ONLY')return spec;
 s.mean=m;s.sd=sd;s.qb_adjustment=projection.qb_adjustment;
 if(s.family==='normal')s.parameters={mu:m,sigma:sd};
 else if(s.family==='student_t')s.parameters={mu:m,df:s.parameters.df,scale:sd*Math.sqrt((s.parameters.df-2)/s.parameters.df)};
 else if(s.family==='lognormal_shifted'){const shift=s.parameters.shift||0,sig2=Math.log(1+sd**2/(m-shift)**2);s.parameters={shift,log_mu:Math.log(m-shift)-sig2/2,log_sigma:Math.sqrt(sig2)};}
 else if(s.family==='poisson')s.parameters={lambda:Math.max(1e-6,m)};
 else if(s.family==='negative_binomial'){const variance=Math.max(sd**2,m+1e-6),r=m*m/Math.max(1e-6,variance-m);s.parameters={mean:m,variance,r,p:r/(r+Math.max(1e-6,m))};}
 return s;
}
export function reviseReceiverDistributions(distributions,changes){
 const result=structuredClone(distributions);
 for(const p of Object.values(result.distributions||{}))for(const [stat,spec] of Object.entries(p.distributions||{}))if(spec.qb_baseline_spec)p.distributions[stat]=structuredClone(spec.qb_baseline_spec);
 for(const [name,p] of Object.entries(changes)){
  const rec=result.distributions?.[name];if(!rec)continue;
  if(p.status==='UNAVAILABLE'){rec.distributions={};continue;}
  if(p.qb_scenario?.status==='REVIEW_REQUIRED'&&p.qb_scenario?.report?.out){for(const stat of ['targets','receptions','receiving_yards','receiving_tds'])delete rec.distributions[stat];continue;}
  if(p.position==='QB'&&p.qb_scenario?.status==='BACKUP_EXPECTED'){
   for(const [stat,projection] of Object.entries(p.projections||{}))if(rec.distributions[stat])rec.distributions[stat]={...respec(rec.distributions[stat],projection),qb_baseline_spec:structuredClone(rec.distributions[stat])};continue;
  }
  for(const [stat,projection] of Object.entries(p.projections||{}))if(projection.qb_adjustment&&stat!=='receptions'&&rec.distributions[stat])rec.distributions[stat]={...respec(rec.distributions[stat],projection),qb_baseline_spec:structuredClone(rec.distributions[stat])};
  const old=rec.distributions.receptions,targets=rec.distributions.targets;
  if(old?.family==='compound_receptions'&&targets&&p.projections.receptions?.qb_adjustment){
   const recFactor=p.projections.receptions.qb_adjustment.multiplier,targetFactor=p.projections.targets?.qb_adjustment?.multiplier||1;
   const cp=Math.max(1e-5,Math.min(1-1e-5,(old.qb_base_catch_rate??old.parameters.catch_rate)*recFactor/targetFactor)),compound=compoundReceptionPmf(targets,{catch_rate:cp,rho:old.parameters.rho,conditional_family:old.conditional_family,tailTolerance:1e-10,maxSupport:300});
   rec.distributions.receptions={...old,qb_baseline_spec:structuredClone(old),qb_base_catch_rate:old.qb_base_catch_rate??old.parameters.catch_rate,mean:compound.mean,sd:compound.sd,qb_adjustment:p.projections.receptions.qb_adjustment,parameters:{...old.parameters,catch_rate:cp,target_distribution:targets,pmf:compound.pmf,marginal_mean:compound.mean,marginal_variance:compound.variance,marginal_sd:compound.sd,support_max:compound.support_max,target_truncated_tail:compound.target_truncated_tail,normalized_mass:compound.normalized_mass}};
  }else if(old&&p.projections.receptions?.qb_adjustment)rec.distributions.receptions=respec(old,p.projections.receptions);
 }return result;
}
export function evaluateRevisedQuote(snapshot,spec,scenario){
 const q=lineProbabilities(spec,Number(snapshot.line)),side=q.over>q.under?'OVER':q.under>q.over?'UNDER':null;
 const net=odds=>odds>0?odds/100:100/-odds;
 const implied=odds=>1/(1+net(odds)),margin=implied(snapshot.over_price)+implied(snapshot.under_price);
 const sides=[['OVER',q.over,q.under,snapshot.over_price],['UNDER',q.under,q.over,snapshot.under_price]].map(([side,win,loss,odds])=>({side,offered_odds:odds,model_win_probability:win,model_loss_probability:loss,model_push_probability:q.push,model_conditional_win_probability:win/(win+loss),no_vig_market_probability:implied(odds)/margin,probability_edge:win/(win+loss)-implied(odds)/margin,expected_value:win*net(odds)-loss,decision:'INELIGIBLE',confidence:null}));
 return {...snapshot,model:{over_probability:q.over,under_probability:q.under,push_probability:q.push},model_pick:{side,status:side?'AVAILABLE':'EVEN',conditional_on_availability:true},eligibility:{eligible_for_pick:false,eligible_for_projection:true},recommendation:{decision:'WAIT',reason:'QB_REPLACEMENT_CONDITIONAL_PROJECTION'},qb_scenario:scenario,sides};
}
