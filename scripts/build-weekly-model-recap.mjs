import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const exists=p=>fs.existsSync(path.join(root,p));
const write=(p,x)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),JSON.stringify(x,null,2)+'\n');};
const num=(...xs)=>{for(const x of xs){const n=Number(x);if(Number.isFinite(n))return n;}return null;};
const round=(x,d=3)=>Number.isFinite(Number(x))?Number(Number(x).toFixed(d)):null;
const latestBy=(rows,keyFn)=>{const m=new Map();for(const r of rows||[]){const k=keyFn(r);if(!k)continue;const prev=m.get(k);const rev=num(r.revision,r.revision_number,1)||1;if(!prev||rev>prev.rev)m.set(k,{rev,row:r});}return new Map([...m].map(([k,v])=>[k,v.row]));};
const pick=(o,...ks)=>{for(const k of ks)if(o&&o[k]!=null)return o[k];return null;};

function statActual(s){return num(pick(s,'actual','actual_value','observed','observed_value','result_value','value'));}
function statForecast(s){return num(pick(s,'forecast_mean','mean','predicted','predicted_value','projection'));}
function statName(s){return String(pick(s,'stat','stat_name','metric')||'');}
function playerName(s){return String(pick(s,'player','player_name')||'');}
function forecastId(s){return String(pick(s,'forecast_id','prediction_id','id')||'');}

const PPR_WEIGHTS={pass_yards:.04,pass_tds:4,rush_yards:.1,rush_tds:6,receptions:1,receiving_yards:.1,receiving_tds:6};
function trackedPpr(stats,useActual){let total=0,seen=0;for(const s of stats){const w=PPR_WEIGHTS[statName(s)];if(w==null)continue;const v=useActual?statActual(s):statForecast(s);if(v==null)continue;total+=v*w;seen++;}return seen?round(total,2):null;}

function gradeGameBet(pred,game){
  if(!game||!game.completed)return null;
  const [away,home]=String(pred.matchup||'').split(' @ ');
  const awayScore=num(game.away_score),homeScore=num(game.home_score);if(awayScore==null||homeScore==null)return null;
  const sel=String(pred.selection||'').trim().toUpperCase();
  let margin=null,result=null,actual=null;
  if(pred.market_type==='TOTAL'){
    const m=sel.match(/(OVER|UNDER)\s+(-?\d+(?:\.\d+)?)/);if(!m)return null;const line=Number(m[2]),total=awayScore+homeScore;actual=total;margin=m[1]==='OVER'?total-line:line-total;result=margin>0?'WIN':margin<0?'LOSS':'PUSH';
  }else if(pred.market_type==='MONEYLINE'){
    const team=sel.replace(/\s*ML$/,'').trim();const winner=awayScore>homeScore?away:homeScore>awayScore?home:null;actual=winner;result=winner==null?'PUSH':team===winner?'WIN':'LOSS';margin=result==='WIN'?1:result==='LOSS'?-1:0;
  }else if(pred.market_type==='SPREAD'){
    const m=sel.match(/^([A-Z]{2,3})\s+([+-]?\d+(?:\.\d+)?)/);if(!m)return null;const team=m[1],line=Number(m[2]);const teamScore=team===away?awayScore:team===home?homeScore:null;const oppScore=team===away?homeScore:team===home?awayScore:null;if(teamScore==null)return null;actual=teamScore-oppScore;margin=actual+line;result=margin>0?'WIN':margin<0?'LOSS':'PUSH';
  }else return null;
  const odds=num(pred.offered_odds);const profit=result==='WIN'?(odds<0?100/Math.abs(odds):odds/100):result==='LOSS'?-1:0;
  return {prediction_id:pred.prediction_id,week:pred.week,game_id:pred.game_id,matchup:pred.matchup,market_type:pred.market_type,selection:pred.selection,book:pred.book,offered_odds:odds,model_probability:pred.model_probability,market_probability:pred.market_probability,probability_edge:pred.probability_edge,confidence:pred.confidence,result,actual,margin:round(margin),unit_profit:round(profit,4),final_score:`${away} ${awayScore} - ${home} ${homeScore}`,settled_at:new Date().toISOString(),learning_only:true,closing_line_value:null,closing_line_status:'NOT_CAPTURED_DO_NOT_IMPUTE'};
}

