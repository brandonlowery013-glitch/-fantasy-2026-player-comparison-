import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {parseCSV,canon,rows,ridge,pred} from '../lib/game-scoring-calibration.mjs';
import {fitCandidate,metrics} from '../lib/matchup-score-candidate.mjs';
import {probabilityMetrics} from '../lib/quarterback-probability-validation.mjs';
const root='.cache/matchup-context/',read=f=>parseCSV(fs.readFileSync(root+f,'utf8'));
const schedule=read('games.csv').filter(g=>g.game_type==='REG').sort((a,b)=>+a.season-+b.season||+a.week-+b.week);
const history=schedule.filter(g=>+g.season>=2020&&+g.season<=2025&&g.home_score!==''&&g.away_score!=='');
const games=history.map(g=>({id:g.game_id,season:+g.season,week:+g.week,home:canon(g.home_team),away:canon(g.away_team),hs:+g.home_score,as:+g.away_score,hr:+g.home_rest,ar:+g.away_rest}));
const players=new Map(read('players.csv').map(p=>[p.gsis_id,p]));
const statFiles=Array.from({length:7},(_,i)=>`stats_player_week_${2020+i}.csv`),stats=statFiles.flatMap(read).filter(r=>r.position==='QB'&&r.season_type==='REG');
const teamFiles=Array.from({length:7},(_,i)=>`stats_team_week_${2020+i}.csv`),teams=teamFiles.flatMap(read).filter(r=>r.season_type==='REG');
const byPlayer=new Map();for(const r of stats){if(!byPlayer.has(r.player_id))byPlayer.set(r.player_id,[]);byPlayer.get(r.player_id).push(r);}
const prior=(r,g)=>+r.season<+g.season||(+r.season===+g.season&&+r.week<+g.week);
const sum=(rs,k)=>rs.reduce((s,r)=>s+(Number(r[k])||0),0);
// Conditional-starter benchmark: actual schedule starter identity is known.
// This is NOT proof of archived pregame injury/starter coverage or betting ROI.
function profile(id,team,g){
 const p=players.get(id),rs=(byPlayer.get(id)||[]).filter(r=>prior(r,g)&&+r.season>=+g.season-2);
 const starts=schedule.filter(r=>prior(r,g)&&[r.home_qb_id,r.away_qb_id].includes(id)).length;
 const db=sum(rs,'attempts')+sum(rs,'sacks_suffered');
 const same=rs.filter(r=>canon(r.team)===canon(team));
 return [Math.log1p(starts),db?sum(rs,'passing_epa')/db:0,Math.log1p(db),p?.rookie_season?+(+p.rookie_season===+g.season):0,+!db,Math.log1p(sum(same,'attempts'))];
}
function support(team,opp,g){
 const recent=teams.filter(r=>prior(r,g)&&+r.season>=+g.season-1),own=recent.filter(r=>canon(r.team)===canon(team)),def=recent.filter(r=>canon(r.opponent_team)===canon(opp));
 const rate=(rs,k,den)=>{const d=den.reduce((s,k)=>s+sum(rs,k),0);return d?sum(rs,k)/d:0;};
 return [rate(own,'sacks_suffered',['attempts','sacks_suffered']),rate(own,'rushing_epa',['carries']),rate(def,'passing_epa',['attempts','sacks_suffered'])];
}
function feature(g){
 const side=(id,team,opp)=>{const q=profile(id,team,g),s=support(team,opp,g);return [...q,...s,...s.map(v=>v*q[0])];};
 const h=side(g.home_qb_id,g.home_team,g.away_team),a=side(g.away_qb_id,g.away_team,g.home_team);return {m:h.map((x,i)=>x-a[i]),t:h.map((x,i)=>x+a[i])};
}
const features=new Map(history.filter(g=>g.home_qb_id&&g.away_qb_id).map(g=>[g.game_id,feature(g)]));
const contract=JSON.parse(fs.readFileSync('data/sources/step6-5d-game-spread-total-calibration-2026.json'));
const sets=new Map(contract.prior_decay.candidate_half_life_games.map(h=>[h,rows(games,h).filter(r=>features.has(r.id)).map(r=>({...r,xm:[r.xm[0]],xt:[r.xt[0]]}))]));
const folds=[];
for(const year of [2024,2025]){
 const baseline=fitCandidate(sets,contract,year),rs=sets.get(baseline.half_life_games);
 function fit(train,l){return ['m','t'].map(k=>ridge(train.map(r=>[r['x'+k][0],...features.get(r.id)[k]]),train.map(r=>r['y'+k]),l));}
 function predict(ms,rs){return rs.map(r=>({...r,predictedMargin:pred(ms[0],[[r.xm[0],...features.get(r.id).m]])[0],predictedTotal:pred(ms[1],[[r.xt[0],...features.get(r.id).t]])[0]}));}
 let best=null;for(const lambda of contract.walk_forward.ridge_lambda_grid){const m=metrics(predict(fit(rs.filter(r=>r.season<year-1),lambda),rs.filter(r=>r.season===year-1)));const error=m.margin_mae+m.total_mae;if(!best||error<best.error)best={lambda,error};}
 const predictions=predict(fit(rs.filter(r=>r.season<year),best.lambda),rs.filter(r=>r.season===year));
 const changed=new Set(history.filter(g=>+g.season===year).filter(g=>['home','away'].some(side=>{
 const team=canon(g[side+'_team']);const prev=history.filter(p=>+p.season===year&&+p.week<+g.week&&[canon(p.home_team),canon(p.away_team)].includes(team)).at(-1);
 return prev&&prev[canon(prev.home_team)===team?'home_qb_id':'away_qb_id']!==g[side+'_qb_id'];
 })).map(g=>g.game_id));
 const validation=rs.filter(r=>r.season===year-1),training=rs.filter(r=>r.season<year-1);
 const candidateResiduals=predict(fit(training,best.lambda),validation).map(r=>r.ym-r.predictedMargin);
 const baseFit=ridge(training.map(r=>r.xm),training.map(r=>r.ym),baseline.ridge_lambda);
 const baselineResiduals=validation.map(r=>r.ym-pred(baseFit,[r.xm])[0]);
 const rookies=new Set(history.filter(g=>+g.season===year&&['home','away'].some(side=>{
 const id=g[side+'_qb_id'];return +players.get(id)?.rookie_season===year&&!schedule.some(p=>prior(p,g)&&[p.home_qb_id,p.away_qb_id].includes(id));
 })).map(g=>g.game_id));
 const probability_validation={residual_source_season:year-1,method:'Empirical earlier-season out-of-sample margin residuals; rounded integer margins; three-outcome Brier score (lower is better). Hyperparameters selected on that earlier season.',groups:{}};
 for(const [name,ids] of [['all',null],['starter_changes',changed],['rookie_first_starts',rookies]])probability_validation.groups[name]={baseline:probabilityMetrics(baseline.predictions.filter(r=>!ids||ids.has(r.id)),baselineResiduals),candidate:probabilityMetrics(predictions.filter(r=>!ids||ids.has(r.id)),candidateResiduals)};
 folds.push({season:year,lambda:best.lambda,baseline:metrics(baseline.predictions),candidate:metrics(predictions),starter_change:{baseline:metrics(baseline.predictions.filter(r=>changed.has(r.id))),candidate:metrics(predictions.filter(r=>changed.has(r.id)))},probability_validation});
}
const target=schedule.find(g=>+g.season===2026&&+g.week===4&&canon(g.home_team)==='TB'&&canon(g.away_team)==='GB');
let scenario=null;
if(target){
 // Explicit pregame-announced starter scenario, never infer availability from
 // the result. Target scores are not read or used to select any parameter.
 const tg={...target,home_qb_id:'00-0041251',away_qb_id:'00-0036264'};
 features.set(tg.game_id,feature(tg));
 const prior2026=schedule.filter(g=>+g.season===2026&&+g.week<4&&g.home_score!==''&&g.away_score!=='').map(g=>({id:g.game_id,season:2026,week:+g.week,home:canon(g.home_team),away:canon(g.away_team),hs:+g.home_score,as:+g.away_score,hr:+g.home_rest,ar:+g.away_rest}));
 for(const g of schedule.filter(g=>+g.season===2026&&+g.week<4&&g.home_qb_id&&g.away_qb_id))features.set(g.game_id,feature(g));
 const expanded=[...games,...prior2026,{id:tg.game_id,season:2026,week:4,home:'TB',away:'GB',hs:0,as:0,hr:+tg.home_rest,ar:+tg.away_rest}];
 const forecastSets=new Map(contract.prior_decay.candidate_half_life_games.map(h=>[h,rows(expanded,h).filter(r=>features.has(r.id)).map(r=>({...r,xm:[r.xm[0]],xt:[r.xt[0]]}))]));
 const base=fitCandidate(forecastSets,contract,2026),rs=forecastSets.get(base.half_life_games);
 const fit=(train,l)=>['m','t'].map(k=>ridge(train.map(r=>[r['x'+k][0],...features.get(r.id)[k]]),train.map(r=>r['y'+k]),l));
 const predict=(ms,r)=>ms.map((m,i)=>{const k=i?'t':'m';return pred(m,[[r['x'+k][0],...features.get(r.id)[k]]])[0];});
 let best=null;for(const l of contract.walk_forward.ridge_lambda_grid){const ms=fit(rs.filter(r=>r.season<2025),l),val=rs.filter(r=>r.season===2025);const error=val.reduce((s,r)=>{const [m,t]=predict(ms,r);return s+Math.abs(r.ym-m)+Math.abs(r.yt-t);},0)/val.length;if(!best||error<best.error)best={l,error};}
 const models=fit(rs.filter(r=>r.season<2026),best.l),targetRow=rs.find(r=>r.id===tg.game_id);
 const [margin,total]=predict(models,targetRow),actualFeatures=features.get(tg.game_id);
 const mayfieldFeatures=feature({...tg,home_qb_id:'00-0034855'});
 features.set(tg.game_id,mayfieldFeatures);const [withMayfieldMargin,withMayfieldTotal]=predict(models,targetRow);features.set(tg.game_id,actualFeatures);
 // Export fitted score parameters for score-only shadow inference. No probability authority.
 if(process.argv.includes('--export-shadow-model')){
  const version='qb-score-shadow-2026-v1';
  const trainedThrough=history.filter(g=>+g.season<2026).map(g=>g.gameday).filter(Boolean).sort().at(-1)+'T23:59:59Z';
  fs.writeFileSync('data/probability/generated/quarterback-score-model-2026.json',JSON.stringify({version,status:'RESEARCH_ONLY',trained_through:trainedThrough,margin:models[0],total:models[1],probability_authority:false},null,2)+'\n');
  fs.writeFileSync('data/probability/generated/quarterback-score-scenario-features-2026.json',JSON.stringify({game_id:tg.game_id,model_version:version,cutoff:'Before 2026 Week 4',scenarios:[{player_id:'00-0041251',player_name:'Jalon Daniels',margin_features:[targetRow.xm[0],...actualFeatures.m],total_features:[targetRow.xt[0],...actualFeatures.t]},{player_id:'00-0034855',player_name:'Baker Mayfield',margin_features:[targetRow.xm[0],...mayfieldFeatures.m],total_features:[targetRow.xt[0],...mayfieldFeatures.t]}]},null,2)+'\n');
 }
 const labels=['prior starts','previous passing efficiency','observed dropbacks','rookie status','no observed dropbacks','same-team attempts','team sack rate','team rush efficiency','opponent passing defense','experience with sack rate','experience with rushing support','experience with opponent passing defense'];
 const differences=labels.map((name,i)=>({name,home_margin_change:(actualFeatures.m[i]-mayfieldFeatures.m[i])/models[0].sd[i+1]*models[0].beta[i+1]}));
 if(Math.abs(differences.reduce((s,d)=>s+d.home_margin_change,0)-(margin-withMayfieldMargin))>1e-8)throw new Error('QB contribution reconciliation failed');
 scenario={game:tg.game_id,cutoff:'Before Week 4; no Week 4 outcomes',status:'EXPERIMENTAL_NOT_A_BET',lambda:best.l,GB:(total-margin)/2,TB:(total+margin)/2,home_margin:margin,baseline:base.predictions.find(r=>r.id===tg.game_id)?.predictedMargin,mayfield_comparison:{GB:(withMayfieldTotal-withMayfieldMargin)/2,TB:(withMayfieldTotal+withMayfieldMargin)/2,home_margin:withMayfieldMargin},replacement_margin_change:margin-withMayfieldMargin,contributions:differences,interpretation:'Regression sensitivity with all team inputs held fixed, not a causal injury estimate. Three Daniels pass attempts do not establish his true NFL ability.'};
}
const report={status:'RESEARCH_ONLY',production_numeric_authority:0,automatic_promotion:false,scenario,
 limitation:'Conditional on known actual starter identity; not an archived pregame simulation. No 2026 outcomes used. Missing performance is explicitly flagged; unobserved EPA is not treated as a measured zero.',
 features:['prior starts','prior two-season passing EPA per dropback','prior two-season dropbacks','rookie','no observed dropbacks','prior two-season same-team attempts','team sack rate','team rush EPA/carry','opponent passing EPA allowed/dropback','starting-experience interactions with three support features'],
 scope:'QB-aware score model with team support. Starter-change cohort includes performance/rotation changes as well as injuries; it is not an injury-only cohort. Missing team coverage is not permitted in a production deployment.',folds,
 sources:['games.csv','players.csv',...statFiles,...teamFiles].map(file=>({file,sha256:createHash('sha256').update(fs.readFileSync(root+file)).digest('hex')}))};
fs.writeFileSync('data/probability/generated/quarterback-replacement-backtest-2026.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(folds,null,2));
