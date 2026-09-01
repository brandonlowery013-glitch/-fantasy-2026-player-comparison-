import fs from 'node:fs';

const CONTRACT='data/sources/historical-game-trend-db-2026.json';
const OUT='data/probability/generated/historical-game-trend-db-2021-2025.json';
const c=JSON.parse(fs.readFileSync(CONTRACT,'utf8'));
const errors=[];
const requiredDims=['ALL','HOME_ROAD','FAVORITE_DOG_PICKEM','OPPONENT_PREGAME_WINNING_500_PLUS_OR_BELOW','WEEK_1_OR_LATER','REST_BUCKET','DIVISION_OR_NON_DIVISION','SURFACE','SAME_SEASON_REMATCH'];

if(c.schema_version!=='1.0.0')errors.push('contract schema');
if(c.status!=='STEP_4_HISTORICAL_GAME_TREND_DB_SHADOW')errors.push('contract status');
if(c.mode!=='DESCRIPTIVE_CONTEXT_ONLY'||c.actionable!==false||c.production_numeric_authority!==0)errors.push('contract authority');
for(const d of requiredDims)if(!c.trend_dimensions?.includes(d))errors.push(`missing dimension ${d}`);
if(c.pregame_integrity?.opponent_record_uses_only_games_completed_before_current_game!==true)errors.push('pregame opponent-record integrity');
if(c.pregame_integrity?.future_results_may_not_define_current_game_condition!==true)errors.push('future-result leakage guard');
if(!c.guardrails?.some(x=>/context, not causation/i.test(x)))errors.push('causation guard');
if(!c.guardrails?.some(x=>/out-of-sample backtesting/i.test(x)))errors.push('backtest gate');

function scanForForbidden(v,path='root'){
  if(Array.isArray(v))return v.forEach((x,i)=>scanForForbidden(x,`${path}[${i}]`));
  if(!v||typeof v!=='object')return;
  for(const [k,x] of Object.entries(v)){
    if(['bet','recommendation','edge','weight','model_adjustment','projection_adjustment'].includes(k.toLowerCase()))errors.push(`forbidden actionable field ${path}.${k}`);
    scanForForbidden(x,`${path}.${k}`);
  }
}

if(process.argv.includes('--require-output')){
  if(!fs.existsSync(OUT))errors.push('generated output missing');
  else {
    const o=JSON.parse(fs.readFileSync(OUT,'utf8'));
    if(o.schema_version!=='1.0.0')errors.push('output schema');
    if(o.status!=='SHADOW_DESCRIPTIVE_CONTEXT_ONLY')errors.push('output status');
    if(o.production_numeric_authority!==0||o.actionable!==false)errors.push('output authority');
    if(!Array.isArray(o.history_window)||o.history_window.join(',')!=='2021,2022,2023,2024,2025')errors.push('history window');
    for(const d of requiredDims)if(!o.trend_dimensions?.includes(d))errors.push(`output missing dimension ${d}`);
    if(!o.market_coverage||Number(o.market_coverage.games)<1)errors.push('market coverage missing');
    if(Number(o.market_coverage.spread_available_games)<0||Number(o.market_coverage.total_available_games)<0)errors.push('invalid market coverage');
    if(!o.teams||typeof o.teams!=='object'||Array.isArray(o.teams)||!Object.keys(o.teams).length)errors.push('teams missing');
    scanForForbidden(o.teams);
    for(const [team,slots] of Object.entries(o.teams||{})){
      for(const [key,s] of Object.entries(slots||{})){
        if(!s.full||!s.by_season||!s.recent_last_5||!s.recent_last_10)errors.push(`${team}/${key} missing record views`);
        const ats=s.full?.ats,ou=s.full?.ou,su=s.full?.su;
        if(ats&&ats.g!==ats.w+ats.l+ats.p)errors.push(`${team}/${key} ATS denominator mismatch`);
        if(ou&&ou.g!==ou.o+ou.u+ou.p)errors.push(`${team}/${key} OU denominator mismatch`);
        if(su&&su.g!==su.w+su.l+su.t)errors.push(`${team}/${key} SU denominator mismatch`);
      }
    }
  }
}

console.log(JSON.stringify({result:errors.length?'BLOCKED':'PASS',status:c.status,mode:c.mode,required_dimensions:requiredDims.length,output_required:process.argv.includes('--require-output'),errors},null,2));
if(errors.length)process.exit(1);