function explainPlayerMiss(stats){const deltas=stats.map(s=>({stat:statName(s),delta:statActual(s)!=null&&statForecast(s)!=null?statActual(s)-statForecast(s):null})).filter(x=>x.delta!=null).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));if(!deltas.length)return 'Insufficient settled components to diagnose.';const d=deltas[0];const dir=d.delta<0?'below':'above';return `${d.stat.replaceAll('_',' ')} finished ${Math.abs(round(d.delta,1))} ${dir} the frozen projection; review role, volume, efficiency, injury/news and game-script context before changing weights.`;}

export async function buildRecap({scoreboard=null}={}){
  const captures=exists('data/calibration/weekly-forecast-capture-2026.json')?read('data/calibration/weekly-forecast-capture-2026.json'):{forecasts:[]};
  const settled=exists('data/calibration/weekly-forecast-results-2026.json')?read('data/calibration/weekly-forecast-results-2026.json'):{settlements:[]};
  const bets=exists('data/calibration/weekly-predictions-2026.json')?read('data/calibration/weekly-predictions-2026.json'):{predictions:[]};
  const forecasts=captures.forecasts||captures.predictions||[];
  const latest=latestBy(settled.settlements||settled.results||[],s=>String(pick(s,'forecast_id','prediction_id','id')||''));
  const joined=[];
  for(const f of forecasts){const id=forecastId(f),s=latest.get(id);if(!s)continue;joined.push({...f,...s,forecast_mean:statForecast(f)??statForecast(s),actual:statActual(s),stat:statName(f)||statName(s),player:playerName(f)||playerName(s),position:pick(f,'position')||pick(s,'position')||null});}
  const byPlayer=new Map();for(const r of joined){if(!r.player)continue;if(!byPlayer.has(r.player))byPlayer.set(r.player,[]);byPlayer.get(r.player).push(r);}
  const players=[];for(const [player,stats] of byPlayer){const projected=trackedPpr(stats,false),actual=trackedPpr(stats,true);players.push({player,position:stats[0]?.position||null,week:num(stats[0]?.week,captures.week),tracked_ppr_projection:projected,tracked_ppr_actual:actual,tracked_ppr_error:projected!=null&&actual!=null?round(actual-projected,2):null,largest_component_miss:explainPlayerMiss(stats),components:stats.map(s=>({stat:statName(s),projected:statForecast(s),actual:statActual(s),error:statActual(s)!=null&&statForecast(s)!=null?round(statActual(s)-statForecast(s),2):null}))});}
  const rankedByPos=new Map();for(const p of players){const pos=p.position||'UNK';if(!rankedByPos.has(pos))rankedByPos.set(pos,[]);rankedByPos.get(pos).push(p);}for(const rows of rankedByPos.values()){rows.sort((a,b)=>(b.tracked_ppr_actual??-Infinity)-(a.tracked_ppr_actual??-Infinity));rows.forEach((r,i)=>r.actual_position_rank=i+1);rows.sort((a,b)=>(b.tracked_ppr_projection??-Infinity)-(a.tracked_ppr_projection??-Infinity));rows.forEach((r,i)=>r.projected_position_rank=i+1);}
  const startSitMisses=players.filter(p=>p.actual_position_rank&&p.projected_position_rank&&Math.abs(p.actual_position_rank-p.projected_position_rank)>=6).sort((a,b)=>Math.abs(b.actual_position_rank-b.projected_position_rank)-Math.abs(a.actual_position_rank-a.projected_position_rank)).slice(0,24).map(p=>({...p,direction:p.actual_position_rank>p.projected_position_rank?'RANKED_TOO_HIGH_SHOULD_HAVE_SAT_RELATIVE_TO_PEERS':'RANKED_TOO_LOW_SHOULD_HAVE_STARTED_RELATIVE_TO_PEERS'}));
  const over=players.filter(p=>p.tracked_ppr_error!=null).sort((a,b)=>a.tracked_ppr_error-b.tracked_ppr_error).slice(0,12);
  const under=players.filter(p=>p.tracked_ppr_error!=null).sort((a,b)=>b.tracked_ppr_error-a.tracked_ppr_error).slice(0,12);

  if(!scoreboard){try{const season=num(captures.season,2026)||2026,week=num(captures.week,1)||1;const u=`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&dates=${season}&week=${week}&limit=100`;const j=await (await fetch(u)).json();scoreboard={games:(j.events||[]).map(e=>({id:e.id,completed:e.status?.type?.completed===true,away_team:e.competitions?.[0]?.competitors?.find(x=>x.homeAway==='away')?.team?.abbreviation,home_team:e.competitions?.[0]?.competitors?.find(x=>x.homeAway==='home')?.team?.abbreviation,away_score:num(e.competitions?.[0]?.competitors?.find(x=>x.homeAway==='away')?.score),home_score:num(e.competitions?.[0]?.competitors?.find(x=>x.homeAway==='home')?.score)}))};}catch{scoreboard={games:[]};}}
  const gameMap=new Map((scoreboard?.games||[]).map(g=>[[g.away_team,g.home_team].join(' @ '),g]));
  const bettingResults=[];for(const p of bets.predictions||[]){if(p.entity_type!=='GAME')continue;const r=gradeGameBet(p,gameMap.get(p.matchup));if(r)bettingResults.push(r);}
  const dedup=new Map();for(const r of bettingResults)dedup.set(r.prediction_id,r);const settledBets=[...dedup.values()];
  const graded=settledBets.filter(x=>x.result!=='PUSH'),wins=graded.filter(x=>x.result==='WIN').length,losses=graded.length-wins,net=graded.reduce((a,b)=>a+(b.unit_profit||0),0);
  const calibration=exists('data/calibration/weekly-forecast-calibration-2026.json')?read('data/calibration/weekly-forecast-calibration-2026.json'):{};
  const recap={schema_version:'1.0.0',season:num(captures.season,2026)||2026,week:num(captures.week,1)||1,generated_at:new Date().toISOString(),status:'LEARNING_RECAP',mode:'SHADOW_LEARNING',actionable:false,same_sample_weight_changes_allowed:false,tracked_ppr_note:'Tracked PPR uses only settled passing yards/TDs, rushing yards/TDs, receptions and receiving yards/TDs. Turnovers and unsupported scoring are excluded.',betting:{frozen_predictions:(bets.predictions||[]).length,settled_game_bets:settledBets.length,record:{wins,losses,pushes:settledBets.filter(x=>x.result==='PUSH').length},roi_units:graded.length?round(net/graded.length,4):null,missed_bets:settledBets.filter(x=>x.result==='LOSS').sort((a,b)=>(b.probability_edge??0)-(a.probability_edge??0)),results:settledBets,closing_line_note:'Closing-line values are never fabricated; CLV remains null until an independently captured closing snapshot exists.'},fantasy:{settled_player_count:players.length,start_sit_misses:startSitMisses,biggest_overprojections:over,biggest_underprojections:under,projection_calibration:calibration},learning_candidates:[...over.slice(0,6),...under.slice(0,6)].map(p=>({player:p.player,position:p.position,error:p.tracked_ppr_error,diagnosis:p.largest_component_miss,action:'REVIEW_ONLY_NO_AUTOMATIC_WEIGHT_CHANGE'}))};
  return recap;
}

const selfTest=process.argv.includes('--self-test');
if(selfTest){const g=gradeGameBet({prediction_id:'x',matchup:'A @ B',market_type:'TOTAL',selection:'OVER 40',offered_odds:-110,model_probability:.6},{completed:true,away_score:24,home_score:20});const failures=[];if(g?.result!=='WIN')failures.push('total settlement failed');if(g?.closing_line_value!==null)failures.push('CLV must not be imputed');console.log(JSON.stringify({result:failures.length?'BLOCKED':'PASS',failures},null,2));if(failures.length)process.exit(1);}else{const out=await buildRecap();write('data/calibration/weekly-model-recap-2026.json',out);write('data/calibration/weekly-betting-results-2026.json',{schema_version:'1.0.0',season:out.season,week:out.week,generated_at:out.generated_at,status:'LEARNING_ONLY',results:out.betting.results});console.log(JSON.stringify({status:out.status,week:out.week,settled_players:out.fantasy.settled_player_count,settled_bets:out.betting.settled_game_bets,missed_bets:out.betting.missed_bets.length,start_sit_misses:out.fantasy.start_sit_misses.length},null,2));}
