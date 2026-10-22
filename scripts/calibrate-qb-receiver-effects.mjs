import fs from 'node:fs';
const root=process.env.QB_REFERENCE_FILE||'data/probability/generated/historical-reference-population-2021-2025.json';
const data=JSON.parse(fs.readFileSync(root)),metrics=['targets','receptions','receiving_yards','receiving_tds'],positions=['WR','TE','RB'];
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
const groups=new Map();for(const r of data.rows){if(!r.played)continue;const id=[r.season,r.week,r.team].join('|');if(!groups.has(id))groups.set(id,[]);groups.get(id).push(r);}
const games=[];for(const rows of groups.values()){
 const qbs=rows.filter(r=>r.position==='QB'&&r.pass_attempts>0).sort((a,b)=>b.pass_attempts-a.pass_attempts),qb=qbs[0],attempts=qbs.reduce((a,q)=>a+q.pass_attempts,0);
 if(!qb||qb.pass_attempts<15||qb.pass_attempts/attempts<.85)continue;
 const all=rows.filter(r=>positions.includes(r.position));
 games.push({season:qb.season,week:qb.week,team:qb.team,qb:qb.player,qb_key:norm(qb.player),pass_attempts:qb.pass_attempts,receptions:all.reduce((n,r)=>n+(r.receptions||0),0),receiving_yards:qb.pass_yards,receiving_tds:qb.pass_tds,rush_yards:qb.rush_yards||0,positions:Object.fromEntries(positions.map(p=>[p,Object.fromEntries(metrics.map(k=>[k,all.filter(r=>r.position===p).reduce((n,r)=>n+(r[k]||0),0)]))]))});
}
games.sort((a,b)=>a.season-b.season||a.week-b.week||a.team.localeCompare(b.team));
const average=(rows,k)=>rows.length?rows.reduce((n,r)=>n+r[k],0)/rows.length:0;
function samples(k){const history=[],byQb=new Map(),byTeam=new Map(),out=[];for(const g of games){
 const qHistory=byQb.get(g.qb_key)||[],teamHistory=byTeam.get(g.team)||[],prior=teamHistory.at(-1);
 const league=Object.fromEntries(['pass_attempts',...metrics.slice(1)].map(m=>[m,average(history,m)]));
 const profile=name=>{const rows=byQb.get(name)||[];return Object.fromEntries(['pass_attempts',...metrics.slice(1)].map(m=>[m,(rows.reduce((n,r)=>n+r[m],0)+k*league[m])/(rows.length+k)]));};
 if(g.season>=2022&&prior&&prior.qb_key!==g.qb_key&&teamHistory.length>=4&&history.length>=100){const current=profile(g.qb_key),previous=profile(prior.qb_key),last=teamHistory.slice(-6);for(const pos of positions)for(const stat of metrics){const metric=stat==='targets'?'pass_attempts':stat,base=last.reduce((n,r)=>n+r.positions[pos][stat],0)/last.length;if(base<=0||previous[metric]<=0)continue;out.push({season:g.season,week:g.week,team:g.team,pos,stat,base,actual:g.positions[pos][stat],x:current[metric]/previous[metric]-1,new_qb:g.qb,prior_qb:prior.qb});}}
 history.push(g);byQb.set(g.qb_key,[...qHistory,g]);byTeam.set(g.team,[...teamHistory,g]);
 }return out;}
const fit=a=>{let xy=0,xx=0;for(const r of a){const x=r.base*r.x;xy+=x*(r.actual-r.base);xx+=x*x;}return xx?Math.max(0,Math.min(2,xy/xx)):0;};
const error=(a,beta)=>a.length?a.reduce((n,r)=>n+(r.actual-r.base*(1+beta*r.x))**2,0)/a.length:null;
const effects={};
for(const pos of positions){effects[pos]={};for(const stat of metrics){const candidates=[3,5,10,20,40].map(k=>{const rows=samples(k).filter(r=>r.pos===pos&&r.stat===stat),train=rows.filter(r=>r.season<2024),validation=rows.filter(r=>r.season===2024),beta=fit(train);return {k,rows,beta,validation_mse:error(validation,beta),validation_baseline_mse:error(validation,0)};});candidates.sort((a,b)=>a.validation_mse-b.validation_mse);const selected=candidates[0],train=selected.rows.filter(r=>r.season<=2024),holdout=selected.rows.filter(r=>r.season===2025),beta=selected.validation_mse<selected.validation_baseline_mse?fit(train):0;effects[pos][stat]={shrinkage_games:selected.k,beta,training_samples:train.length,holdout_samples:holdout.length,holdout_mse:error(holdout,beta),holdout_baseline_mse:error(holdout,0),validation_improvement:1-selected.validation_mse/selected.validation_baseline_mse};}}
for(const position of Object.values(effects))for(const effect of Object.values(position)){effect.fitted_beta=effect.beta;effect.release_gate=effect.beta===0?'NO_VALIDATED_EFFECT':effect.holdout_mse<=effect.holdout_baseline_mse?'HOLDOUT_PASS':'HOLDOUT_NOT_IMPROVED_MEAN_DISABLED';if(effect.release_gate==='HOLDOUT_NOT_IMPROVED_MEAN_DISABLED')effect.beta=0;}
const profiles={};for(const g of games){const p=profiles[g.qb_key]||{name:g.qb,games:0,pass_attempts:0,receptions:0,receiving_yards:0,receiving_tds:0,sum_squares:{}};p.games++;for(const m of ['pass_attempts',...metrics.slice(1)]){p[m]+=g[m];p.sum_squares[m]=(p.sum_squares[m]||0)+g[m]**2;}profiles[g.qb_key]=p;}
const league={games:games.length,...Object.fromEntries(['pass_attempts',...metrics.slice(1)].map(m=>[m,average(games,m)]))};
league.variance=Object.fromEntries(['pass_attempts',...metrics.slice(1)].map(m=>[m,average(games.map(g=>({[m]:(g[m]-league[m])**2})),m)]));
const out={version:'qb-receiver-effects-2026-v1',mode:'SHADOW_ONLY',sportsbook_inputs_used:false,trained_through:2024,profiles_through:2025,training_window:[2022,2023,2024],selection_window:2024,holdout_window:2025,source_urls:data.sources.filter(x=>x.type!=='players').map(x=>x.url),effects,profiles,league,limitations:['Historical primary passer is identified retrospectively; this is a conditional QB scenario evaluation, not a test of historical pregame starter identification.','Receiver target shares and non-passing workloads are preserved; learned position-specific response weights adjust only receiving production.','A QB with little or no NFL history uses a disclosed league starter prior and larger uncertainty.','Coefficients are fitted and selected without the 2025 holdout. A final safety gate disables mean effects that worsen the holdout; this gated policy still needs forward validation.']};
fs.writeFileSync(new URL('../data/probability/generated/qb-receiver-effects-2026.json',import.meta.url),JSON.stringify(out));console.log(JSON.stringify({games:games.length,quarterbacks:Object.keys(profiles).length,effects},null,2));
