import fs from 'node:fs';

const shardFiles=fs.readdirSync('.').filter(f=>/^players\d+\.json$/.test(f)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
const players=shardFiles.flatMap(f=>JSON.parse(fs.readFileSync(f,'utf8')));
if(players.length!==162)throw new Error(`Expected 162 active players; found ${players.length}`);
const posByName=Object.fromEntries(players.map(p=>[p.n,p.p]));
const histDoc=JSON.parse(fs.readFileSync('historicalStats2026.json','utf8'));const hist=histDoc.players||{};
const aliasDoc=JSON.parse(fs.readFileSync('history-alias-reconciliation-audit.json','utf8'));
const historicalToActive=Object.fromEntries((aliasDoc.aliases_in_historical_file||[]).map(x=>[x.historical,x.active]));
const num=v=>{if(v==null)return 0;const s=String(v).trim();if(!s||s==='—'||s==='-')return 0;const n=Number(s.replace(/,/g,'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0};
const get=(r,ks)=>{for(const k of ks)if(r?.[k]!=null)return num(r[k]);return 0};
const gp=r=>get(r,['Games','GP','G'])||17;const season=r=>Number(r.Season??r.Year??0);
function ppr(row,pos){if(pos==='QB')return get(row,['Pass Yards','PassYds'])*.04+get(row,['Pass TD','PassTD'])*4-get(row,['INT'])*2+get(row,['Rush Yards','Rush Yds','RushYds'])*.1+get(row,['Rush TD','RushTD'])*6;return get(row,['Receptions','Rec','Rec.'])+get(row,['Receiving Yards','Rec Yds','RecYds','Rec. Yards'])*.1+get(row,['TD','Rec TD','RecTD','Rec. TD'])*6+get(row,['Rush Yards','Rush Yds','RushYds'])*.1+get(row,['Rush TD','RushTD'])*6}
const ppg=(r,p)=>ppr(r,p)/Math.max(1,gp(r));
function weightedPrior(rows,pos,targetSeason){const prior=rows.filter(r=>season(r)>0&&season(r)<targetSeason).sort((a,b)=>season(a)-season(b)).slice(-3);if(!prior.length)return null;const weights=prior.length===1?[1]:prior.length===2?[.35,.65]:[.2,.3,.5];let s=0,w=0,games=0;prior.forEach((r,i)=>{const x=ppg(r,pos);if(x>0){s+=x*weights[i];w+=weights[i];games+=gp(r)}});return w?{mean:s/w,games,seasons:prior.length}:null}
function buildExamples(targetSeason){const cohort=[];for(const [histName,rows] of Object.entries(hist)){const active=historicalToActive[histName]||histName;const pos=posByName[active];if(!pos)continue;const target=rows.find(r=>season(r)===targetSeason);if(!target)continue;const prior=weightedPrior(rows,pos,targetSeason);if(!prior)continue;const y=ppg(target,pos);if(!Number.isFinite(y)||y<=0)continue;cohort.push({name:active,pos,y,playerPrior:prior.mean,priorGames:prior.games})}const posMean={};for(const pos of ['QB','RB','WR','TE']){const xs=cohort.filter(x=>x.pos===pos).map(x=>x.playerPrior);if(xs.length)posMean[pos]=xs.reduce((a,b)=>a+b,0)/xs.length}return cohort.filter(x=>Number.isFinite(posMean[x.pos])).map(x=>({...x,positionPrior:posMean[x.pos]}))}
const predict=(x,k)=>(x.priorGames*x.playerPrior+k*x.positionPrior)/(x.priorGames+k);
const mae=rows=>rows.reduce((s,r)=>s+Math.abs(r.pred-r.y),0)/rows.length;
const rmse=rows=>Math.sqrt(rows.reduce((s,r)=>s+(r.pred-r.y)**2,0)/rows.length);
const train=buildExamples(2024),test=buildExamples(2025);if(train.length<20||test.length<30)throw new Error('Insufficient walk-forward samples');
const kGrid=[0.5,1,2,4,8,12,17,25,34,51,68];
const selectedK=kGrid.map(k=>{const rs=train.map(x=>({...x,pred:predict(x,k)}));return{k,mae:mae(rs),rmse:rmse(rs)}}).sort((a,b)=>a.mae-b.mae||a.rmse-b.rmse||a.k-b.k)[0].k;

function fitSigma(rows,predKey){const out={};for(const pos of ['QB','RB','WR','TE']){const rs=rows.filter(x=>x.pos===pos);if(rs.length<5)continue;const residuals=rs.map(x=>x.y-x[predKey]);const mean=residuals.reduce((a,b)=>a+b,0)/residuals.length;const variance=residuals.reduce((s,x)=>s+(x-mean)**2,0)/Math.max(1,residuals.length-1);out[pos]={n:rs.length,residual_mean:mean,sigma:Math.max(.25,Math.sqrt(variance))}}return out}
const trainRows=train.map(x=>({...x,baseline:x.playerPrior,bayes:predict(x,selectedK)}));
const testRows=test.map(x=>({...x,baseline:x.playerPrior,bayes:predict(x,selectedK)}));
const baselineSigma=fitSigma(trainRows,'baseline'),bayesSigma=fitSigma(trainRows,'bayes');
function erf(x){const sign=x<0?-1:1;x=Math.abs(x);const a1=.254829592,a2=-.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=.3275911;const t=1/(1+p*x);const y=1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);return sign*y}
const cdf=z=>.5*(1+erf(z/Math.sqrt(2)));
function distMetrics(predKey,sigmas){const zs={0.5:.67448975,0.8:1.28155157,0.9:1.64485363};const rows=testRows.map(x=>{const s=sigmas[x.pos];if(!s)return null;const pred=x[predKey];if(!Number.isFinite(pred))return null;const z=(x.y-pred)/s.sigma;return{...x,pred,sigma:s.sigma,z,pit:cdf(z)}}).filter(Boolean);if(!rows.length)throw new Error(`No distribution rows for ${predKey}`);let nll=0;for(const r of rows)nll+=.5*Math.log(2*Math.PI*r.sigma*r.sigma)+.5*r.z*r.z;nll/=rows.length;const coverage={},avgWidth={};for(const [nom,z] of Object.entries(zs)){coverage[nom]=rows.filter(r=>Math.abs(r.y-r.pred)<=z*r.sigma).length/rows.length;avgWidth[nom]=rows.reduce((s,r)=>s+2*z*r.sigma,0)/rows.length}const sorted=rows.map(r=>r.pit).sort((a,b)=>a-b);let ks=0;for(let i=0;i<sorted.length;i++){const f1=(i+1)/sorted.length,f0=i/sorted.length;ks=Math.max(ks,Math.abs(f1-sorted[i]),Math.abs(sorted[i]-f0))}const coverageError=Object.entries(coverage).reduce((s,[nom,v])=>s+Math.abs(v-Number(nom)),0)/Object.keys(coverage).length;return{n:rows.length,nll,pit_ks:ks,coverage_error:coverageError,coverage,average_interval_width:avgWidth}}
const baseline=distMetrics('baseline',baselineSigma),bayes=distMetrics('bayes',bayesSigma);
const nllImproved=bayes.nll<baseline.nll;const calibrationImproved=bayes.coverage_error<=baseline.coverage_error&&bayes.pit_ks<=baseline.pit_ks;
const conclusion=nllImproved&&calibrationImproved?'DISTRIBUTION_SIGNAL_PASSES_PHASE2':'DISTRIBUTION_SIGNAL_MIXED_OR_FAIL';
const report={generated_at:new Date().toISOString(),step:'STEP_3B_BAYESIAN_DISTRIBUTION_PHASE2',status:'SHADOW_ONLY',live_weight:0,selected_k_pseudogames:selectedK,leakage_controls:{training_target:2024,holdout_target:2025,sportsbook_used:false,adp_used:false,current_2026_outcomes_used:false},distribution_model:'Position-specific Gaussian residual distribution fit only on 2024 training residuals; frozen for 2025 holdout.',training_residuals:{baseline:baselineSigma,bayes:bayesSigma},holdout:{examples:testRows.length,baseline,bayes},conclusion,promotion_status:'BLOCKED_PENDING_SUBGROUP_AND_ROOKIE_VALIDATION_AND_USER_REVIEW',next_required_tests:['rookie/no-history prior validation','injury and regime-change subgroup audit','team/QB/coach change subgroup audit','extreme disagreement audit','full Guardrail QA']};
fs.mkdirSync('guardrails',{recursive:true});fs.writeFileSync('guardrails/step3b-bayesian-distribution-backtest.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({selectedK,baseline,bayes,conclusion},null,2));
