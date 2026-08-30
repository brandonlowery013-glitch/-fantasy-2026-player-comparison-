import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const CONTRACT='data/sources/step6-5b-defensive-walkforward-decay-calibration-2026.json';
const OUT='data/probability/generated/step6-5b-defensive-walkforward-decay-calibration.json';
const SCHEDULE_URL='https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv';
const YEARS=[2021,2022,2023,2024,2025];
const FEATURES=['points_allowed_mean','overall_epa_allowed_per_play','pass_epa_allowed_per_dropback','rush_epa_allowed_per_carry','pass_yards_allowed_per_attempt','rush_yards_allowed_per_carry','sack_rate','interception_rate','explosive_pass_20_rate_allowed','explosive_rush_10_rate_allowed'];
const RICH=FEATURES;
const canon=x=>({LA:'LAR',JAC:'JAX',WSH:'WAS'}[String(x||'').toUpperCase()]||String(x||'').toUpperCase());
const num=x=>{const n=Number(x);return Number.isFinite(n)?n:0;};
const div=(a,b)=>b>0?a/b:null;

function csvRows(text){
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean); if(!lines.length)return {head:[],rows:[]};
  const parse=line=>{const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(c===','&&!q){out.push(cur);cur='';}else cur+=c;}out.push(cur);return out;};
  const head=parse(lines[0]); return {head,rows:lines.slice(1).map(line=>{const a=parse(line),o={};head.forEach((h,i)=>o[h]=a[i]);return o;})};
}
function emptyAgg(){return {games:0,points:0,dropbacks:0,attempts:0,pass_yards:0,pass_int:0,sacks:0,pass_epa:0,carries:0,rush_yards:0,rush_epa:0,pass20:0,rush10:0};}
function cloneAgg(a){return {...a};}
function addAgg(a,g){for(const k of Object.keys(a))a[k]+=g[k]||0;return a;}
function gameAgg(r,points){const attempts=num(r.attempts),sacks=num(r.sacks_suffered),carries=num(r.carries);return {games:1,points,dropbacks:attempts+sacks,attempts,pass_yards:num(r.passing_yards),pass_int:num(r.passing_interceptions),sacks,pass_epa:num(r.passing_epa),carries,rush_yards:num(r.rushing_yards),rush_epa:num(r.rushing_epa),pass20:num(r.passing_20),rush10:num(r.rushing_10)};}
function metric(a,f){
  if(!a)return null;
  if(f==='points_allowed_mean')return div(a.points,a.games);
  if(f==='overall_epa_allowed_per_play')return div(a.pass_epa+a.rush_epa,a.dropbacks+a.carries);
  if(f==='pass_epa_allowed_per_dropback')return div(a.pass_epa,a.dropbacks);
  if(f==='rush_epa_allowed_per_carry')return div(a.rush_epa,a.carries);
  if(f==='pass_yards_allowed_per_attempt')return div(a.pass_yards,a.attempts);
  if(f==='rush_yards_allowed_per_carry')return div(a.rush_yards,a.carries);
  if(f==='sack_rate')return div(a.sacks,a.dropbacks);
  if(f==='interception_rate')return div(a.pass_int,a.attempts);
  if(f==='explosive_pass_20_rate_allowed')return div(a.pass20,a.attempts);
  if(f==='explosive_rush_10_rate_allowed')return div(a.rush10,a.carries);
  return null;
}
function scoreMap(scheduleRows){const m=new Map();for(const g of scheduleRows){if(String(g.game_type||'').toUpperCase()!=='REG')continue;const id=g.game_id;if(!id)continue;const h=canon(g.home_team),a=canon(g.away_team),hs=Number(g.home_score),as=Number(g.away_score);if(Number.isFinite(hs)&&Number.isFinite(as))m.set(id,{[h]:hs,[a]:as});}return m;}
function buildRaw(statsByYear,scheduleRows){
  const scores=scoreMap(scheduleRows),seasonAgg=new Map();
  for(const year of YEARS){const parsed=statsByYear.get(year);const required=['season','week','team','season_type','game_id','opponent_team','attempts','passing_yards','passing_interceptions','sacks_suffered','passing_epa','carries','rushing_yards','rushing_epa','passing_20','rushing_10'];const missing=required.filter(x=>!parsed.head.includes(x));if(missing.length)throw new Error(`${year} missing ${missing.join(',')}`);for(const r of parsed.rows){if(Number(r.season)!==year||String(r.season_type).toUpperCase()!=='REG')continue;const off=canon(r.team),def=canon(r.opponent_team),pts=scores.get(r.game_id)?.[off];if(!Number.isFinite(pts))continue;const key=`${year}:${def}`;if(!seasonAgg.has(key))seasonAgg.set(key,emptyAgg());addAgg(seasonAgg.get(key),gameAgg(r,pts));}}
  const raw=[];
  for(const year of YEARS.filter(y=>y>=2022)){const current=new Map();const rows=statsByYear.get(year).rows.filter(r=>Number(r.season)===year&&String(r.season_type).toUpperCase()==='REG').sort((a,b)=>Number(a.week)-Number(b.week)||String(a.game_id).localeCompare(String(b.game_id)));for(const r of rows){const off=canon(r.team),def=canon(r.opponent_team),pts=scores.get(r.game_id)?.[off];if(!Number.isFinite(pts))continue;const prior=seasonAgg.get(`${year-1}:${def}`);if(!prior)continue;const cur=current.get(def)||emptyAgg();raw.push({season:year,week:Number(r.week),defense:def,offense:off,game_id:r.game_id,target:pts,games_before:cur.games,prior:cloneAgg(prior),current:cloneAgg(cur)});if(!current.has(def))current.set(def,emptyAgg());addAgg(current.get(def),gameAgg(r,pts));}}
  return raw;
}
const priorWeight=(games,h)=>games<=0?1:Math.pow(2,-games/h);
function value(row,f,h){const p=metric(row.prior,f),c=row.games_before>0?metric(row.current,f):p;if(!Number.isFinite(p)||!Number.isFinite(c))return null;const w=priorWeight(row.games_before,h);return w*p+(1-w)*c;}
function mean(a){return a.reduce((s,x)=>s+x,0)/a.length;}
function mae(y,p){return mean(y.map((v,i)=>Math.abs(v-p[i])));}
function rmse(y,p){return Math.sqrt(mean(y.map((v,i)=>(v-p[i])**2)));}
function fitLinear(xs,ys){const mx=mean(xs),my=mean(ys);let n=0,d=0;for(let i=0;i<xs.length;i++){n+=(xs[i]-mx)*(ys[i]-my);d+=(xs[i]-mx)**2;}const b=d>1e-12?n/d:0;return {a:my-b*mx,b};}
function predictLinear(m,xs){return xs.map(x=>m.a+m.b*x);}
function solve(A,b){const n=A.length,M=A.map((r,i)=>[...r,b[i]]);for(let i=0;i<n;i++){let p=i;for(let j=i+1;j<n;j++)if(Math.abs(M[j][i])>Math.abs(M[p][i]))p=j;[M[i],M[p]]=[M[p],M[i]];if(Math.abs(M[i][i])<1e-12)M[i][i]=1e-12;const q=M[i][i];for(let k=i;k<=n;k++)M[i][k]/=q;for(let j=0;j<n;j++)if(j!==i){const f=M[j][i];for(let k=i;k<=n;k++)M[j][k]-=f*M[i][k];}}return M.map(r=>r[n]);}
function fitRidge(X,y,lambda){const p=X[0].length,n=X.length,mu=Array(p).fill(0),sd=Array(p).fill(0);for(let j=0;j<p;j++){mu[j]=mean(X.map(r=>r[j]));sd[j]=Math.sqrt(mean(X.map(r=>(r[j]-mu[j])**2)))||1;}const Z=X.map(r=>r.map((v,j)=>(v-mu[j])/sd[j])),ym=mean(y),yc=y.map(v=>v-ym),A=Array.from({length:p},()=>Array(p).fill(0)),b=Array(p).fill(0);for(let i=0;i<n;i++)for(let j=0;j<p;j++){b[j]+=Z[i][j]*yc[i];for(let k=0;k<p;k++)A[j][k]+=Z[i][j]*Z[i][k];}for(let j=0;j<p;j++)A[j][j]+=lambda;return {beta:solve(A,b),mu,sd,intercept:ym};}
function predictRidge(m,X){return X.map(r=>m.intercept+r.reduce((s,v,j)=>s+((v-m.mu[j])/m.sd[j])*m.beta[j],0));}
function rowsFor(raw,seasons,features,half){return raw.filter(r=>seasons.includes(r.season)).map(r=>{const x=features.map(f=>value(r,f,half[f]));return x.every(Number.isFinite)?{x,y:r.target,row:r}:null;}).filter(Boolean);}
function pickHalfLives(raw,fitSeasons,valSeason,halfGrid){const out={};for(const f of FEATURES){let best=null;for(const h of halfGrid){const tr=rowsFor(raw,fitSeasons,[f],{[f]:h}),va=rowsFor(raw,[valSeason],[f],{[f]:h});if(tr.length<100||va.length<100)continue;const m=fitLinear(tr.map(z=>z.x[0]),tr.map(z=>z.y)),score=mae(va.map(z=>z.y),predictLinear(m,va.map(z=>z.x[0])));if(!best||score<best.mae)best={half_life_games:h,mae:score};}if(!best)throw new Error(`unable to select half life for ${f}`);out[f]=best;}return out;}
function fold(raw,contract,testSeason){
  const val=testSeason-1,fitSeasons=[...new Set(raw.map(r=>r.season))].filter(y=>y>=2022&&y<val),halfGrid=contract.prior_transition.candidate_half_life_games;
  const picked=pickHalfLives(raw,fitSeasons,val,halfGrid),half=Object.fromEntries(Object.entries(picked).map(([k,v])=>[k,v.half_life_games]));
  const trBase=rowsFor(raw,fitSeasons,['points_allowed_mean'],half),vaBase=rowsFor(raw,[val],['points_allowed_mean'],half);const baseInner=fitLinear(trBase.map(z=>z.x[0]),trBase.map(z=>z.y));
  let bestLambda=null;for(const lambda of contract.walk_forward.ridge_lambda_grid){const tr=rowsFor(raw,fitSeasons,RICH,half),va=rowsFor(raw,[val],RICH,half),m=fitRidge(tr.map(z=>z.x),tr.map(z=>z.y),lambda),score=mae(va.map(z=>z.y),predictRidge(m,va.map(z=>z.x)));if(!bestLambda||score<bestLambda.mae)bestLambda={lambda,mae:score};}
  const trainYears=[...fitSeasons,val],trainBase=rowsFor(raw,trainYears,['points_allowed_mean'],half),testBase=rowsFor(raw,[testSeason],['points_allowed_mean'],half),bm=fitLinear(trainBase.map(z=>z.x[0]),trainBase.map(z=>z.y)),bp=predictLinear(bm,testBase.map(z=>z.x[0]));
  const trainRich=rowsFor(raw,trainYears,RICH,half),testRich=rowsFor(raw,[testSeason],RICH,half),rm=fitRidge(trainRich.map(z=>z.x),trainRich.map(z=>z.y),bestLambda.lambda),rp=predictRidge(rm,testRich.map(z=>z.x));
  const fullMae=mae(testRich.map(z=>z.y),rp),ablation={};for(const drop of RICH.filter(f=>f!=='points_allowed_mean')){const fs=RICH.filter(f=>f!==drop),tr=rowsFor(raw,trainYears,fs,half),te=rowsFor(raw,[testSeason],fs,half),m=fitRidge(tr.map(z=>z.x),tr.map(z=>z.y),bestLambda.lambda),p=predictRidge(m,te.map(z=>z.x));ablation[drop]={mae_without:mae(te.map(z=>z.y),p),delta_mae_vs_full:mae(te.map(z=>z.y),p)-fullMae};}
  return {test_season:testSeason,inner_validation_season:val,parameter_fit_seasons:fitSeasons,selected_half_life_games:half,selected_half_life_validation_mae:Object.fromEntries(Object.entries(picked).map(([k,v])=>[k,v.mae])),selected_ridge_lambda:bestLambda.lambda,inner_validation:{baseline_mae:mae(vaBase.map(z=>z.y),predictLinear(baseInner,vaBase.map(z=>z.x[0]))),rich_mae:bestLambda.mae},test:{n:testRich.length,baseline:{mae:mae(testBase.map(z=>z.y),bp),rmse:rmse(testBase.map(z=>z.y),bp)},rich:{mae:fullMae,rmse:rmse(testRich.map(z=>z.y),rp)}},ablation,_pooled:{y:testRich.map(z=>z.y),base:bp,rich:rp}};
}
async function load(){const scheduleRes=await fetch(SCHEDULE_URL,{headers:{'user-agent':'fantasy-2026-defense-decay'}});if(!scheduleRes.ok)throw new Error(`schedule fetch ${scheduleRes.status}`);const schedules=csvRows(await scheduleRes.text()).rows;const stats=new Map();for(const y of YEARS){const url=`https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_${y}.csv`;const r=await fetch(url,{headers:{'user-agent':'fantasy-2026-defense-decay'}});if(!r.ok)throw new Error(`team stats ${y} fetch ${r.status}`);stats.set(y,csvRows(await r.text()));}return {stats,schedules};}
async function main(){
  const contract=JSON.parse(fs.readFileSync(path.join(ROOT,CONTRACT),'utf8'));
  if(process.argv.includes('--self-test')){const w0=priorWeight(0,4),w4=priorWeight(4,4),w8=priorWeight(8,4);if(w0!==1||Math.abs(w4-.5)>1e-12||Math.abs(w8-.25)>1e-12)throw new Error('decay self-test failed');const m=fitLinear([1,2,3],[2,4,6]);if(Math.abs(predictLinear(m,[4])[0]-8)>1e-8)throw new Error('linear self-test failed');console.log(JSON.stringify({result:'PASS',mode:'SELF_TEST',prior_weights:{game0:w0,game4:w4,game8:w8}}));return;}
  const {stats,schedules}=await load(),raw=buildRaw(stats,schedules);if(raw.length<1800)throw new Error(`walk-forward rows unexpectedly small: ${raw.length}`);
  const folds=contract.walk_forward.held_out_test_seasons.map(y=>fold(raw,contract,y));const y=folds.flatMap(f=>f._pooled.y),base=folds.flatMap(f=>f._pooled.base),rich=folds.flatMap(f=>f._pooled.rich);for(const f of folds)delete f._pooled;
  const pooled={n:y.length,baseline:{mae:mae(y,base),rmse:rmse(y,base)},rich:{mae:mae(y,rich),rmse:rmse(y,rich)}};pooled.mae_improvement=pooled.baseline.mae-pooled.rich.mae;pooled.mae_improvement_pct=pooled.mae_improvement/pooled.baseline.mae;
  const stable=folds.every(f=>f.test.rich.mae<=f.test.baseline.mae),candidate=pooled.rich.mae<pooled.baseline.mae&&stable;
  const latest=folds.find(f=>f.test_season===Math.max(...contract.walk_forward.held_out_test_seasons));
  const out={schema_version:'STEP6_5B_DEFENSIVE_WALKFORWARD_DECAY_RESULT_1.0.0',status:candidate?'SHADOW_PROMOTION_CANDIDATE_REVIEW_REQUIRED':'SHADOW_NO_PROMOTION',sportsbook_inputs_used:false,historical_seasons:YEARS,raw_walkforward_rows:raw.length,folds,pooled,candidate_2026_prior_decay_half_life_games:latest.selected_half_life_games,candidate_2026_ridge_lambda:latest.selected_ridge_lambda,promotion_candidate:candidate,production_numeric_authority:0,automatic_promotion:false,governance_note:'Backtest results do not self-promote. Production authority remains zero pending governance, anti-double-counting review, and downstream player-position calibration.'};
  fs.mkdirSync(path.dirname(path.join(ROOT,OUT)),{recursive:true});fs.writeFileSync(path.join(ROOT,OUT),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({result:'PASS',rows:raw.length,pooled,promotion_candidate:candidate,candidate_half_lives:out.candidate_2026_prior_decay_half_life_games},null,2));
}
await main();
