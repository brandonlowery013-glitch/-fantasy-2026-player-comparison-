import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const canon=t=>({LA:'LAR',WAS:'WSH',JAC:'JAX'}[t]||t);
const numeric=x=>x===null||x===undefined||String(x).trim()===''?null:Number.isFinite(Number(String(x).replaceAll(',','')))?Number(String(x).replaceAll(',','')):null;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const validTime=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const avg=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const latest=(rows,key)=>{const m=new Map();for(const r of rows||[]){const old=m.get(r[key]);if(!old||(r.revision||0)>(old.revision||0))m.set(r[key],r);}return m;};
const pair=x=>{const m=String(x||'').match(/^(\d+)\s*[-/]\s*(\d+)$/);return m?[+m[1],+m[2]]:null;};

// Only the existing settlement summary is consumed. No collectors or coefficients.
export function finalBehavior(summary,event,{week,season,observedAt}){
 const c=summary?.header?.competitions?.[0],competitors=c?.competitors||[];
 if(c?.status?.type?.completed!==true)return [];
 if(String(summary.header.id)!==String(event.event_id)||!validTime(c.date)||!validTime(observedAt)||Date.parse(observedAt)<=Date.parse(c.date))throw Error('Invalid final behavior provenance');
 const teams=competitors.map(t=>canon(t.team?.abbreviation));
 if(teams.length!==2||![event.home_team,event.away_team].every(t=>teams.includes(canon(t))))throw Error('Behavior team identity mismatch');
 const records=[];
 for(const team of summary.boxscore?.teams||[]){
  const id=canon(team.team?.abbreviation);if(!teams.includes(id))throw Error('Behavior boxscore identity mismatch');
  const stats=Object.fromEntries((team.statistics||[]).map(s=>[s.name,s.displayValue]));
  const plays=numeric(stats.totalOffensivePlays),rush=numeric(stats.rushingAttempts),passing=pair(stats.completionAttempts),sacks=pair(stats.sacksYardsLost),third=pair(stats.thirdDownEff),red=pair(stats.redZoneAttempts),possession=String(stats.possessionTime||'').match(/^(\d+):(\d{2})$/);
  const metrics={offensive_plays:plays,rush_attempts:rush,pass_attempts:passing?.[1]??null,completions:passing?.[0]??null,sacks_allowed:sacks?.[0]??null,net_passing_yards:numeric(stats.netPassingYards),rush_yards:numeric(stats.rushingYards),turnovers:numeric(stats.turnovers),possession_seconds:possession?+possession[1]*60+ +possession[2]:null,third_down_conversions:third?.[0]??null,third_down_attempts:third?.[1]??null,red_zone_scores:red?.[0]??null,red_zone_attempts:red?.[1]??null,points:numeric(competitors.find(t=>canon(t.team?.abbreviation)===id)?.score)};
  metrics.pass_play_share=plays>0&&rush!==null?(plays-rush)/plays:null; // Includes sacks; not PROE.
  metrics.rush_yards_per_attempt=rush>0&&metrics.rush_yards!==null?metrics.rush_yards/rush:null;
  records.push({observation_key:`${season}|${event.event_id}|team|${id}`,season,week,event_id:String(event.event_id),event_start:c.date,entity_type:'team',entity_id:id,team:id,metrics,verified_final:true,observed_at:observedAt,source:'ESPN verified final summary',source_sha256:hash(summary),missing_features:['PROE','neutral_situation_pace','pressure_rate','explosive_rate','leading_trailing_splits'],numeric_authority:0});
 }
 const maps={passing:{ATT:'pass_attempts',YDS:'pass_yards',TD:'pass_tds'},rushing:{CAR:'rush_attempts',YDS:'rush_yards',TD:'rush_tds'},receiving:{TGTS:'targets',REC:'receptions',YDS:'receiving_yards',TD:'receiving_tds'}};
 const players=new Map();
 for(const t of summary.boxscore?.players||[])for(const group of t.statistics||[]){
  const map=maps[group.name];if(!map)continue;
  for(const a of group.athletes||[]){
   const id=String(a.athlete?.id||'');if(!id)continue;const team=canon(t.team?.abbreviation);if(!teams.includes(team))throw Error('Player behavior team mismatch');
   const p=players.get(id)||{id,team,name:a.athlete.displayName,metrics:{}};
   if(p.team!==team)throw Error('Ambiguous player behavior identity');
   for(const [i,label] of (group.labels||[]).entries()){
    if(label==='C/ATT'){const v=pair(a.stats?.[i]);if(v)p.metrics.pass_attempts=v[1];}
    else if(map[label]){const value=numeric(a.stats?.[i]);if(value!==null)p.metrics[map[label]]=value;}
   }
   players.set(id,p);
  }
 }
 for(const p of players.values())records.push({observation_key:`${season}|${event.event_id}|player|${p.id}`,season,week,event_id:String(event.event_id),event_start:c.date,entity_type:'player',entity_id:p.id,player:p.name,team:p.team,metrics:p.metrics,verified_final:true,observed_at:observedAt,source:'ESPN verified final summary',source_sha256:hash(summary),missing_features:['routes','snaps'],numeric_authority:0});
 return records;
}

