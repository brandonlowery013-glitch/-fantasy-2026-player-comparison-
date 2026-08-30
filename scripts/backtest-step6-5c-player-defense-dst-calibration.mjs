import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const CONTRACT='data/sources/step6-5c-player-defense-dst-calibration-2026.json';
const OUT='data/probability/generated/step6-5c-player-defense-dst-calibration.json';
const YEARS=[2021,2022,2023,2024,2025];
const TARGETS=['QB','RB','WR','TE','DST_PROXY'];
const FEATURES=['points_allowed_mean','overall_epa_allowed_per_play','pass_epa_allowed_per_dropback','rush_epa_allowed_per_carry','pass_yards_allowed_per_attempt','rush_yards_allowed_per_carry','sack_rate','interception_rate','explosive_pass_20_rate_allowed','explosive_rush_10_rate_allowed'];
const canon=x=>({LA:'LAR',JAC:'JAX',WSH:'WAS'}[String(x||'').toUpperCase()]||String(x||'').toUpperCase());
const num=x=>{const n=Number(x);return Number.isFinite(n)?n:0;};
const finite=x=>Number.isFinite(x);
const div=(a,b)=>b>0?a/b:null;
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const priorWeight=(games,h)=>games<=0?1:Math.pow(2,-games/h);

function csvRows(text){
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);
  if(!lines.length)return {head:[],rows:[]};
  const parse=line=>{const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(c===','&&!q){out.push(cur);cur='';}else cur+=c;}out.push(cur);return out;};
  const head=parse(lines[0]);
  return {head,rows:lines.slice(1).map(line=>{const a=parse(line),o={};head.forEach((h,i)=>o[h]=a[i]??'');return o;})};
}
function pick(r,...ks){for(const k of ks)if(r[k]!==undefined&&r[k]!=='')return r[k];return '';}
function weekPpr(r,pos){
  if(pos==='QB')return num(pick(r,'passing_yards'))*.04+num(pick(r,'passing_tds'))*4-num(pick(r,'interceptions'))*2+num(pick(r,'rushing_yards'))*.1+num(pick(r,'rushing_tds'))*6;
  return num(pick(r,'receptions'))+num(pick(r,'receiving_yards'))*.1+num(pick(r,'receiving_tds'))*6+num(pick(r,'rushing_yards'))*.1+num(pick(r,'rushing_tds'))*6;
}
function pointsBucket(p){if(p===0)return 10;if(p<=6)return 7;if(p<=13)return 4;if(p<=20)return 1;if(p<=27)return 0;if(p<=34)return -1;return -4;}
function fumblesLost(r){
  const detailed=['sack_fumbles_lost','rushing_fumbles_lost','receiving_fumbles_lost'];
  const hasDetailed=detailed.some(k=>r[k]!==undefined&&r[k]!=='');
  if(hasDetailed)return detailed.reduce((s,k)=>s+num(r[k]),0);
  return num(pick(r,'fumbles_lost'));
}
function emptyAgg(){return {games:0,points:0,dropbacks:0,attempts:0,pass_yards:0,pass_int:0,sacks:0,pass_epa:0,carries:0,rush_yards:0,rush_epa:0,pass20:0,rush10:0};}
function gameAgg(r,points){const attempts=num(r.attempts),sacks=num(r.sacks_suffered),carries=num(r.carries);return {games:1,points,dropbacks:attempts+sacks,attempts,pass_yards:num(r.passing_yards),pass_int:num(r.passing_interceptions),sacks,pass_epa:num(r.passing_epa),carries,rush_yards:num(r.rushing_yards),rush_epa:num(r.rushing_epa),pass20:num(r.passing_20),rush10:num(r.rushing_10)};}
function addAgg(a,g){for(const k of Object.keys(a))a[k]+=g[k]||0;return a;}
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
function targetStat(){return {games:0,sum:0};}
function addTarget(a,v){a.games++;a.sum+=v;return a;}
function targetMean(a){return a?.games>0?a.sum/a.games:null;}
function scoreMap(scheduleRows){const m=new Map();for(const g of scheduleRows){if(String(g.game_type||'').toUpperCase()!=='REG')continue;const id=g.game_id;if(!id)continue;const h=canon(g.home_team),a=canon(g.away_team),hs=Number(g.home_score),as=Number(g.away_score);if(finite(hs)&&finite(as))m.set(id,{[h]:hs,[a]:as});}return m;}
function buildPlayerTargets(playerByYear){
  const out=new Map();
  for(const year of YEARS){for(const r of playerByYear.get(year).rows){if(Number(r.season)!==year||String(pick(r,'season_type')||'REG').toUpperCase()!=='REG')continue;const pos=String(pick(r,'position','position_group')).toUpperCase();if(!['QB','RB','WR','TE'].includes(pos))continue;const team=canon(pick(r,'recent_team','team')),week=Number(r.week);if(!team||!finite(week))continue;const key=`${year}:${week}:${team}`;if(!out.has(key))out.set(key,{QB:0,RB:0,WR:0,TE:0,seen:new Set()});const x=out.get(key);x[pos]+=weekPpr(r,pos);x.seen.add(pos);}}
  return out;
}
function buildRaw(teamByYear,playerByYear,scheduleRows){
  const scores=scoreMap(scheduleRows),playerTargets=buildPlayerTargets(playerByYear),seasonFeature=new Map(),seasonTarget=new Map(),gameRows=[];
  for(const year of YEARS){const parsed=teamByYear.get(year);const required=['season','week','team','season_type','game_id','opponent_team','attempts','passing_yards','passing_interceptions','sacks_suffered','passing_epa','carries','rushing_yards','rushing_epa','passing_20','rushing_10'];const missing=required.filter(x=>!parsed.head.includes(x));if(missing.length)throw new Error(`${year} team stats missing ${missing.join(',')}`);
    const rows=parsed.rows.filter(r=>Number(r.season)===year&&String(r.season_type).toUpperCase()==='REG');
    for(const r of rows){const offense=canon(r.team),defense=canon(r.opponent_team),points=scores.get(r.game_id)?.[offense];if(!finite(points)||!offense||!defense)continue;const pt=playerTargets.get(`${year}:${Number(r.week)}:${offense}`);if(!pt)continue;const targets={};for(const p of ['QB','RB','WR','TE'])targets[p]=pt.seen.has(p)?pt[p]:null;targets.DST_PROXY=num(r.sacks_suffered)+2*num(r.passing_interceptions)+2*fumblesLost(r)+pointsBucket(points);gameRows.push({season:year,week:Number(r.week),game_id:r.game_id,offense,defense,teamRow:r,points,targets});const fk=`${year}:${defense}`;if(!seasonFeature.has(fk))seasonFeature.set(fk,emptyAgg());addAgg(seasonFeature.get(fk),gameAgg(r,points));for(const t of TARGETS){const v=targets[t];if(!finite(v))continue;const tk=`${year}:${defense}:${t}`;if(!seasonTarget.has(tk))seasonTarget.set(tk,targetStat());addTarget(seasonTarget.get(tk),v);}}
  }
  const raw=[];
  for(const year of YEARS.filter(y=>y>=2022)){const curFeature=new Map(),curTarget=new Map();const rows=gameRows.filter(g=>g.season===year).sort((a,b)=>a.week-b.week||a.game_id.localeCompare(b.game_id)||a.offense.localeCompare(b.offense));for(const g of rows){const pf=seasonFeature.get(`${year-1}:${g.defense}`);if(!pf)continue;const cf=curFeature.get(g.defense)||emptyAgg();const priorTargets={},currentTargets={};for(const t of TARGETS){priorTargets[t]=targetMean(seasonTarget.get(`${year-1}:${g.defense}:${t}`));currentTargets[t]=targetMean(curTarget.get(`${g.defense}:${t}`));}raw.push({...g,priorFeature:{...pf},currentFeature:{...cf},games_before:cf.games,priorTargets,currentTargets});if(!curFeature.has(g.defense))curFeature.set(g.defense,emptyAgg());addAgg(curFeature.get(g.defense),gameAgg(g.teamRow,g.points));for(const t of TARGETS){const v=g.targets[t];if(!finite(v))continue;const k=`${g.defense}:${t}`;if(!curTarget.has(k))curTarget.set(k,targetStat());addTarget(curTarget.get(k),v);}}
  }
  return raw;
}
function featureValue(r,f,h){const p=metric(r.priorFeature,f),c=r.games_before>0?metric(r.currentFeature,f):p;if(!finite(p)||!finite(c))return null;const w=priorWeight(r.games_before,h);return w*p+(1-w)*c;}
function targetValue(r,t,h){const p=r.priorTargets[t];const c=r.games_before>0&&finite(r.currentTargets[t])?r.currentTargets[t]:p;if(!finite(p)||!finite(c))return null;const w=priorWeight(r.games_before,h);return w*p+(1-w)*c;}
function mae(y,p){return mean(y.map((v,i)=>Math.abs(v-p[i])));}
function rmse(y,p){return Math.sqrt(mean(y.map((v,i)=>(v-p[i])**2)));}
function fitLinear(xs,ys){const mx=mean(xs),my=mean(ys);let n=0,d=0;for(let i=0;i<xs.length;i++){n+=(xs[i]-mx)*(ys[i]-my);d+=(xs[i]-mx)**2;}const b=d>1e-12?n/d:0;return {a:my-b*mx,b};}
const predictLinear=(m,xs)=>xs.map(x=>m.a+m.b*x);
function solve(A,b){const n=A.length,M=A.map((r,i)=>[...r,b[i]]);for(let i=0;i<n;i++){let p=i;for(let j=i+1;j<n;j++)if(Math.abs(M[j][i])>Math.abs(M[p][i]))p=j;[M[i],M[p]]=[M[p],M[i]];if(Math.abs(M[i][i])<1e-12)M[i][i]=1e-12;const q=M[i][i];for(let k=i;k<=n;k++)M[i][k]/=q;for(let j=0;j<n;j++)if(j!==i){const f=M[j][i];for(let k=i;k<=n;k++)M[j][k]-=f*M[i][k];}}return M.map(r=>r[n]);}
function fitRidge(X,y,lambda){const p=X[0].length,n=X.length,mu=Array(p).fill(0),sd=Array(p).fill(0);for(let j=0;j<p;j++){mu[j]=mean(X.map(r=>r[j]));sd[j]=Math.sqrt(mean(X.map(r=>(r[j]-mu[j])**2)))||1;}const Z=X.map(r=>r.map((v,j)=>(v-mu[j])/sd[j])),ym=mean(y),yc=y.map(v=>v-ym),A=Array.from({length:p},()=>Array(p).fill(0)),b=Array(p).fill(0);for(let i=0;i<n;i++)for(let j=0;j<p;j++){b[j]+=Z[i][j]*yc[i];for(let k=0;k<p;k++)A[j][k]+=Z[i][j]*Z[i][k];}for(let j=0;j<p;j++)A[j][j]+=lambda;return {beta:solve(A,b),mu,sd,intercept:ym};}
const predictRidge=(m,X)=>X.map(r=>m.intercept+r.reduce((s,v,j)=>s+((v-m.mu[j])/m.sd[j])*m.beta[j],0));
function baselineRows(raw,seasons,t,h){return raw.filter(r=>seasons.includes(r.season)&&finite(r.targets[t])).map(r=>{const x=targetValue(r,t,h);return finite(x)?{x,y:r.targets[t]}:null;}).filter(Boolean);}
function richRows(raw,seasons,t,targetHalf,featureHalf,drop=null){const fs=FEATURES.filter(f=>f!==drop);return raw.filter(r=>seasons.includes(r.season)&&finite(r.targets[t])).map(r=>{const base=targetValue(r,t,targetHalf),fx=fs.map(f=>featureValue(r,f,featureHalf[f]));return finite(base)&&fx.every(finite)?{x:[base,...fx],y:r.targets[t]}:null;}).filter(Boolean);}
function selectTargetHalf(raw,fitYears,valYear,t,grid){let best=null;for(const h of grid){const tr=baselineRows(raw,fitYears,t,h),va=baselineRows(raw,[valYear],t,h);if(tr.length<200||va.length<200)continue;const m=fitLinear(tr.map(z=>z.x),tr.map(z=>z.y)),p=predictLinear(m,va.map(z=>z.x)),s=mae(va.map(z=>z.y),p);if(!best||s<best.mae)best={half_life_games:h,mae:s};}if(!best)throw new Error(`no target half-life ${t}`);return best;}
function selectFeatureHalf(raw,fitYears,valYear,t,targetHalf,grid){const out={};for(const f of FEATURES){let best=null;for(const h of grid){const tr=raw.filter(r=>fitYears.includes(r.season)&&finite(r.targets[t])).map(r=>{const x=featureValue(r,f,h);return finite(x)?{x,y:r.targets[t]}:null;}).filter(Boolean),va=raw.filter(r=>r.season===valYear&&finite(r.targets[t])).map(r=>{const x=featureValue(r,f,h);return finite(x)?{x,y:r.targets[t]}:null;}).filter(Boolean);if(tr.length<200||va.length<200)continue;const m=fitLinear(tr.map(z=>z.x),tr.map(z=>z.y)),p=predictLinear(m,va.map(z=>z.x)),s=mae(va.map(z=>z.y),p);if(!best||s<best.mae)best={half_life_games:h,mae:s};}if(!best)throw new Error(`no feature half-life ${t}/${f}`);out[f]=best;}return out;}
function oneTargetFold(raw,contract,t,testYear){
  const valYear=testYear-1,fitYears=[...new Set(raw.map(r=>r.season))].filter(y=>y>=2022&&y<valYear),grid=contract.walk_forward.candidate_half_life_games;
  const targetPick=selectTargetHalf(raw,fitYears,valYear,t,grid),featurePick=selectFeatureHalf(raw,fitYears,valYear,t,targetPick.half_life_games,grid),featureHalf=Object.fromEntries(Object.entries(featurePick).map(([k,v])=>[k,v.half_life_games]));
  let bestLambda=null;for(const lambda of contract.walk_forward.ridge_lambda_grid){const tr=richRows(raw,fitYears,t,targetPick.half_life_games,featureHalf),va=richRows(raw,[valYear],t,targetPick.half_life_games,featureHalf);if(tr.length<200||va.length<200)continue;const m=fitRidge(tr.map(z=>z.x),tr.map(z=>z.y),lambda),p=predictRidge(m,va.map(z=>z.x)),s=mae(va.map(z=>z.y),p);if(!bestLambda||s<bestLambda.mae)bestLambda={lambda,mae:s};}if(!bestLambda)throw new Error(`no ridge lambda ${t}`);
  const trainYears=[...fitYears,valYear],trB=baselineRows(raw,trainYears,t,targetPick.half_life_games),teB=baselineRows(raw,[testYear],t,targetPick.half_life_games),bm=fitLinear(trB.map(z=>z.x),trB.map(z=>z.y)),bp=predictLinear(bm,teB.map(z=>z.x));
  const trR=richRows(raw,trainYears,t,targetPick.half_life_games,featureHalf),teR=richRows(raw,[testYear],t,targetPick.half_life_games,featureHalf),rm=fitRidge(trR.map(z=>z.x),trR.map(z=>z.y),bestLambda.lambda),rp=predictRidge(rm,teR.map(z=>z.x));
  const b={mae:mae(teB.map(z=>z.y),bp),rmse:rmse(teB.map(z=>z.y),bp)},rich={mae:mae(teR.map(z=>z.y),rp),rmse:rmse(teR.map(z=>z.y),rp)},ablation={};
  for(const drop of FEATURES){const tr=richRows(raw,trainYears,t,targetPick.half_life_games,featureHalf,drop),te=richRows(raw,[testYear],t,targetPick.half_life_games,featureHalf,drop),m=fitRidge(tr.map(z=>z.x),tr.map(z=>z.y),bestLambda.lambda),p=predictRidge(m,te.map(z=>z.x));ablation[drop]={mae_without:mae(te.map(z=>z.y),p),delta_mae_vs_full:mae(te.map(z=>z.y),p)-rich.mae};}
  return {target:t,test_season:testYear,inner_validation_season:valYear,parameter_fit_seasons:fitYears,selected_target_half_life_games:targetPick.half_life_games,selected_feature_half_life_games:featureHalf,selected_ridge_lambda:bestLambda.lambda,test:{n:teR.length,baseline:b,rich,mae_improvement:b.mae-rich.mae,rmse_improvement:b.rmse-rich.rmse},ablation,_pooled:{y:teR.map(z=>z.y),base:bp,rich:rp}};
}
async function load(){
  const s=await fetch('https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv',{headers:{'user-agent':'fantasy-2026-step6-5c'}});if(!s.ok)throw new Error(`schedule ${s.status}`);const schedule=csvRows(await s.text()).rows,team=new Map(),player=new Map();
  for(const y of YEARS){const [tr,pr]=await Promise.all([fetch(`https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_${y}.csv`,{headers:{'user-agent':'fantasy-2026-step6-5c'}}),fetch(`https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${y}.csv`,{headers:{'user-agent':'fantasy-2026-step6-5c'}})]);if(!tr.ok)throw new Error(`team ${y} ${tr.status}`);if(!pr.ok)throw new Error(`player ${y} ${pr.status}`);team.set(y,csvRows(await tr.text()));player.set(y,csvRows(await pr.text()));}
  return {schedule,team,player};
}
async function main(){
  const contract=JSON.parse(fs.readFileSync(path.join(ROOT,CONTRACT),'utf8'));
  if(process.argv.includes('--self-test')){const a=priorWeight(0,4),b=priorWeight(4,4),c=priorWeight(8,4);if(a!==1||Math.abs(b-.5)>1e-12||Math.abs(c-.25)>1e-12)throw new Error('decay self-test');if(pointsBucket(0)!==10||pointsBucket(6)!==7||pointsBucket(35)!==-4)throw new Error('DST bucket self-test');if(Math.abs(weekPpr({passing_yards:250,passing_tds:2,interceptions:1,rushing_yards:20,rushing_tds:0},'QB')-18)>1e-12)throw new Error('PPR self-test');console.log(JSON.stringify({result:'PASS',mode:'SELF_TEST',prior_weights:{game0:a,game4:b,game8:c}}));return;}
  const {schedule,team,player}=await load(),raw=buildRaw(team,player,schedule);if(raw.length<1800)throw new Error(`raw rows too small ${raw.length}`);
  const results={};for(const t of TARGETS){const folds=contract.walk_forward.held_out_test_seasons.map(y=>oneTargetFold(raw,contract,t,y)),y=folds.flatMap(f=>f._pooled.y),base=folds.flatMap(f=>f._pooled.base),rich=folds.flatMap(f=>f._pooled.rich);for(const f of folds)delete f._pooled;const pooled={n:y.length,baseline:{mae:mae(y,base),rmse:rmse(y,base)},rich:{mae:mae(y,rich),rmse:rmse(y,rich)}};pooled.mae_improvement=pooled.baseline.mae-pooled.rich.mae;pooled.rmse_improvement=pooled.baseline.rmse-pooled.rich.rmse;const stable=folds.every(f=>f.test.mae_improvement>0&&f.test.rmse_improvement>0);results[t]={folds,pooled,promotion_candidate:stable&&pooled.mae_improvement>0&&pooled.rmse_improvement>0,production_numeric_authority:0};}
  const promoted=TARGETS.filter(t=>results[t].promotion_candidate),out={schema_version:'STEP6_5C_PLAYER_DEFENSE_DST_CALIBRATION_RESULT_1.0.0',status:promoted.length?'SHADOW_POSITION_SPECIFIC_CANDIDATES_REVIEW_REQUIRED':'SHADOW_NO_PROMOTION',sportsbook_inputs_used:false,history_seasons:YEARS,raw_game_rows:raw.length,targets:results,promotion_candidates:promoted,blanket_matchup_weight_authorized:false,production_numeric_authority:0,automatic_promotion:false,dst_scope:'DST_PROXY excludes defensive/special-teams touchdowns; missing TD history is unknown, not zero.',governance_note:'Each target is judged separately. No cross-position blanket defensive adjustment is authorized, and no passing shadow result self-promotes.'};
  fs.mkdirSync(path.dirname(path.join(ROOT,OUT)),{recursive:true});fs.writeFileSync(path.join(ROOT,OUT),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify({result:'PASS',rows:raw.length,promotion_candidates:promoted,summary:Object.fromEntries(TARGETS.map(t=>[t,results[t].pooled]))},null,2));
}
await main();
