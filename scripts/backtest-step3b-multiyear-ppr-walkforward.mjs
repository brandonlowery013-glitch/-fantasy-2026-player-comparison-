import fs from 'node:fs';

const repo='https://github.com/nflverse/nflverse-data/releases/download/stats_player';
const seasons=[2018,2019,2020,2021,2022,2023,2024,2025];
const targets=[2021,2022,2023,2024,2025];
const kGrid=[0.5,1,2,4,8,12,17,25,34,51,68];

function csvParse(text){const lines=text.trim().split(/\r?\n/);const h=lines.shift().split(',');return lines.map(line=>{const a=[];let s='',q=false;for(let i=0;i<=line.length;i++){const c=line[i]??',';if(c==='"'){if(q&&line[i+1]==='"'){s+='"';i++;}else q=!q;}else if(c===','&&!q){a.push(s);s='';}else s+=c;}return Object.fromEntries(h.map((k,i)=>[k,a[i]??'']));});}
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const pick=(r,...ks)=>{for(const k of ks)if(r[k]!==undefined&&r[k]!=='')return r[k];return ''};
const posOf=r=>String(pick(r,'position','position_group')||'').toUpperCase();
const idOf=r=>String(pick(r,'player_id','gsis_id')||'');
const nameOf=r=>String(pick(r,'player_display_name','player_name','display_name')||idOf(r));
function weekPpr(r,pos){if(pos==='QB')return num(pick(r,'passing_yards'))*.04+num(pick(r,'passing_tds'))*4-num(pick(r,'interceptions'))*2+num(pick(r,'rushing_yards'))*.1+num(pick(r,'rushing_tds'))*6;return num(pick(r,'receptions'))+num(pick(r,'receiving_yards'))*.1+num(pick(r,'receiving_tds'))*6+num(pick(r,'rushing_yards'))*.1+num(pick(r,'rushing_tds'))*6;}

const live=[];for(let i=0;i<13;i++)live.push(...JSON.parse(fs.readFileSync(`players${i}.json`,'utf8')));
if(live.length!==162)throw new Error(`Expected 162 live players, found ${live.length}`);
const liveCounts={};for(const p of live)liveCounts[p.p]=(liveCounts[p.p]||0)+1;
for(const p of ['QB','RB','WR','TE'])if(!liveCounts[p])throw new Error(`Missing live ${p} count`);

const seasonRows={};
for(const season of seasons){const url=`${repo}/stats_player_week_${season}.csv`;const res=await fetch(url,{headers:{'user-agent':'fantasy-2026-validation'}});if(!res.ok)throw new Error(`${res.status} ${url}`);const rows=csvParse(await res.text()).filter(r=>String(pick(r,'season_type')||'REG').toUpperCase()==='REG');const by=new Map();for(const r of rows){const pos=posOf(r),id=idOf(r);if(!['QB','RB','WR','TE'].includes(pos)||!id)continue;const k=`${id}|${pos}`;if(!by.has(k))by.set(k,{id,name:nameOf(r),pos,season,games:new Set(),points:0});const x=by.get(k);x.games.add(Number(pick(r,'week')));x.points+=weekPpr(r,pos);}seasonRows[season]=[...by.values()].map(x=>({...x,games:x.games.size,ppg:x.games.size?x.points/x.games.size:0})).filter(x=>x.games>=4&&x.ppg>0);}