export function appendBehavior(existing,observations){
 const rows=structuredClone(existing||[]),byKey=latest(rows,'observation_key');
 for(const r of observations){
  if(r.verified_final!==true||!validTime(r.observed_at)||!validTime(r.event_start)||Date.parse(r.observed_at)<=Date.parse(r.event_start)||!Number.isInteger(r.week)||r.week<1||r.week>18)throw Error('Invalid behavior observation');
  const fingerprint=hash([r.entity_id,r.team,r.metrics]),old=byKey.get(r.observation_key);
  if(old?.fingerprint===fingerprint)continue;
  if(old&&Date.parse(r.observed_at)<Date.parse(old.observed_at))throw Error('Out-of-order behavior correction');
  const row={...r,fingerprint,revision:(old?.revision||0)+1,previous_revision:old?.revision||null};rows.push(row);byKey.set(row.observation_key,row);
 }
 return rows;
}

export function behaviorState(observations,{season,week,asOf,halfLife=4,regimeEvents=[]}){
 if(!validTime(asOf)||!Number.isInteger(week)||!finite(halfLife)||halfLife<=0)throw Error('Invalid learning cutoff');
 const eligible=(observations||[]).filter(r=>r.season===season&&r.week<week&&r.verified_final===true&&Date.parse(r.event_start)<Date.parse(asOf)&&Date.parse(r.observed_at)<=Date.parse(asOf));
 const groups=new Map();
 for(const r of latest(eligible,'observation_key').values()){const k=`${r.entity_type}|${r.entity_id}`;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}
 return Object.fromEntries([...groups].map(([id,rs])=>{
  rs.sort((a,b)=>Date.parse(a.event_start)-Date.parse(b.event_start));const metrics={};
  for(const key of new Set(rs.flatMap(r=>Object.keys(r.metrics)))){
   let sum=0,mass=0,n=0;rs.forEach((r,i)=>{if(finite(r.metrics[key])){const weight=2**(-(rs.length-1-i)/halfLife);sum+=r.metrics[key]*weight;mass+=weight;n++;}});metrics[key]={mean:mass?sum/mass:null,observations:n};
  }
  const eventEvidence=regimeEvents.filter(e=>validTime(e.captured_at)&&Date.parse(e.captured_at)<=Date.parse(asOf)&&['HIGH','MEDIUM'].includes(e.materiality)&&(canon(e.team)===rs.at(-1).team||String(e.entity_id_or_name||'')===rs.at(-1).player)).map(e=>({event_id:e.event_id,event_type:e.event_type,captured_at:e.captured_at,materiality:e.materiality,downstream_status:e.downstream_status,source:e.source,status:'REVIEW_ONLY',numeric_authority:0}));
  const shiftFlags=[];
  if(rs.length>=6)for(const key of ['offensive_plays','pass_play_share','pass_attempts','rush_attempts','targets']){
   const old=rs.slice(-6,-3).map(r=>r.metrics[key]).filter(finite),recent=rs.slice(-3).map(r=>r.metrics[key]).filter(finite);
   if(old.length!==3||recent.length!==3)continue;
   const before=avg(old),after=avg(recent),threshold=key==='pass_play_share'?.1:Math.max(1,Math.abs(before)*.2);
   if(Math.abs(after-before)>=threshold)shiftFlags.push({metric:key,prior_three_game_mean:before,recent_three_game_mean:after,threshold,flag:'THREE_GAME_SHIFT_REVIEW',numeric_authority:0});
  }
  return [id,{entity_type:rs[0].entity_type,entity_id:rs[0].entity_id,player:rs.at(-1).player||null,team:rs.at(-1).team,games:rs.length,as_of:asOf,half_life_games:halfLife,metrics,source_observation_keys:rs.map(r=>r.observation_key),regime_flags:[...(new Set(rs.map(r=>r.team)).size>1?['TEAM_CHANGE_REVIEW']:[]),...(rs.length<3?['INSUFFICIENT_PERSISTENCE_FOR_BEHAVIOR_CHANGE']:[])],regime_event_evidence:eventEvidence,behavior_shift_reviews:shiftFlags,status:'OBSERVATION',numeric_authority:0}];
 }));
}

