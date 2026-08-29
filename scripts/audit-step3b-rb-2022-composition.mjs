import fs from 'node:fs';

const seasons=[2017,2018,2019,2020,2021,2022];
const n=v=>Number.isFinite(Number(v))?Number(v):0;
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
function parseCsv(t){const rs=[];let row=[],f='',qq=false;for(let i=0;i<t.length;i++){const c=t[i];if(qq){if(c==='"'&&t[i+1]==='"'){f+='"';i++;}else if(c==='"')qq=false;else f+=c;}else{if(c==='"')qq=true;else if(c===','){row.push(f);f='';}else if(c==='\n'){row.push(f.replace(/\r$/,''));rs.push(row);row=[];f='';}else f+=c;}}if(f.length||row.length){row.push(f);rs.push(row)}const h=rs.shift()||[];return rs.filter(r=>r.length>1).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])))}
async function csv(u){const r=await fetch(u,{headers:{'user-agent':'fantasy-2026-probability-pipeline'}});if(!r.ok)throw new Error(`${r.status} ${u}`);return parseCsv(await r.text())}

const rows=[];
for(const season of seasons){
  const u=`https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`;
  for(const r of await csv(u)){
    if(String(r.season_type||'REG').toUpperCase()!=='REG'||String(r.position||'').toUpperCase()!=='RB')continue;
    const id=r.player_id||r.gsis_id;if(!id)continue;
    const fp=n(r.receptions)+n(r.receiving_yards)*.1+n(r.receiving_tds)*6+n(r.rushing_yards)*.1+n(r.rushing_tds)*6;
    rows.push({id:String(id),player:r.player_display_name||r.player_name||String(id),season,team:r.recent_team||r.team||null,opp:n(r.carries)+n(r.targets),fp});
  }
}
const by=new Map();for(const r of rows){const k=`${r.id}|${r.season}`;if(!by.has(k))by.set(k,[]);by.get(k).push(r)}
const ss=[];for(const [k,rs] of by){const [id,ys]=k.split('|'),season=+ys;if(rs.length<4)continue;ss.push({id,player:rs[0].player,season,games:rs.length,team:[...new Set(rs.map(x=>x.team).filter(Boolean))].join('+'),opp_pg:rs.reduce((s,x)=>s+x.opp,0)/rs.length,ppg:avg(rs.map(x=>x.fp))});}
const map=new Map(ss.map(x=>[`${x.id}|${x.season}`,x]));
function histCenter(id,target){const a=[1,2,3].map(d=>map.get(`${id}|${target-d}`)).filter(Boolean);if(!a.length)return null;if(a.length===1)return a[0].ppg;if(a.length===2)return .65*a[0].ppg+.35*a[1].ppg;return .5*a[0].ppg+.3*a[1].ppg+.2*a[2].ppg}
function priorSeasons(id,target){return ss.filter(x=>x.id===id&&x.season<target).length}

const injuryOut=new Map();
for(const season of [2021,2022]){
  const u=`https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_${season}.csv`;
  for(const r of await csv(u)){
    const pos=String(r.position||r.pos||'').toUpperCase();if(pos&&pos!=='RB'&&pos!=='FB')continue;
    const status=String(r.report_status||r.game_status||r.status||'').toUpperCase();if(status!=='OUT')continue;
    const name=norm(r.full_name||r.player_name||r.player);if(!name)continue;
    const k=`${season}|${name}`;if(!injuryOut.has(k))injuryOut.set(k,{weeks:new Set(),parts:new Set()});
    const z=injuryOut.get(k);z.weeks.add(Number(r.week));const part=r.report_primary_injury||r.primary_injury||r.injury;if(part)z.parts.add(part);
  }
}
const inj=(season,player)=>injuryOut.get(`${season}|${norm(player)}`)||{weeks:new Set(),parts:new Set()};

const target=2022;
const all=[];
for(const cur of ss.filter(x=>x.season===target&&x.games>=6)){
  const prior=map.get(`${cur.id}|2021`);if(!prior||prior.games<4)continue;
  const center=histCenter(cur.id,target);if(center==null)continue;
  const i21=inj(2021,cur.player),i22=inj(2022,cur.player);
  const teamChange=Boolean(cur.team&&prior.team&&cur.team!==prior.team);
  const usageRatio=prior.opp_pg>0?cur.opp_pg/prior.opp_pg:null;
  const careerPrior=priorSeasons(cur.id,target);
  const projectedQ50=center;
  const gap=cur.ppg-projectedQ50;
  const injuryAffected=i22.weeks.size>=2 || i21.weeks.size>=2 || cur.games<=11;
  const fringePrior=prior.games<10 || prior.opp_pg<10;
  const establishedPrior=prior.games>=10 && prior.opp_pg>=12;
  const majorRoleDrop=usageRatio!=null&&usageRatio<0.7;
  const veteranDeclineProxy=careerPrior>=5 && majorRoleDrop && !injuryAffected;
  let diagnosticGroup='OTHER';
  if(injuryAffected)diagnosticGroup='INJURY_OR_RECOVERY_AFFECTED';
  else if(fringePrior)diagnosticGroup='FRINGE_PRIOR_ROLE';
  else if(veteranDeclineProxy)diagnosticGroup='VETERAN_ROLE_DECLINE_PROXY';
  else if(teamChange||majorRoleDrop)diagnosticGroup='ROLE_OR_TEAM_CHANGE';
  else if(establishedPrior)diagnosticGroup='HEALTHY_ESTABLISHED';
  all.push({...cur,prior,projectedQ50,gap,teamChange,usageRatio,careerPrior,injury2021_out_weeks:i21.weeks.size,injury2022_out_weeks:i22.weeks.size,injury_parts:[...new Set([...i21.parts,...i22.parts])],injuryAffected,fringePrior,establishedPrior,majorRoleDrop,veteranDeclineProxy,diagnosticGroup});
}
const compat=(obs,p,N)=>Math.abs(obs-p)<=1.96*Math.sqrt(p*(1-p)/N);
function summarize(a){if(!a.length)return{n:0,q50_coverage:null,mean_gap:null,compatible_95pct:null};const cov=a.filter(x=>x.ppg<=x.projectedQ50).length/a.length;return{n:a.length,q50_coverage:cov,mean_gap:avg(a.map(x=>x.gap)),compatible_95pct:compat(cov,.5,a.length)}}

