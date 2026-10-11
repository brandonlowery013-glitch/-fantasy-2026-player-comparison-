import {canon, mean, mae, rmse, rows as scoringRows, ridge, pred} from './game-scoring-calibration.mjs';

// All features below describe completed, earlier weeks. Target-game box scores,
// actual starters, market prices, and end-of-season rosters are never predictors.
const required = ['attempts','sacks_suffered','carries','passing_epa','rushing_epa','passing_20','rushing_10','passing_interceptions'];
const number = v => v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v);
const empty = () => ({games:0, plays:0, db:0, carries:0, passEPA:0, rushEPA:0, sacks:0, p20:0, r10:0, ints:0, attempts:0});
function stat(r) {
  if (required.some(k=>number(r[k])===null)) return null;
  const db=+r.attempts + +r.sacks_suffered, carries=+r.carries;
  if (!(db>0 && carries>0)) return null;
  return {games:1,plays:db+carries,db,carries,passEPA:+r.passing_epa,rushEPA:+r.rushing_epa,sacks:+r.sacks_suffered,p20:+r.passing_20,r10:+r.rushing_10,ints:+r.passing_interceptions,attempts:+r.attempts};
}
const add = (a,b) => { for(const k of Object.keys(a)) a[k]+=b[k]; };
function rates(s) {
  if (!s?.games || !s.db || !s.carries || !s.attempts) return null;
  return {plays:s.plays/s.games,passRate:s.db/s.plays,passEPA:s.passEPA/s.db,rushEPA:s.rushEPA/s.carries,sackRate:s.sacks/s.db,passExplosive:s.p20/s.attempts,rushExplosive:s.r10/s.carries,intRate:s.ints/s.attempts};
}
function blend(prior,current,h) {
  const p=rates(prior),c=rates(current); if(!p) return null; if(!c) return p;
  const w=2**(-current.games/h);
  return Object.fromEntries(Object.keys(p).map(k=>[k,w*p[k]+(1-w)*c[k]]));
}
function continuity(priorPlayers,lastPlayers) {
  // Week 1 has no observed current-season deployment. Explicit missing flag,
  // not an assertion that the entire old roster returned.
  if(!lastPlayers?.length || !priorPlayers?.length) return [0,0,0,1];
  return ['attempts','carries','targets'].map(key=>{
    const known=new Set(priorPlayers.filter(r=>(number(r[key])??0)>0).map(r=>r.player_id));
    const total=lastPlayers.reduce((s,r)=>s+(number(r[key])??0),0);
    return total>0?lastPlayers.reduce((s,r)=>s+(known.has(r.player_id)?number(r[key])??0:0),0)/total:0;
  }).concat(0);
}

export const matchupFeatures=['plays_per_game','pass_rate','pass_efficiency_matchup','rush_efficiency_matchup','pass_protection_pressure','explosive_pass_matchup','explosive_rush_matchup','interception_matchup'];
export const personnelFeatures=['observed_passing_continuity','observed_rushing_continuity','observed_target_continuity','deployment_unobserved'];
function matchup(o,d) {
  return [(o.plays+d.plays)/2,o.passRate,o.passRate*(o.passEPA+d.passEPA),
    (1-o.passRate)*(o.rushEPA+d.rushEPA),o.sackRate*d.sackRate,
    o.passExplosive*d.passExplosive,o.rushExplosive*d.rushExplosive,o.intRate*d.intRate];
}

