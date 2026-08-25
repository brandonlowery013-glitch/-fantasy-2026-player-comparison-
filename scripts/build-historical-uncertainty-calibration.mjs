import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const input=path.join(root,'data/probability/generated/historical-reference-population-2021-2025.json');
if(!fs.existsSync(input)) throw new Error('Run build-historical-reference-population.mjs first');
const data=JSON.parse(fs.readFileSync(input,'utf8'));
const rows=data.rows.filter(r=>r.played!==false);
const outDir=path.join(root,'data/probability/generated');
fs.mkdirSync(outDir,{recursive:true});
fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});

const statsByPos={QB:['pass_yards','pass_tds','rush_yards'],RB:['rush_yards','targets','receiving_yards','receptions'],WR:['targets','receiving_yards','receptions'],TE:['targets','receiving_yards','receptions']};
const tuneSeasons=new Set([2023,2024]);
const evalSeason=2025;
const kGrid=[5,10,20,40,80];
const eps=1e-9;
const z={q10:-1.281551566,q25:-0.67448975,q50:0,q75:0.67448975,q90:1.281551566};
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const variance=a=>{if(a.length<2)return null;const m=avg(a);return a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1)};
const sd=a=>{const v=variance(a);return v==null?null:Math.sqrt(v)};
const quantile=(a,q)=>{if(!a.length)return null;const b=[...a].sort((x,y)=>x-y),p=(b.length-1)*q,lo=Math.floor(p),hi=Math.ceil(p);return lo===hi?b[lo]:b[lo]+(b[hi]-b[lo])*(p-lo)};
const erf=x=>{const sign=x<0?-1:1,ax=Math.abs(x),t=1/(1+0.3275911*ax);const y=1-(((((1.061405429*t-1.453152027)*t+1.421413741)*t-0.284496736)*t+0.254829592)*t)*Math.exp(-ax*ax);return sign*y};
const cdf=x=>0.5*(1+erf(x/Math.SQRT2));
const logloss=(p,y)=>-(y*Math.log(Math.max(eps,Math.min(1-eps,p)))+(1-y)*Math.log(Math.max(eps,Math.min(1-eps,1-p))));
const gaussianNll=(y,mu,sigma)=>0.5*Math.log(2*Math.PI*sigma*sigma)+((y-mu)**2)/(2*sigma*sigma);
const keyTime=r=>r.season*100+r.week;
const validValue=(r,stat)=>{const v=Number(r[stat]);return Number.isFinite(v)?v:null};

rows.sort((a,b)=>keyTime(a)-keyTime(b)||String(a.player_id).localeCompare(String(b.player_id)));
const weeks=[];let current=null;
for(const r of rows){const t=keyTime(r);if(!current||current.t!==t){current={t,season:r.season,week:r.week,rows:[]};weeks.push(current)}current.rows.push(r)}

const fresh=()=>({n:0,sum:0,sumsq:0});
const add=(s,x)=>{s.n++;s.sum+=x;s.sumsq+=x*x};
const mean=s=>s.n?s.sum/s.n:null;
const sdev=s=>{if(s.n<2)return null;const v=(s.sumsq-(s.sum*s.sum)/s.n)/(s.n-1);return Math.sqrt(Math.max(0,v))};
function makePred(posS,playerS,k){
  if(posS.n<50)return null;
  const pm=mean(posS),ps=sdev(posS)||0,n=playerS?.n||0,w=n/(n+k),xm=n?mean(playerS):pm,xs=n>=2?(sdev(playerS)||ps):ps;
  const mu=w*xm+(1-w)*pm;
  const sigma=Math.max(Math.sqrt(Math.max(eps,w*xs*xs+(1-w)*ps*ps)),Math.max(1e-6,ps*0.35));
  return {mu,sigma,n,position_mean:pm,position_sd:ps,weight:w};
}

function walkAll(pos,stat){
  const posS=fresh(),players=new Map();
  const tune=Object.fromEntries(kGrid.map(k=>[k,[]]));
  const evals=Object.fromEntries(kGrid.map(k=>[k,[]]));
  for(const wk of weeks){
    const targets=wk.rows.filter(r=>r.position===pos);
    for(const target of targets){
      const y=validValue(target,stat);if(y==null)continue;
      const ps=players.get(target.player_id)||fresh();
      for(const k of kGrid){
        const p=makePred(posS,ps,k);if(!p)continue;
        const rec={...p,y,season:target.season,week:target.week,player_id:target.player_id};
        if(tuneSeasons.has(target.season))tune[k].push(rec);
        if(target.season===evalSeason)evals[k].push(rec);
      }
    }
    for(const r of targets){
      const x=validValue(r,stat);if(x==null)continue;
      add(posS,x);if(!players.has(r.player_id))players.set(r.player_id,fresh());add(players.get(r.player_id),x);
    }
  }
  return {tune,evals};
}

const caches={};
const tuning={};
for(const [pos,stats] of Object.entries(statsByPos)){
  caches[pos]={};tuning[pos]={};
  for(const stat of stats){
    const w=caches[pos][stat]=walkAll(pos,stat);
    const candidates=kGrid.map(k=>({k,sample:w.tune[k].length,gaussian_nll:w.tune[k].length?avg(w.tune[k].map(p=>gaussianNll(p.y,p.mu,p.sigma))):Infinity})).sort((a,b)=>a.gaussian_nll-b.gaussian_nll);
    tuning[pos][stat]={selected_k:candidates[0].k,candidates};
  }
}