function priorFor(id,pos,target){const hist=[];for(const s of seasons.filter(s=>s<target).slice(-3)){const r=seasonRows[s].find(x=>x.id===id&&x.pos===pos);if(r)hist.push(r);}if(!hist.length)return null;const w=hist.length===1?[1]:hist.length===2?[.35,.65]:[.2,.3,.5];let sw=0,m=0,g=0;hist.forEach((r,i)=>{m+=r.ppg*w[i];sw+=w[i];g+=r.games;});return{mean:m/sw,games:g,seasons:hist.length};}
function examples(target){const all=[];for(const p of ['QB','RB','WR','TE']){const cand=[];for(const t of seasonRows[target].filter(x=>x.pos===p)){const pr=priorFor(t.id,p,target);if(pr)cand.push({...t,y:t.ppg,playerPrior:pr.mean,priorGames:pr.games,priorSeasons:pr.seasons});}cand.sort((a,b)=>b.playerPrior-a.playerPrior||b.priorGames-a.priorGames);all.push(...cand.slice(0,liveCounts[p]));}const pm={};for(const p of ['QB','RB','WR','TE']){const xs=all.filter(x=>x.pos===p).map(x=>x.playerPrior);pm[p]=xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;}return all.filter(x=>Number.isFinite(pm[x.pos])).map(x=>({...x,positionPrior:pm[x.pos]}));}
const pred=(x,k)=>(x.priorGames*x.playerPrior+k*x.positionPrior)/(x.priorGames+k);
const mae=(rs,key)=>rs.reduce((s,r)=>s+Math.abs(r[key]-r.y),0)/rs.length;
const rmse=(rs,key)=>Math.sqrt(rs.reduce((s,r)=>s+(r[key]-r.y)**2,0)/rs.length);
const pct=(b,a)=>100*(b-a)/b;
function score(rs,key){return{n:rs.length,mae:mae(rs,key),rmse:rmse(rs,key)}}
function evalRows(ex,k){const rs=ex.map(x=>({...x,baseline:x.playerPrior,bayes:pred(x,k),distance_above_prior:x.playerPrior-x.positionPrior}));const base=score(rs,'baseline'),bayes=score(rs,'bayes');const elite=[...rs].sort((a,b)=>b.distance_above_prior-a.distance_above_prior).slice(0,Math.max(8,Math.ceil(rs.length*.25)));return{rows:rs,baseline:base,bayes,mae_improvement_pct:pct(base.mae,bayes.mae),rmse_improvement_pct:pct(base.rmse,bayes.rmse),elite:{n:elite.length,baseline:score(elite,'baseline'),bayes:score(elite,'bayes'),mae_change_pct:-pct(score(elite,'baseline').mae,score(elite,'bayes').mae)}};}

const folds=[];
for(const target of targets){const tuneYear=target-1;if(tuneYear<2020)continue;const tune=examples(tuneYear),hold=examples(target);if(tune.length<40||hold.length<40)continue;const selected=kGrid.map(k=>({k,...evalRows(tune,k)})).sort((a,b)=>a.bayes.mae-b.bayes.mae||a.bayes.rmse-b.bayes.rmse)[0].k;const e=evalRows(hold,selected);folds.push({target_season:target,tuning_season:tuneYear,selected_k:selected,examples:e.rows.length,baseline:e.baseline,bayes:e.bayes,mae_improvement_pct:e.mae_improvement_pct,rmse_improvement_pct:e.rmse_improvement_pct,elite_quartile:e.elite});}
if(folds.length<4)throw new Error(`Need >=4 walk-forward folds, found ${folds.length}`);
const totalN=folds.reduce((s,f)=>s+f.examples,0);const wavg=k=>folds.reduce((s,f)=>s+f[k]*f.examples,0)/totalN;
const improved=folds.filter(f=>f.mae_improvement_pct>0&&f.rmse_improvement_pct>0).length;const eliteProtected=folds.filter(f=>f.elite_quartile.mae_change_pct<=5).length;
const report={generated_at:new Date().toISOString(),step:'STEP_3B_MULTIYEAR_PPR_WALKFORWARD',status:'SHADOW_ONLY',scoring:{reception:1,rushing_yard:.1,receiving_yard:.1,rushing_td:6,receiving_td:6,passing_yard:.04,passing_td:4,interception:-2},source:'nflverse weekly regular-season player statistics; fantasy PPR is recalculated from raw component stats, not read from a fantasy-points column',history_source_seasons:seasons,target_seasons:targets,selection_policy:{description:'For each historical target season, select only players with prior NFL history and take the top prior-projected players at each position using the current 162-player position counts. Selection uses only pre-target information.',live_position_counts:liveCounts,target_outcomes_used_for_selection:false},formula:'posterior_mean=(prior_games*player_history_ppg+k*position_prior_ppg)/(prior_games+k)',walkforward_policy:'For each target, k is tuned only on the immediately preceding season and then frozen for the target season.',folds,summary:{folds:folds.length,total_examples:totalN,folds_with_mae_and_rmse_improvement:improved,weighted_mae_improvement_pct:wavg('mae_improvement_pct'),weighted_rmse_improvement_pct:wavg('rmse_improvement_pct'),folds_meeting_elite_mae_protection_5pct:eliteProtected},promotion_allowed:false,live_weight:0,interpretation:'This tests robustness of generic position-average shrinkage across multiple historical fantasy-relevant walk-forward folds. Aggregate gains cannot override elite-subgroup degradation.'};
fs.mkdirSync('guardrails',{recursive:true});fs.writeFileSync('guardrails/step3b-multiyear-ppr-walkforward.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary,null,2));