export function buildEvidence(games,teamRows,playerRows,h) {
  const finalIds=new Set(games.map(g=>g.id));
  const teamIndex=new Map(), playerIndex=new Map(), seasonOff=new Map(),seasonDef=new Map(),seasonPlayers=new Map();
  for(const r of teamRows) {
    if(r.season_type!=='REG'||!finalIds.has(r.game_id)) continue;
    const s=stat(r); if(!s) continue;
    const team=canon(r.team),opp=canon(r.opponent_team),key=`${r.game_id}:${team}`;
    if(teamIndex.has(key)) throw new Error(`Duplicate team stats ${key}`);
    teamIndex.set(key,s);
    for(const [m,k] of [[seasonOff,`${r.season}:${team}`],[seasonDef,`${r.season}:${opp}`]]) {
      if(!m.has(k)) m.set(k,empty()); add(m.get(k),s);
    }
  }
  for(const r of playerRows) {
    if(r.season_type!=='REG'||!finalIds.has(r.game_id)||!r.player_id) continue;
    const team=canon(r.team||r.recent_team);
    for(const [m,k] of [[playerIndex,`${r.game_id}:${team}`],[seasonPlayers,`${r.season}:${team}`]]) {
      if(!m.has(k)) m.set(k,[]); m.get(k).push(r);
    }
  }
  const result=new Map(),currentOff=new Map(),currentDef=new Map(),last=new Map();
  const groups=new Map();
  for(const g of [...games].sort((a,b)=>a.season-b.season||a.week-b.week)) {
    const key=`${g.season}:${g.week}`; if(!groups.has(key)) groups.set(key,[]); groups.get(key).push(g);
  }
  // Snapshot the whole week before updating anything, including opponent stats.
  for(const weekGames of groups.values()) {
    for(const g of weekGames) {
      const home=canon(g.home),away=canon(g.away),hk=`${g.season}:${home}`,ak=`${g.season}:${away}`;
      const ho=blend(seasonOff.get(`${g.season-1}:${home}`),currentOff.get(hk),h),
        hd=blend(seasonDef.get(`${g.season-1}:${home}`),currentDef.get(hk),h),
        ao=blend(seasonOff.get(`${g.season-1}:${away}`),currentOff.get(ak),h),
        ad=blend(seasonDef.get(`${g.season-1}:${away}`),currentDef.get(ak),h);
      if(ho&&hd&&ao&&ad) {
        const hx=matchup(ho,ad),ax=matchup(ao,hd),
          hp=continuity(seasonPlayers.get(`${g.season-1}:${home}`),last.get(hk)),
          ap=continuity(seasonPlayers.get(`${g.season-1}:${away}`),last.get(ak));
        result.set(g.id,{margin:hx.map((v,i)=>v-ax[i]),total:hx.map((v,i)=>v+ax[i]),
          personnelMargin:hp.map((v,i)=>v-ap[i]),personnelTotal:hp.map((v,i)=>v+ap[i]),
          trace:{home:{offense:ho,opponent_defense:ad,observed_games:currentOff.get(hk)?.games||0,continuity:hp},
            away:{offense:ao,opponent_defense:hd,observed_games:currentOff.get(ak)?.games||0,continuity:ap}}});
      }
    }
    for(const g of weekGames) for(const [team,opp] of [[canon(g.home),canon(g.away)],[canon(g.away),canon(g.home)]]) {
      const s=teamIndex.get(`${g.id}:${team}`); if(!s) continue;
      for(const [m,k] of [[currentOff,`${g.season}:${team}`],[currentDef,`${g.season}:${opp}`]]) {if(!m.has(k))m.set(k,empty());add(m.get(k),s);}
      last.set(`${g.season}:${team}`,playerIndex.get(`${g.id}:${team}`)||[]);
    }
  }
  return result;
}

export function candidateRows(games,teamRows,playerRows,h,variant='matchup') {
  const evidence=buildEvidence(games,teamRows,playerRows,h);
  return scoringRows(games,h).map(r=>{
    const e=evidence.get(r.id); if(!e || !Number.isFinite(r.hr)||!Number.isFinite(r.ar))return null;
    // Remove home advantage at neutral venues before fitting or predicting.
    const neutral=r.neutral===true;
    const history=games.filter(g=>g.season<r.season);
    const H=mean(history.map(g=>g.hs-g.as))||0;
    const xm=[r.xm[0]-(neutral?H:0),r.xm[1]],xt=[...r.xt];
    if(variant!=='scoring') {xm.push(...e.margin);xt.push(...e.total);}
    if(variant==='personnel') {xm.push(...e.personnelMargin);xt.push(...e.personnelTotal);}
    return {...r,xm,xt,evidence:e.trace};
  }).filter(Boolean);
}