const calibration={};
let totalEval=0;
for(const [pos,stats] of Object.entries(statsByPos)){
  calibration[pos]={};
  for(const stat of stats){
    const k=tuning[pos][stat].selected_k,preds=caches[pos][stat].evals[k];totalEval+=preds.length;
    const cover={q10:0,q25:0,q50:0,q75:0,q90:0},briers={q10:[],q25:[],q50:[],q75:[],q90:[]},logs={q10:[],q25:[],q50:[],q75:[],q90:[]},pitBins=Array(10).fill(0);
    for(const p of preds){
      const pit=Math.max(0,Math.min(.999999,cdf((p.y-p.mu)/p.sigma)));pitBins[Math.floor(pit*10)]++;
      for(const [q,zz] of Object.entries(z)){const prob=Number(q.slice(1))/100,threshold=p.mu+zz*p.sigma,obs=p.y<=threshold?1:0;if(obs)cover[q]++;briers[q].push((prob-obs)**2);logs[q].push(logloss(prob,obs));}
    }
    const n=preds.length;
    calibration[pos][stat]={selected_k:k,sample:n,mae:n?avg(preds.map(p=>Math.abs(p.y-p.mu))):null,rmse:n?Math.sqrt(avg(preds.map(p=>(p.y-p.mu)**2))):null,gaussian_nll:n?avg(preds.map(p=>gaussianNll(p.y,p.mu,p.sigma))):null,quantile_coverage:Object.fromEntries(Object.entries(cover).map(([q,c])=>[q,n?c/n:null])),quantile_brier:Object.fromEntries(Object.entries(briers).map(([q,a])=>[q,a.length?avg(a):null])),quantile_log_loss:Object.fromEntries(Object.entries(logs).map(([q,a])=>[q,a.length?avg(a):null])),pit_deciles:pitBins,note:'2025 holdout only; each prediction uses games completed before the target week. Same-week games never leak into one another.'};
  }
}

const priorSummary={},playerPriors=[];
for(const [pos,stats] of Object.entries(statsByPos)){
  priorSummary[pos]={};const posRows=rows.filter(r=>r.position===pos),ids=[...new Set(posRows.map(r=>r.player_id))];
  for(const stat of stats){const a=posRows.map(r=>validValue(r,stat)).filter(v=>v!=null);priorSummary[pos][stat]={sample:a.length,mean:avg(a),sd:sd(a),q10:quantile(a,.10),q25:quantile(a,.25),median:quantile(a,.50),q75:quantile(a,.75),q90:quantile(a,.90)}}
  for(const id of ids){const pr=posRows.filter(r=>r.player_id===id),rec={player_id:id,player:pr[0]?.player||id,position:pos,stats:{}};for(const stat of stats){const a=pr.map(r=>validValue(r,stat)).filter(v=>v!=null),k=tuning[pos][stat].selected_k,pp=priorSummary[pos][stat],n=a.length,w=n/(n+k),m=n?avg(a):pp.mean,s=n>=2?(sd(a)||pp.sd):pp.sd;rec.stats[stat]={games:n,shrinkage_k:k,player_weight:w,raw_mean:m,raw_sd:s,shrunk_mean:w*m+(1-w)*pp.mean,shrunk_sd:Math.sqrt(w*s*s+(1-w)*pp.sd*pp.sd)}}playerPriors.push(rec)}
}

const generatedAt=new Date().toISOString();
const limitations=['This is a distribution-calibration baseline, not a historical sportsbook backtest.','No archived sportsbook line or price is used here.','Historical projection snapshots are not yet available, so this tests a walk-forward football-history forecast rather than reconstruction of our exact historical projection model.','Gaussian likelihood is a baseline scoring family for tuning shrinkage; count-stat distribution families still require dedicated comparison.','Routes, broad-population injury detail, and broad-population red-zone context are not yet fully enriched.'];
const output={schema_version:'1.1.0',generated_at:generatedAt,mode:'SHADOW_ONLY',actionable:false,purpose:'Football-only historical uncertainty priors and first walk-forward distribution calibration baseline.',history_window:[2021,2022,2023,2024,2025],tuning_window:[2023,2024],evaluation_window:[2025],sportsbook_inputs_used:false,reference_players:data.reference_unique_players,reference_player_games:data.row_count,stat_policy:statsByPos,tuning,position_priors:priorSummary,player_priors:playerPriors,holdout_calibration:calibration,limitations};
const blocked=[];
if(data.live_player_universe_count!==162)blocked.push('live player universe changed');
if(data.reference_unique_players<500)blocked.push('reference population too small');
if(totalEval<1000)blocked.push(`holdout sample too small: ${totalEval}`);
for(const [pos,stats] of Object.entries(calibration))for(const [stat,r] of Object.entries(stats)){if(r.sample<100)blocked.push(`${pos} ${stat} holdout sample <100`);for(const q of Object.keys(z))if(r.quantile_coverage[q]==null)blocked.push(`${pos} ${stat} ${q} missing`)}
const report={generated_at:generatedAt,result:blocked.length?'BLOCKED':'PASS',mode:'SHADOW_ONLY',actionable:false,total_2025_holdout_predictions:totalEval,blocked,sportsbook_inputs_used:false,tuning_summary:Object.fromEntries(Object.entries(tuning).map(([pos,s])=>[pos,Object.fromEntries(Object.entries(s).map(([st,x])=>[st,x.selected_k]))])),calibration,limitations};
fs.writeFileSync(path.join(outDir,'historical-uncertainty-priors-2021-2025.json'),JSON.stringify(output,null,2)+'\n');
fs.writeFileSync(path.join(root,'guardrails/historical-uncertainty-calibration-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({result:report.result,total_2025_holdout_predictions:totalEval,selected_k:report.tuning_summary,blocked},null,2));
if(blocked.length)process.exit(1);
