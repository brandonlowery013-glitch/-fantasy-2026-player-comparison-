import fs from 'node:fs';

const seasons=[2016,2017,2018,2019,2020,2021,2022,2023,2024,2025];
const targets=[2019,2020,2021,2022,2023,2024,2025];
const n=v=>Number.isFinite(Number(v))?Number(v):0;
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]/g,'');
function parseCsv(t){const rs=[];let row=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'&&t[i+1]==='"'){f+='"';i++;}else if(c==='"')q=false;else f+=c;}else{if(c==='"')q=true;else if(c===','){row.push(f);f='';}else if(c==='\n'){row.push(f.replace(/\r$/,''));rs.push(row);row=[];f='';}else f+=c;}}if(f.length||row.length){row.push(f);rs.push(row)}const h=rs.shift()||[];return rs.filter(r=>r.length>1).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])))}
async function csv(u){const r=await fetch(u,{headers:{'user-agent':'fantasy-2026-rb-top30-audit'}});if(!r.ok)throw new Error(`${r.status} ${u}`);return parseCsv(await r.text())}

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
const ss=[];for(const [k,rs] of by){const [id,ys]=k.split('|'),season=+ys;ss.push({id,player:rs[0].player,season,games:rs.length,team:[...new Set(rs.map(x=>x.team).filter(Boolean))].join('+'),opp_pg:rs.length?rs.reduce((s,x)=>s+x.opp,0)/rs.length:0,ppg:avg(rs.map(x=>x.fp))});}
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
      const k=`${season}|${name}`;if(!injuryOut.has(k))injuryOut.set(k,new Set());injuryOut.get(k).add(Number(r.week));
    }
  }catch(e){console.error(`injury source unavailable ${season}: ${e.message}`)}
}
const outWeeks=(season,player)=>(injuryOut.get(`${season}|${norm(player)}`)||new Set()).size;
const compat=(obs,p,N)=>N>0&&Math.abs(obs-p)<=1.96*Math.sqrt(p*(1-p)/N);
function summary(a){if(!a.length)return{n:0,q50_coverage:null,mean_actual_ppg:null,mean_q50:null,mean_gap:null,mean_games:null,mean_prior_games:null,mean_prior_opp_pg:null,mean_prior_out_weeks:null,target_out_share:null,team_change_share:null,major_role_drop_share:null,compatible_95pct:null};const cov=a.filter(x=>x.actual_ppg<=x.q50).length/a.length;return{n:a.length,q50_coverage:cov,mean_actual_ppg:avg(a.map(x=>x.actual_ppg)),mean_q50:avg(a.map(x=>x.q50)),mean_gap:avg(a.map(x=>x.actual_ppg-x.q50)),mean_games:avg(a.map(x=>x.target_games)),mean_prior_games:avg(a.map(x=>x.prior_games)),mean_prior_opp_pg:avg(a.map(x=>x.prior_opp_pg)),mean_prior_out_weeks:avg(a.map(x=>x.prior_out_weeks)),target_out_share:a.filter(x=>x.target_out_weeks>=2||x.target_games<=11).length/a.length,team_change_share:a.filter(x=>x.team_change).length/a.length,major_role_drop_share:a.filter(x=>x.major_role_drop).length/a.length,compatible_95pct:compat(cov,.5,a.length)}}

const yearly={};const all=[];
for(const target of targets){
  // Build preseason candidate pool strictly from players with prior NFL history.
  const candidates=ss.filter(x=>x.season===target-1).map(prior=>({prior,q50:histCenter(prior.id,target)})).filter(x=>x.q50!=null).sort((a,b)=>b.q50-a.q50).slice(0,30);
  const sample=candidates.map((x,idx)=>{
    const cur=map.get(`${x.prior.id}|${target}`)||null;
    const actual_ppg=cur?.ppg??0;
    const target_games=cur?.games??0;
    const team_change=Boolean(cur?.team&&x.prior.team&&cur.team!==x.prior.team);
    const usageRatio=cur&&x.prior.opp_pg>0?cur.opp_pg/x.prior.opp_pg:0;
    return {target,preseason_rank:idx+1,player:x.prior.player,id:x.prior.id,q50:x.q50,actual_ppg,target_games,prior_games:x.prior.games,prior_opp_pg:x.prior.opp_pg,prior_ppg:x.prior.ppg,prior_out_weeks:outWeeks(target-1,x.prior.player),target_out_weeks:outWeeks(target,x.prior.player),career_prior_seasons:priorSeasons(x.prior.id,target),team_change,usage_ratio:usageRatio,major_role_drop:usageRatio<0.7};
  });
  yearly[target]=summary(sample);all.push(...sample);
}

function split(name,pred){return{name,...summary(all.filter(pred))}}
const indicators=[
  split('PRESEASON_RANK_1_10',x=>x.preseason_rank<=10),
  split('PRESEASON_RANK_11_20',x=>x.preseason_rank>=11&&x.preseason_rank<=20),
  split('PRESEASON_RANK_21_30',x=>x.preseason_rank>=21),
  split('PRIOR_GAMES_15_PLUS',x=>x.prior_games>=15),
  split('PRIOR_GAMES_12_14',x=>x.prior_games>=12&&x.prior_games<=14),
  split('PRIOR_GAMES_11_OR_FEWER',x=>x.prior_games<=11),
  split('PRIOR_OUT_WEEKS_ZERO',x=>x.prior_out_weeks===0),
  split('PRIOR_OUT_WEEKS_1_PLUS',x=>x.prior_out_weeks>=1),
  split('PRIOR_OPP_15_PLUS',x=>x.prior_opp_pg>=15),
  split('PRIOR_OPP_UNDER_15',x=>x.prior_opp_pg<15),
  split('EXPERIENCE_1_3_PRIOR_SEASONS',x=>x.career_prior_seasons<=3),
  split('EXPERIENCE_4_PLUS_PRIOR_SEASONS',x=>x.career_prior_seasons>=4)
];

const report={generated_at:new Date().toISOString(),step:'STEP3B_RB_TOP30_2019_2025_DIAGNOSTIC',purpose:'Use a cleaner preseason top-30 RB cohort rather than the broad healthy-established label; compare Q50 calibration, realized production, availability and pre-target risk indicators from 2019-2025.',diagnostic_only:true,selection_rule:'Top 30 each target year ranked by leakage-safe historical Q50 using only up to the prior 3 seasons. A selected back with no target-season weekly stat row is retained with 0 games and 0 PPR/G so season-ending/unplayed outcomes are not silently excluded.',historical_weights:'[1], [.35,.65], [.20,.30,.50] oldest-to-latest equivalent implementation via most-recent-first .65/.35 and .50/.30/.20.',by_year:yearly,indicator_splits:indicators,players:all,sportsbook_or_adp_used:false,live_weight:0,live_projection_movement:0,live_rank_movement:0,promotion_allowed:false};
fs.mkdirSync('guardrails',{recursive:true});fs.writeFileSync('guardrails/step3b-rb-top30-2019-2025.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