export function classifyFactor(trial,{minimum=100}={}){
 const observation=reason=>({status:'OBSERVATION',numeric_authority:0,reason});
 if(!trial?.factor||!trial.rule_id||trial.prospective!==true||trial.independent_holdout!==true||!validTime(trial.rule_frozen_at))return observation('Missing independently frozen prospective rule/holdout');
 const pairs=trial.pairs||[];if(new Set(pairs.map(p=>p.prediction_id)).size!==pairs.length)return observation('Duplicate paired predictions');
 if(!pairs.length)return observation('No paired outcomes');
 for(const p of pairs)if(!validTime(p.captured_at)||!validTime(p.kickoff)||!validTime(p.settled_at)||Date.parse(trial.rule_frozen_at)>Date.parse(p.captured_at)||Date.parse(p.captured_at)>=Date.parse(p.kickoff)||Date.parse(p.settled_at)<Date.parse(p.kickoff)||p.verified_final!==true||![0,1].includes(p.result)||!finite(p.core_probability)||!finite(p.candidate_probability)||p.core_probability<0||p.core_probability>1||p.candidate_probability<0||p.candidate_probability>1||Math.abs(p.candidate_probability-p.core_probability)>.020000001)return observation('Invalid pair provenance/probability or modifier cap');
 const loss=(p,q)=>-Math.log(Math.max(1e-12,p.result?q:1-q));
 const brier_delta=avg(pairs.map(p=>(p.candidate_probability-p.result)**2-(p.core_probability-p.result)**2)),log_loss_delta=avg(pairs.map(p=>loss(p,p.candidate_probability)-loss(p,p.core_probability)));
 const weeks=[...new Set(pairs.map(p=>p.week))],consistent=weeks.every(w=>{const rs=pairs.filter(p=>p.week===w);return avg(rs.map(p=>(p.candidate_probability-p.result)**2-(p.core_probability-p.result)**2))<0&&avg(rs.map(p=>loss(p,p.candidate_probability)-loss(p,p.core_probability)))<0;});
 const evidence={n:pairs.length,games:new Set(pairs.map(p=>p.game_id)).size,weeks:weeks.length,brier_delta,log_loss_delta,sample_sha256:hash(pairs),numeric_authority:0};
 if(pairs.length<20||weeks.length<2)return {...evidence,...observation('Insufficient paired prospective evidence')};
 if(brier_delta>0&&log_loss_delta>0)return {...evidence,status:'REJECTED',reason:'This frozen rule worsens both proper scoring losses; no automatic retuning'};
 if(!(brier_delta<0&&log_loss_delta<0&&consistent))return {...evidence,...observation('Mixed metrics or inconsistent weekly improvement')};
 const approval=trial.review;
 const approved=pairs.length>=minimum&&trial.correlation_review==='CLEAR'&&approval?.decision==='APPROVED'&&approval.sample_sha256===evidence.sample_sha256&&validTime(approval.reviewed_at)&&Date.parse(approval.reviewed_at)>=Math.max(...pairs.map(p=>Date.parse(p.settled_at)))&&String(approval.reviewer||'').trim();
 return {...evidence,status:approved?'VALIDATED':'EMERGING',reason:approved?'Exact-sample reviewed holdout; numeric promotion still requires separate governance':'Consistent paired improvement; more holdout evidence/review required'};
}

