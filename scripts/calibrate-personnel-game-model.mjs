import fs from 'node:fs';
import {unitFeatures} from '../lib/personnel-matchup.mjs';
import {parseCSV,canon,rows,ridge,pred,mae} from '../lib/game-scoring-calibration.mjs';
const dir=(process.env.PERSONNEL_MODEL_CACHE||'.cache/personnel-game-model')+'/',read=f=>parseCSV(fs.readFileSync(dir+f,'utf8')),num=x=>Number(x)||0,key=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g,'').replace(/(jr|iii|ii)$/,'');
const games=read('games.csv').filter(g=>g.game_type==='REG'&&+g.season>=2020&&+g.season<=2026&&g.home_score!==''&&g.away_score!=='').sort((a,b)=>+a.season-+b.season||+a.week-+b.week);
const byTeam=new Map(),byQB=new Map(),inj=new Map(),snaps=new Map(),stats=new Map();
const push=(m,k,v)=>{if(!m.has(k))m.set(k,[]);m.get(k).push(v);};
for(let y=2020;y<=2026;y++){
 for(const r of read(`stats_team_week_${y}.csv`).filter(r=>r.season_type==='REG'))push(byTeam,canon(r.team),r);
 for(const r of read(`stats_player_week_${y}.csv`).filter(r=>r.season_type==='REG')){push(stats,canon(r.team),r);if(r.position==='QB')push(byQB,r.player_id,r);}
 if(y<=2024){for(const r of read(`injuries_${y}.csv`).filter(r=>r.game_type==='REG'&&/^out$/i.test(r.report_status)))push(inj,`${y}:${r.week}:${canon(r.team)}`,r);for(const r of read(`snap_counts_${y}.csv`).filter(r=>r.game_type==='REG'))push(snaps,`${y}:${r.week}:${canon(r.team)}`,r);}
}
const prior=(r,g)=>(+r.season<+g.season||+r.season===+g.season&&+r.week<+g.week)&&+r.season>=+g.season-1;
const sum=(rs,k)=>rs.reduce((s,r)=>s+num(r[k]),0),ratio=(rs,k,ds)=>sum(rs,k)/(ds.reduce((s,d)=>s+sum(rs,d),0)||1);
const fields=['qb_epa_relative_to_team','qb_experience','qb_no_history','pass_efficiency_matchup','rush_efficiency_matchup','protection_vs_pressure','pass_explosive_matchup','pace','lost_OL','lost_receiving','lost_rushing','lost_front','lost_secondary','OL_loss_x_pressure','secondary_loss_x_explosives'];
function feature(g,team,opp,id){
 const own=(byTeam.get(canon(team))||[]).filter(r=>prior(r,g)),def=(byTeam.get(canon(opp))||[]).filter(r=>prior(r,g));
 if(!own.length||!def.length)return null;
 const defRows=games.filter(r=>prior(r,g)&&(canon(r.home_team)===canon(opp)||canon(r.away_team)===canon(opp))).map(r=>(byTeam.get(canon(r.home_team)===canon(opp)?canon(r.away_team):canon(r.home_team))||[]).find(x=>x.game_id===r.game_id)).filter(Boolean);
 const recent=own.slice(-8),od=defRows.slice(-8),q=(byQB.get(id)||[]).filter(r=>prior(r,g)),db=sum(q,'attempts')+sum(q,'sacks_suffered'),epa=sum(q,'passing_epa')/(db+100),ownEPA=ratio(recent,'passing_epa',['attempts','sacks_suffered']);
 const starts=games.filter(r=>prior(r,g)&&(r.home_qb_id===id||r.away_qb_id===id)).length;
 const passRate=(sum(recent,'attempts')+sum(recent,'sacks_suffered'))/(sum(recent,'attempts')+sum(recent,'sacks_suffered')+sum(recent,'carries')||1);
 const pressure=ratio(od,'sacks_suffered',['attempts','sacks_suffered']),protection=ratio(recent,'sacks_suffered',['attempts','sacks_suffered']);
 const explosive=ratio(recent,'passing_20',['attempts']),allowedExp=ratio(od,'passing_20',['attempts']);
 const before=own.filter(r=>+r.season===+g.season).slice(-4),lost=[0,0,0,0,0],names=[];
 for(const r of inj.get(`${g.season}:${g.week}:${canon(team)}`)||[]){
  // Final weekly reports only; future-dated report updates cannot enter this game.
  if(Date.parse(r.date_modified)>Date.parse(g.gameday+'T'+g.gametime+new Intl.DateTimeFormat('en',{timeZone:'America/New_York',timeZoneName:'shortOffset'}).formatToParts(new Date(g.gameday+'T17:00:00Z')).find(x=>x.type==='timeZoneName').value.replace('GMT','').replace(/^(-\d)$/,'$1:00').replace('-4:00','-04:00').replace('-5:00','-05:00')))continue;
  const sk=key(r.full_name),snapRows=before.flatMap(w=>snaps.get(`${w.season}:${w.week}:${canon(team)}`)||[]).filter(s=>key(s.player)===sk),n=before.length||1;
  const off=sum(snapRows,'offense_pct')/n,def=sum(snapRows,'defense_pct')/n,pos=r.position;
  if(/^(T|G|C|OT|OG|OL)$/.test(pos))lost[0]+=off/5;
  if(/^(WR|TE)$/.test(pos))lost[1]+=off/3;
  if(/^(RB|FB)$/.test(pos))lost[2]+=off;
  if(/^(DE|DT|NT|DL|LB|ILB|OLB)$/.test(pos))lost[3]+=def/7;
  if(/^(CB|S|FS|SS|DB)$/.test(pos))lost[4]+=def/4;
  names.push({name:r.full_name,position:pos,offense_share:off,defense_share:def});
 }
 return {x:unitFeatures({offense:{passEPA:ownEPA,rushEPA:ratio(recent,'rushing_epa',['carries']),passRate,sackRate:protection,explosive,plays:(sum(recent,'attempts')+sum(recent,'sacks_suffered')+sum(recent,'carries'))/recent.length},opponentDefense:{passEPA:ratio(od,'passing_epa',['attempts','sacks_suffered']),rushEPA:ratio(od,'rushing_epa',['carries']),sackRate:pressure,explosive:allowedExp},opponentOffense:{explosive:ratio(def.slice(-8),'passing_20',['attempts'])},qb:{epa,starts,dropbacks:db},losses:lost}),names};
}
const mapped=games.map(g=>({id:g.game_id,season:+g.season,week:+g.week,home:canon(g.home_team),away:canon(g.away_team),hs:+g.home_score,as:+g.away_score,hr:0,ar:0}));
const base=rows(mapped,4);const lookup=new Map(games.map(g=>[g.game_id,g]));const samples=[];
for(const r of base){const g=lookup.get(r.id);if(!g.home_qb_id||!g.away_qb_id)continue;const h=feature(g,g.home_team,g.away_team,g.home_qb_id),a=feature(g,g.away_team,g.home_team,g.away_qb_id);if(!h||!a)continue;samples.push({...r,baseM:[r.xm[0]],baseT:[r.xt[0]],xm:[r.xm[0],...h.x.map((v,i)=>v-a.x[i])],xt:[r.xt[0],...h.x.map((v,i)=>v+a.x[i])],homeFeatures:h,awayFeatures:a});}
function constrained(X,y,l){const m=ridge(X,y,l);if(X[0].length===1)return m;const neg=new Set([3,6,9,10,11,12,13,14,15]),pos=new Set([0,1,2,4,5,7]);const Z=X.map(x=>x.map((v,j)=>(v-m.mu[j])/m.sd[j]));for(let iteration=0;iteration<400;iteration++){let delta=0;for(let j=0;j<m.beta.length;j++){let v=0,d=l;for(let i=0;i<Z.length;i++){let r=y[i]-m.a;for(let k=0;k<m.beta.length;k++)if(k!==j)r-=Z[i][k]*m.beta[k];v+=Z[i][j]*r;d+=Z[i][j]**2;}const old=m.beta[j];m.beta[j]=neg.has(j)?Math.min(0,v/d):pos.has(j)?Math.max(0,v/d):v/d;delta+=Math.abs(old-m.beta[j]);}if(delta<1e-8)break;}return m;}
const fit=(rs,l,full)=>({margin:constrained(rs.map(r=>full?r.xm:r.baseM),rs.map(r=>r.ym),l),total:ridge(rs.map(r=>full?r.xt:r.baseT),rs.map(r=>r.yt),l)});
const forecasts=(rs,m,full)=>rs.map(r=>({...r,m:pred(m.margin,[full?r.xm:r.baseM])[0],t:pred(m.total,[full?r.xt:r.baseT])[0]}));
const metrics=rs=>({games:rs.length,margin_mae:mae(rs.map(r=>r.ym),rs.map(r=>r.m)),total_mae:mae(rs.map(r=>r.yt),rs.map(r=>r.t)),team_score_mae:rs.reduce((s,r)=>s+Math.abs(r.hs-(r.m+r.t)/2)+Math.abs(r.as-(r.t-r.m)/2),0)/(2*rs.length)});
const tr=samples.filter(r=>r.season<=2022),va=samples.filter(r=>r.season===2023);let best;
for(const l of [10,100,1000]){const m=metrics(forecasts(va,fit(tr,l,true),true)),loss=m.margin_mae+m.total_mae;if(!best||loss<best.loss)best={l,loss};}
const training=samples.filter(r=>r.season<=2023),test=samples.filter(r=>r.season===2024),candidate=fit(training,best.l,true),baseline=fit(training,100,false),c=forecasts(test,candidate,true),b=forecasts(test,baseline,false);
const residuals=forecasts(va,fit(tr,best.l,true),true).map(r=>[r.hs-(r.m+r.t)/2,r.as-(r.t-r.m)/2]);
const sourceLimitations=['QB historical evaluation is conditional on actual starter identity, not proof of archived pregame starter identification.','Public historical injury reports end in 2024; a full 2025 injury holdout is unavailable.','Injury data is final weekly Out status; snap weights use only earlier weeks, and matchup statistics use earlier games.','No market prices or future box scores are predictors.','Historical accuracy does not establish a profitable betting edge.'];
const baselineResiduals=forecasts(va,fit(tr,100,false),false).map(r=>r.ym-r.m);const candResiduals=residuals.map(r=>r[0]-r[1]);const win=(m,rs)=>rs.filter(e=>Math.round(m+e)>0).length/rs.length;const brier=(rs,res)=>rs.reduce((s,r)=>s+(win(r.m,res)-+(r.ym>0))**2,0)/rs.length;
const report={moneyline_brier:{baseline:brier(b,baselineResiduals),candidate:brier(c,candResiduals)},generated_at:new Date().toISOString(),candidate:'joint-personnel-matchup-v2',selection:'2020-22 fit; 2023 selects ridge from fixed 10/100/1000 grid; 2024 exploratory evaluation (v1 inspected before sign/feature corrections; forward validation still required)',lambda:best.l,features:fields,baseline:metrics(b),candidate_metrics:metrics(c),limitations:sourceLimitations};
fs.writeFileSync('data/probability/generated/personnel-game-validation-2026.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));

fs.writeFileSync('data/probability/generated/personnel-game-model-2026.json',JSON.stringify({version:'personnel-matchup-conditional-v2',status:'EXPERIMENTAL_CONDITIONAL',sportsbook_inputs_used:false,training_through_season:2024,model:fit(samples.filter(r=>r.season<=2024),best.l,true).margin,features:['baseline_home_margin',...fields],margin_residuals:candResiduals,validation:report,not_a_proven_betting_edge:true},null,2));
