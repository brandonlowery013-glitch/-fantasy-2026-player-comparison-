import fs from 'node:fs';

const seasons=[2017,2018,2019,2020,2021,2022,2023,2024,2025];
const targets=[2019,2020,2021,2022,2023,2024,2025];
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
for(const season of [2018,2019,2020,2021,2022,2023,2024,2025]){
  try{
    const u=`https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_${season}.csv`;
    for(const r of await csv(u)){
      const pos=String(r.position||r.pos||'').toUpperCase();if(pos&&pos!=='RB'&&pos!=='FB')continue;
      const status=String(r.report_status||r.game_status||r.status||'').toUpperCase();if(status!=='OUT')continue;
      const name=norm(r.full_name||r.player_name||r.player);if(!name)continue;
      const k=`${season}|${name}`;if(!injuryOut.has(k))injuryOut.set(k,{weeks:new Set(),parts:new Set()});
      const z=injuryOut.get(k);z.weeks.add(Number(r.week));const part=r.report_primary_injury||r.primary_injury||r.injury;if(part)z.parts.add(part);
    }
  }catch(e){console.warn(`injury file unavailable for ${season}: ${e.message}`)}
}
const inj=(season,player)=>injuryOut.get(`${season}|${norm(player)}`)||{weeks:new Set(),parts:new Set()};
const compat=(obs,p,N)=>N>0&&Math.abs(obs-p)<=1.96*Math.sqrt(p*(1-p)/N);
function summarize(a){if(!a.length)return{n:0,q50_coverage:null,mean_gap:null,mean_actual_ppg:null,mean_projected_q50:null,compatible_95pct:null};const cov=a.filter(x=>x.ppg<=x.projectedQ50).length/a.length;return{n:a.length,q50_coverage:cov,mean_gap:avg(a.map(x=>x.gap)),mean_actual_ppg:avg(a.map(x=>x.ppg)),mean_projected_q50:avg(a.map(x=>x.projectedQ50)),compatible_95pct:compat(cov,.5,a.length)}}

const yearly={};const allPlayers=[];
for(const target of targets){
  const pool=[];
  for(const cur of ss.filter(x=>x.season===target&&x.games>=6)){
    const prior=map.get(`${cur.id}|${target-1}`);if(!prior||prior.games<4)continue;
    const center=histCenter(cur.id,target);if(center==null)continue;
    const ip=inj(target-1,cur.player),it=inj(target,cur.player);
    const teamChange=Boolean(cur.team&&prior.team&&cur.team!==prior.team);
    const usageRatio=prior.opp_pg>0?cur.opp_pg/prior.opp_pg:null;
    const careerPrior=priorSeasons(cur.id,target);
    const gap=cur.ppg-center;
    const injuryAffected=it.weeks.size>=2 || ip.weeks.size>=2 || cur.games<=11;
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
    pool.push({...cur,prior,projectedQ50:center,gap,teamChange,usageRatio,careerPrior,injuryPriorOutWeeks:ip.weeks.size,injuryTargetOutWeeks:it.weeks.size,injuryAffected,fringePrior,establishedPrior,majorRoleDrop,veteranDeclineProxy,diagnosticGroup});
  }
  const ranked=[...pool].sort((a,b)=>b.projectedQ50-a.projectedQ50);
  const top56=new Set(ranked.slice(0,56).map(x=>x.id));
  const relevant=pool.filter(x=>top56.has(x.id));
  const groups={};
  for(const g of ['HEALTHY_ESTABLISHED','INJURY_OR_RECOVERY_AFFECTED','FRINGE_PRIOR_ROLE','VETERAN_ROLE_DECLINE_PROXY','ROLE_OR_TEAM_CHANGE','OTHER']) groups[g]=summarize(relevant.filter(x=>x.diagnosticGroup===g));
  const injuryN=relevant.filter(x=>x.injuryAffected).length;
  const healthyN=relevant.filter(x=>x.diagnosticGroup==='HEALTHY_ESTABLISHED').length;
  yearly[target]={full_pool:summarize(pool),fantasy_relevant_top56:summarize(relevant),fantasy_relevant_health_environment:{n:relevant.length,injury_or_recovery_share:relevant.length?injuryN/relevant.length:null,healthy_established_share:relevant.length?healthyN/relevant.length:null,mean_target_games:avg(relevant.map(x=>x.games)),mean_target_opportunities_pg:avg(relevant.map(x=>x.opp_pg))},fantasy_relevant_by_group:groups};
  for(const x of relevant) allPlayers.push({season:target,player:x.player,group:x.diagnosticGroup,prior_games:x.prior.games,prior_opp_pg:x.prior.opp_pg,target_games:x.games,target_opp_pg:x.opp_pg,team_change:x.teamChange,injury_prior_out_weeks:x.injuryPriorOutWeeks,injury_target_out_weeks:x.injuryTargetOutWeeks,usage_ratio:x.usageRatio,projected_q50:x.projectedQ50,actual_ppg:x.ppg,gap:x.gap});
}