// Pre-target fantasy relevance: rank only from information known entering 2022.
const ranked=[...all].sort((a,b)=>b.projectedQ50-a.projectedQ50);
const top56=new Set(ranked.slice(0,56).map(x=>x.id));
const relevant=all.filter(x=>top56.has(x.id));
const healthyEstablished=all.filter(x=>x.diagnosticGroup==='HEALTHY_ESTABLISHED');
const relevantHealthyEstablished=relevant.filter(x=>x.diagnosticGroup==='HEALTHY_ESTABLISHED');
const groups={};for(const g of ['HEALTHY_ESTABLISHED','INJURY_OR_RECOVERY_AFFECTED','FRINGE_PRIOR_ROLE','VETERAN_ROLE_DECLINE_PROXY','ROLE_OR_TEAM_CHANGE','OTHER'])groups[g]=summarize(all.filter(x=>x.diagnosticGroup===g));
const relevantGroups={};for(const g of Object.keys(groups))relevantGroups[g]=summarize(relevant.filter(x=>x.diagnosticGroup===g));

const report={
  generated_at:new Date().toISOString(),
  step:'STEP3B_RB_2022_COMPOSITION_DIAGNOSTIC',
  purpose:'Diagnose whether the anomalous 2022 RB Q50 result is driven by injury/recovery, fringe prior roles, veteran role decline, or team/role changes rather than healthy established RBs.',
  diagnostic_only:true,
  leakage_note:'The fantasy-relevant top-56 subset is selected only from pre-2022 historical Q50. Injury/role/decline group tags may use realized 2022 information and are diagnostic outcome labels only; they are not authorized preseason predictors.',
  group_definitions:{
    HEALTHY_ESTABLISHED:'2021 >=10 games and >=12 opportunities/game; fewer than 2 official OUT weeks in both 2021 and 2022; 2022 >11 games; no team change; no >30% opportunity drop.',
    INJURY_OR_RECOVERY_AFFECTED:'At least 2 official OUT weeks in 2021 or 2022, or <=11 games in 2022. Diagnostic only.',
    FRINGE_PRIOR_ROLE:'2021 <10 games or <10 carries+targets per game.',
    VETERAN_ROLE_DECLINE_PROXY:'At least 5 prior qualifying NFL seasons and >30% opportunity decline in 2022, excluding injury-affected cases. This is a workload/experience proxy, not literal age.',
    ROLE_OR_TEAM_CHANGE:'Team changed or 2022 opportunity fell >30%, after excluding injury/fringe/veteran-decline groups.'
  },
  full_2022_pool:summarize(all),
  pre2022_fantasy_relevant_top56:summarize(relevant),
  healthy_established:summarize(healthyEstablished),
  fantasy_relevant_healthy_established:summarize(relevantHealthyEstablished),
  by_group:groups,
  fantasy_relevant_by_group:relevantGroups,
  players:all.map(x=>({player:x.player,group:x.diagnosticGroup,pre2022_top56:top56.has(x.id),prior_games:x.prior.games,prior_opp_pg:x.prior.opp_pg,prior_ppg:x.prior.ppg,career_prior_seasons:x.careerPrior,team_change:x.teamChange,injury_2021_out_weeks:x.injury2021_out_weeks,injury_2022_out_weeks:x.injury2022_out_weeks,injury_parts:x.injury_parts,usage_ratio:x.usageRatio,projected_q50:x.projectedQ50,actual_ppg:x.ppg,gap:x.gap})).sort((a,b)=>Math.abs(b.gap)-Math.abs(a.gap)),
  sportsbook_or_adp_used:false,live_weight:0,live_projection_movement:0,live_rank_movement:0,promotion_allowed:false
};
fs.mkdirSync('guardrails',{recursive:true});fs.writeFileSync('guardrails/step3b-rb-2022-composition-diagnostic.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
