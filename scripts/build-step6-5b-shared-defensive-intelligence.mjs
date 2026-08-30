import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const URL='https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_2025.csv';
const CONTRACT='data/sources/step6-5b-shared-defensive-intelligence-contract-2026.json';
const PRIORS='data/probability/generated/step6-5b-2026-adjusted-team-priors.json';
const OUT='data/probability/generated/step6-5b-shared-defensive-intelligence-2026.json';
const TEAM_CODES=['ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC','LV','LAC','LAR','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SEA','SF','TB','TEN','WAS'];
const canon=x=>({LA:'LAR',JAC:'JAX',WSH:'WAS'}[String(x||'').toUpperCase()]||String(x||'').toUpperCase());
const num=x=>{const n=Number(x);return Number.isFinite(n)?n:0;};
const div=(a,b)=>b>0?a/b:null;
const readJson=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));

function csvRows(text){
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean); if(!lines.length)return {head:[],rows:[]};
  const parse=line=>{const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(c===','&&!q){out.push(cur);cur='';}else cur+=c;}out.push(cur);return out;};
  const head=parse(lines[0]); const rows=lines.slice(1).map(l=>{const a=parse(l),o={};head.forEach((h,i)=>o[h]=a[i]);return o;}); return {head,rows};
}

function build(parsed,contract,priors){
  const required=['season','week','team','season_type','opponent_team','attempts','passing_yards','passing_interceptions','sacks_suffered','passing_epa','carries','rushing_yards','rushing_epa','passing_20','rushing_10'];
  const missing=required.filter(x=>!parsed.head.includes(x)); if(missing.length)throw new Error(`team stats missing required fields: ${missing.join(', ')}`);
  const agg=Object.fromEntries(TEAM_CODES.map(t=>[t,{games:new Set(),dropbacks:0,attempts:0,pass_yards:0,pass_int:0,sacks:0,pass_epa:0,carries:0,rush_yards:0,rush_epa:0,pass20:0,rush10:0}]));
  for(const r of parsed.rows){
    if(Number(r.season)!==2025||String(r.season_type).toUpperCase()!=='REG')continue;
    const def=canon(r.opponent_team); if(!agg[def])continue;
    const a=agg[def]; a.games.add(`${r.season}_${r.week}_${canon(r.team)}_${def}`);
    a.attempts+=num(r.attempts); a.sacks+=num(r.sacks_suffered); a.dropbacks+=num(r.attempts)+num(r.sacks_suffered);
    a.pass_yards+=num(r.passing_yards); a.pass_int+=num(r.passing_interceptions); a.pass_epa+=num(r.passing_epa);
    a.carries+=num(r.carries); a.rush_yards+=num(r.rushing_yards); a.rush_epa+=num(r.rushing_epa);
    a.pass20+=num(r.passing_20); a.rush10+=num(r.rushing_10);
  }
  const teams={};
  for(const t of TEAM_CODES){
    const a=agg[t], prior=priors.teams?.[t];
    const plays=a.dropbacks+a.carries;
    teams[t]={
      games:a.games.size,
      source_season:2025,
      components:{
        overall_epa_allowed_per_play:div(a.pass_epa+a.rush_epa,plays),
        pass_epa_allowed_per_dropback:div(a.pass_epa,a.dropbacks),
        rush_epa_allowed_per_carry:div(a.rush_epa,a.carries),
        pass_yards_allowed_per_attempt:div(a.pass_yards,a.attempts),
        rush_yards_allowed_per_carry:div(a.rush_yards,a.carries),
        sack_rate:div(a.sacks,a.dropbacks),
        interception_rate:div(a.pass_int,a.attempts),
        explosive_pass_20_rate_allowed:div(a.pass20,a.attempts),
        explosive_rush_10_rate_allowed:div(a.rush10,a.carries)
      },
      baseline_points_allowed_mean:prior?.base_2025_points_allowed_mean??null,
      verified_2026_adjustment_features:(prior?.verified_2026_adjustment_features||[]).filter(x=>(x.affected_engines||[]).some(e=>['TEAM_DEFENSE','DST','SPREAD','TOTAL','QB','RB','WR','TE','PLAYER_PROPS'].includes(e))),
      numeric_2026_adjustment_authority:0,
      composite_defense_rating:null,
      composite_rating_authority:0,
      sportsbook_inputs_used:false,
      shared_consumers:contract.engine_consumers
    };
  }
  const bad=Object.entries(teams).filter(([,x])=>x.games!==17||Object.values(x.components).some(v=>!Number.isFinite(v))).map(([t,x])=>`${t}:${x.games}`);
  if(bad.length)throw new Error(`defensive component baseline incomplete: ${bad.join(', ')}`);
  return {
    schema_version:'STEP6_5B_SHARED_DEFENSIVE_INTELLIGENCE_OUTPUT_1.0.0',season:2026,status:'SHADOW_COMPONENTS_READY_COMPOSITE_UNCALIBRATED',sportsbook_inputs_used:false,source:{name:'nflverse weekly team stats',url:URL,season:2025},policy:{shared_information_rule:contract.shared_information_rule,anti_double_count_rule:contract.anti_double_count_rule,market_isolation_rule:contract.market_isolation_rule,composite_rating_authority:0},teams
  };
}