export function fitCandidate(rowSets,contract,testSeason) {
  let best=null;
  for(const [h,rs] of rowSets) {
    const tr=rs.filter(r=>r.season<testSeason-1),va=rs.filter(r=>r.season===testSeason-1);
    if(tr.length<250||va.length<200)continue;
    for(const l of contract.walk_forward.ridge_lambda_grid) {
      const mm=ridge(tr.map(r=>r.xm),tr.map(r=>r.ym),l),mt=ridge(tr.map(r=>r.xt),tr.map(r=>r.yt),l);
      const score=mae(va.map(r=>r.ym),pred(mm,va.map(r=>r.xm)))+mae(va.map(r=>r.yt),pred(mt,va.map(r=>r.xt)));
      if(!best||score<best.score) best={h,l,score};
    }
  }
  if(!best)throw new Error(`Insufficient earlier-season training for ${testSeason}`);
  const rs=rowSets.get(best.h),train=rs.filter(r=>r.season<testSeason),test=rs.filter(r=>r.season===testSeason);
  const margin=ridge(train.map(r=>r.xm),train.map(r=>r.ym),best.l),total=ridge(train.map(r=>r.xt),train.map(r=>r.yt),best.l);
  return {half_life_games:best.h,ridge_lambda:best.l,trained_through_season:testSeason-1,margin,total,
    predictions:test.map(r=>({...r,predictedMargin:pred(margin,[r.xm])[0],predictedTotal:pred(total,[r.xt])[0]}))};
}
export function metrics(rs,margin=r=>r.predictedMargin,total=r=>r.predictedTotal) {
  const yM=rs.map(r=>r.ym),yT=rs.map(r=>r.yt),pM=rs.map(margin),pT=rs.map(total);
  return {games:rs.length,margin_mae:mae(yM,pM),margin_rmse:rmse(yM,pM),total_mae:mae(yT,pT),total_rmse:rmse(yT,pT),
    team_score_mae:mean(rs.flatMap((r,i)=>[Math.abs(r.hs-(pT[i]+pM[i])/2),Math.abs(r.as-(pT[i]-pM[i])/2)]))};
}

export function deployedBaseline(games,target,shrinkage=8) {
  const prior=games.filter(g=>g.season<target.season&&g.season>=target.season-3);
  const scores=prior.flatMap(g=>[g.hs,g.as]),lg=mean(scores),H=target.neutral?0:mean(prior.map(g=>g.hs-g.as));
  const rate=team=>{const gs=prior.filter(g=>g.home===team||g.away===team);if(!gs.length)throw Error(`Missing baseline ${team}`);
    return {pf:(gs.reduce((s,g)=>s+(g.home===team?g.hs:g.as),0)+shrinkage*lg)/(gs.length+shrinkage),
      pa:(gs.reduce((s,g)=>s+(g.home===team?g.as:g.hs),0)+shrinkage*lg)/(gs.length+shrinkage)};};
  const h=rate(target.home),a=rate(target.away),home=(h.pf+a.pa)/2+H/2,away=(a.pf+h.pa)/2-H/2;
  return {margin:home-away,total:home+away};
}

export function passesGate(candidate,baseline) {
  return ['margin_mae','total_mae','team_score_mae'].every(k=>candidate.pooled[k]<baseline.pooled[k]) &&
    // The existing 6.5D contract rejects a fold when BOTH errors regress.
    candidate.folds.every((f,i)=>!(f.metrics.margin_mae>baseline.folds[i].metrics.margin_mae&&f.metrics.total_mae>baseline.folds[i].metrics.total_mae));
}