export function predictionLearning(history,ledger){
 const first=new Map(),excluded=[];
 for(const p of [...(history.records||[])].sort((a,b)=>Date.parse(a.captured_at)-Date.parse(b.captured_at)||a.revision-b.revision)){
  if(p.decision!=='PICK')continue;
  if(!validTime(p.captured_at)||!validTime(p.kickoff)||Date.parse(p.captured_at)>=Date.parse(p.kickoff)||!validTime(p.source_generated_at)||Date.parse(p.source_generated_at)>Date.parse(p.captured_at)||!validTime(p.quote_observed_at)||Date.parse(p.quote_observed_at)>Date.parse(p.source_generated_at)){excluded.push({record_id:p.record_id,reason:'INVALID_PREGAME_PROVENANCE'});continue;}
  first.set(p.stream_id,first.get(p.stream_id)||p);
 }
 const settlements=latest(ledger.settlements,'record_id'),groups=new Map(),rows=[];
 for(const p of first.values()){
  const s=settlements.get(p.record_id),push=p.push_probability??0;
  if(!s)continue;
  if(s.verified_final!==true||!validTime(s.settled_at)||Date.parse(s.settled_at)<Date.parse(p.kickoff)||String(s.source_event_id)!==String(ledger.events?.[p.game_id]?.event_id)||!['WIN','LOSS','PUSH'].includes(s.outcome)||!finite(s.profit_units)||!finite(p.win_probability)||!finite(push)||push<0||push>=1||p.win_probability<0||p.win_probability>1-push||!finite(p.odds)||Math.abs(p.odds)<100){excluded.push({record_id:p.record_id,reason:'INVALID_SETTLEMENT_OR_PROBABILITY'});continue;}
  const prob=p.win_probability/(1-push),pay=p.odds>0?p.odds/100:100/-p.odds,reason=p.reason||p.source_provenance?.evidence?.recommendation?.reason||null;
  const row={record_id:p.record_id,game_id:p.game_id,week:p.week,market:p.market,player:p.player||null,selection:p.selection,probability:prob,outcome:s.outcome,profit_units:s.profit_units,predicted_ev:p.win_probability*pay-(1-p.win_probability-push),reason,reason_quality:reason?'PREGAME_REASON_RECORDED_MECHANISM_UNGRADED':'MISSING_PREGAME_REASON',model_version:p.model_version||null,source_provenance_available:!!p.source_provenance,settlement_revision:s.revision,numeric_authority:0};rows.push(row);
  const key=p.player?`prop:${p.market}`:p.market;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);
 }
 const markets=Object.fromEntries([...groups].map(([key,rs])=>{
  const bin=rs.filter(r=>r.outcome!=='PUSH'),n=rs.length,buckets={};
  for(const r of bin){const key=(Math.floor(r.probability*20)/20).toFixed(2);const b=buckets[key]||{n:0,wins:0,probability_sum:0};b.n++;b.wins+=r.outcome==='WIN'?1:0;b.probability_sum+=r.probability;buckets[key]=b;}
  return [key,{n,games:new Set(rs.map(r=>r.game_id)).size,wins:rs.filter(r=>r.outcome==='WIN').length,losses:rs.filter(r=>r.outcome==='LOSS').length,pushes:n-bin.length,brier:avg(bin.map(r=>(r.probability-(r.outcome==='WIN'?1:0))**2)),log_loss:avg(bin.map(r=>-Math.log(Math.max(1e-12,r.outcome==='WIN'?r.probability:1-r.probability)))),roi:avg(rs.map(r=>r.profit_units)),predicted_ev:avg(rs.map(r=>r.predicted_ev)),realized_minus_ev:avg(rs.map(r=>r.profit_units-r.predicted_ev)),probability_buckets:Object.fromEntries(Object.entries(buckets).map(([k,b])=>[k,{n:b.n,hit_rate:b.wins/b.n,mean_probability:b.probability_sum/b.n}])),missing_reasons:rs.filter(r=>!r.reason).length,missing_model_versions:rs.filter(r=>!r.model_version).length,status:'OBSERVATION',numeric_authority:0}];
 }));
 const factorNames=['pace','pressure','PROE','injury_personnel','role_usage','consensus','money_splits','line_movement'];
 const factors=Object.fromEntries(factorNames.map(f=>[f,{status:'OBSERVATION',numeric_authority:0,reason:'No separately frozen paired core-versus-factor holdout supplied; outcome alone cannot validate a reason',allowed_states:['OBSERVATION','EMERGING','VALIDATED','REJECTED']}]));
 const trials=(ledger.factor_trials||[]).map(trial=>({factor:trial.factor,market:trial.market,rule_id:trial.rule_id,...classifyFactor(trial)}));
 return {schema_version:1,basis:'First frozen PICK per stream; latest verified settlement; hypothetical original-price unit returns; pushes excluded from conditional probability losses',markets,rows,excluded,factors,factor_trials:trials,promotion_policy:'No automatic promotion. A separate dated matched candidate holdout, correlation checks and approved review are required. Trial status is specific to factor, rule and market; numeric authority stays zero.',limitations:['Same-game markets and same-player props are correlated','An explanation being present or a pick winning does not prove factor causality','Missing pregame reasons cannot be backfilled from outcomes','No current-game behavioral outcome is used in its own pregame state','Closing-line and score-error detail remains in existing calibration/audit artifacts']};
}