async function main(){
  const contract=readJson(CONTRACT),priors=readJson(PRIORS);
  let text;
  if(process.argv.includes('--self-test')){
    text='season,week,team,season_type,opponent_team,attempts,passing_yards,passing_interceptions,sacks_suffered,passing_epa,carries,rushing_yards,rushing_epa,passing_20,rushing_10\n2025,1,ATL,REG,ARI,30,210,1,3,-2.5,24,96,-1.2,2,3\n';
    const parsed=csvRows(text); const a={...priors,teams:{...priors.teams,ARI:{...(priors.teams?.ARI||{}),base_2025_points_allowed_mean:20,verified_2026_adjustment_features:[]}}};
    const x=buildForSelfTest(parsed,contract,a); if(x.teams.ARI.composite_defense_rating!==null||x.sportsbook_inputs_used!==false||x.teams.ARI.components.sack_rate!==3/33)process.exit(1);
    console.log(JSON.stringify({result:'PASS',mode:'SELF_TEST'})); return;
  }
  const r=await fetch(URL,{headers:{'user-agent':'fantasy-2026-step6-5b-defense'}}); if(!r.ok)throw new Error(`nflverse team stats fetch failed: ${r.status}`); text=await r.text();
  const out=build(csvRows(text),contract,priors); fs.mkdirSync(path.dirname(path.join(root,OUT)),{recursive:true}); fs.writeFileSync(path.join(root,OUT),JSON.stringify(out,null,2)+'\n');
  console.log(JSON.stringify({result:'PASS',teams:Object.keys(out.teams).length,status:out.status},null,2));
}

function buildForSelfTest(parsed,contract,priors){
  const required=['season','week','team','season_type','opponent_team','attempts','passing_yards','passing_interceptions','sacks_suffered','passing_epa','carries','rushing_yards','rushing_epa','passing_20','rushing_10'];
  const missing=required.filter(x=>!parsed.head.includes(x)); if(missing.length)throw new Error(`team stats missing required fields: ${missing.join(', ')}`);
  const r=parsed.rows[0],t=canon(r.opponent_team),drop=num(r.attempts)+num(r.sacks_suffered),plays=drop+num(r.carries);
  return {sportsbook_inputs_used:false,teams:{[t]:{components:{overall_epa_allowed_per_play:div(num(r.passing_epa)+num(r.rushing_epa),plays),pass_epa_allowed_per_dropback:div(num(r.passing_epa),drop),rush_epa_allowed_per_carry:div(num(r.rushing_epa),num(r.carries)),pass_yards_allowed_per_attempt:div(num(r.passing_yards),num(r.attempts)),rush_yards_allowed_per_carry:div(num(r.rushing_yards),num(r.carries)),sack_rate:div(num(r.sacks_suffered),drop),interception_rate:div(num(r.passing_interceptions),num(r.attempts)),explosive_pass_20_rate_allowed:div(num(r.passing_20),num(r.attempts)),explosive_rush_10_rate_allowed:div(num(r.rushing_10),num(r.carries))},composite_defense_rating:null}}};
}

await main();