const early=[2019,2020,2021,2022,2023],late=[2024,2025];
const meanMetric=(years,key)=>avg(years.map(y=>yearly[y].fantasy_relevant_health_environment[key]).filter(v=>v!=null));
const comparison={early_2019_2023:{injury_or_recovery_share:meanMetric(early,'injury_or_recovery_share'),healthy_established_share:meanMetric(early,'healthy_established_share'),mean_target_games:meanMetric(early,'mean_target_games')},late_2024_2025:{injury_or_recovery_share:meanMetric(late,'injury_or_recovery_share'),healthy_established_share:meanMetric(late,'healthy_established_share'),mean_target_games:meanMetric(late,'mean_target_games')}};
comparison.late_minus_early={injury_or_recovery_share:comparison.late_2024_2025.injury_or_recovery_share-comparison.early_2019_2023.injury_or_recovery_share,healthy_established_share:comparison.late_2024_2025.healthy_established_share-comparison.early_2019_2023.healthy_established_share,mean_target_games:comparison.late_2024_2025.mean_target_games-comparison.early_2019_2023.mean_target_games};

const report={generated_at:new Date().toISOString(),step:'STEP3B_RB_HEALTH_COMPOSITION_2019_2025',purpose:'Extend the same health/role composition diagnostic to 2019-2025 for apples-to-apples context.',diagnostic_only:true,leakage_note:'Fantasy relevance is selected only from pre-target historical Q50. Health/role group tags use realized target-season outcomes for diagnosis only and are not authorized preseason predictors.',group_definitions:{HEALTHY_ESTABLISHED:'Prior season >=10 games and >=12 opportunities/game; fewer than 2 official OUT weeks in both prior and target seasons; target >11 games; no team change; no >30% opportunity drop.',INJURY_OR_RECOVERY_AFFECTED:'At least 2 official OUT weeks in prior or target season, or <=11 target games. Diagnostic only.',FRINGE_PRIOR_ROLE:'Prior season <10 games or <10 carries+targets per game.',VETERAN_ROLE_DECLINE_PROXY:'At least 5 prior qualifying NFL seasons and >30% opportunity decline in target season, excluding injury-affected cases. Workload/experience proxy, not literal age.',ROLE_OR_TEAM_CHANGE:'Team changed or target opportunity fell >30%, after excluding injury/fringe/veteran-decline groups.'},yearly,comparison_2024_2025_vs_2019_2023:comparison,players:allPlayers.sort((a,b)=>a.season-b.season||Math.abs(b.gap)-Math.abs(a.gap)),sportsbook_or_adp_used:false,live_weight:0,live_projection_movement:0,live_rank_movement:0,promotion_allowed:false};
fs.mkdirSync('guardrails',{recursive:true});fs.writeFileSync('guardrails/step3b-rb-health-composition-2021-2025.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
