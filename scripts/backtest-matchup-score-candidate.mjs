import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseCSV,canon} from '../lib/game-scoring-calibration.mjs';
import {candidateRows,fitCandidate,metrics,deployedBaseline,passesGate} from '../lib/matchup-score-candidate.mjs';

const cache=process.env.FOOTBALL_MODEL_CACHE||'.cache/matchup-model';
fs.mkdirSync(cache,{recursive:true});
const contract=JSON.parse(fs.readFileSync('data/sources/step6-5d-game-spread-total-calibration-2026.json','utf8'));
const sources=[];
async function csv(name,tag) {
  const url=`https://github.com/nflverse/nflverse-data/releases/download/${tag}/${name}`,file=path.join(cache,name);
  if(!fs.existsSync(file)) {
    const r=await fetch(url);if(!r.ok)throw Error(`${name}: HTTP ${r.status}`);
    fs.writeFileSync(file,await r.text());
  }
  const text=fs.readFileSync(file,'utf8');sources.push({url,sha256:createHash('sha256').update(text).digest('hex')});return parseCSV(text);
}
// Select football fields explicitly. The source contains odds columns, which
// are deliberately not retained, fitted, or used to choose parameters.
const schedule=await csv('games.csv','schedules');
const games=schedule.filter(r=>r.game_type==='REG'&&+r.season>=2020&&+r.season<=2025&&r.home_score!==''&&r.away_score!=='')
  .map(r=>({season:+r.season,week:+r.week,id:r.game_id,home:canon(r.home_team),away:canon(r.away_team),hs:+r.home_score,as:+r.away_score,
    hr:r.home_rest===''?null:+r.home_rest,ar:r.away_rest===''?null:+r.away_rest,neutral:r.location==='Neutral'}))
  .filter(r=>Number.isFinite(r.hs)&&Number.isFinite(r.as)).sort((a,b)=>a.season-b.season||a.week-b.week||a.id.localeCompare(b.id));
const teams=[],players=[];
for(let year=2020;year<=2025;year++) {
  teams.push(...await csv(`stats_team_week_${year}.csv`,'stats_team'));
  players.push(...await csv(`stats_player_week_${year}.csv`,'stats_player'));
}
const results={},rowSets={},heldOut={};
for(const variant of ['scoring','matchup','personnel']) {
  rowSets[variant]=new Map(contract.prior_decay.candidate_half_life_games.map(h=>[h,candidateRows(games,teams,players,h,variant)]));
  const fitted=contract.held_out_test_seasons.map(y=>fitCandidate(rowSets[variant],contract,y));
  const pooled=fitted.flatMap(f=>f.predictions);
  heldOut[variant]=pooled;
  results[variant]={folds:fitted.map((f,i)=>({season:contract.held_out_test_seasons[i],half_life_games:f.half_life_games,ridge_lambda:f.ridge_lambda,metrics:metrics(f.predictions)})),pooled:metrics(pooled)};
  if(variant==='scoring') {
    const baselineRows=pooled.map(r=>({...r,baseline:deployedBaseline(games,r)}));
    results.deployed={folds:contract.held_out_test_seasons.map(y=>({season:y,metrics:metrics(baselineRows.filter(r=>r.season===y),r=>r.baseline.margin,r=>r.baseline.total)})),pooled:metrics(baselineRows,r=>r.baseline.margin,r=>r.baseline.total)};
  }
}
const gates={scoring_vs_deployed:passesGate(results.scoring,results.deployed),matchup_vs_scoring:passesGate(results.matchup,results.scoring),personnel_vs_matchup:passesGate(results.personnel,results.matchup)};
if(gates.scoring_vs_deployed) {
  // This is a reviewed candidate artifact, not an automatic production switch.
  const fitted=fitCandidate(rowSets.scoring,contract,2026),prior={};
  for(const g of games.filter(g=>g.season===2025)) for(const [t,pf,pa] of [[g.home,g.hs,g.as],[g.away,g.as,g.hs]]) {
    prior[t]??={games:0,pf:0,pa:0};prior[t].games++;prior[t].pf+=pf;prior[t].pa+=pa;
  }
  const residuals=heldOut.scoring.map(r=>[r.hs-(r.predictedTotal+r.predictedMargin)/2,r.as-(r.predictedTotal-r.predictedMargin)/2]);
  const avg=a=>a.reduce((s,x)=>s+x,0)/a.length;
  const mh=avg(residuals.map(r=>r[0])),ma=avg(residuals.map(r=>r[1]));
  const vh=avg(residuals.map(r=>(r[0]-mh)**2)),va=avg(residuals.map(r=>(r[1]-ma)**2));
  const covariance=avg(residuals.map(r=>(r[0]-mh)*(r[1]-ma)));
  const artifact={schema_version:1,model_version:'scoring-decay-rest-2026-v1',season:2026,status:'VALIDATED_SHADOW_CANDIDATE',
    generated_at:new Date().toISOString(),sportsbook_inputs_used:false,trained_through_season:2025,
    half_life_games:fitted.half_life_games,ridge_lambda:fitted.ridge_lambda,margin:fitted.margin,total:fitted.total,
    hfa:avg(games.map(g=>g.hs-g.as)),prior_season:2025,prior,
    distribution:{team_score_sd:Math.sqrt((vh+va)/2),home_away_score_correlation:covariance/Math.sqrt(vh*va),
      source:'Earlier-fit held-out 2024/2025 prediction residuals',games:residuals.length},
    validation_path:'data/probability/generated/matchup-score-validation-2026.json',
    numeric_features:['prior/current team scoring offense versus opponent points allowed','historically selected current-season decay','empirical home advantage, removed at neutral venues','rest differential'],
    excluded_numeric_features:['granular EPA/pace/explosive matchup extension failed ablation','observed personnel continuity failed ablation','injury and coaching coefficients not validated']};
  fs.writeFileSync('data/probability/generated/game-scoring-model-2026.json',JSON.stringify(artifact,null,2)+'\n');
}
const result={schema_version:1,status:'RESEARCH_ONLY',automatic_promotion:false,sportsbook_inputs_used:false,
  feature_cutoff:'Strictly earlier regular-season weeks; no current-game starters, player box scores, or future rosters',
  baseline:'Deployed three-season scoring averages, eight-game league shrinkage, empirical home advantage',
  personnel_scope:'Previously observed passing, rushing and target allocation to prior-season team contributors; not current injury impact',
  held_out_seasons:contract.held_out_test_seasons,sources,results,gates,
  limitations:['Historical tests are retrospective; no evidence of prospective profitability.','No trained current-injury or coaching-change adjustment.','Week 1 deployment is explicitly unknown.','Held-out comparisons require subsequent prospective evaluation.']};
fs.mkdirSync('data/probability/generated',{recursive:true});
fs.writeFileSync('data/probability/generated/matchup-score-validation-2026.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({results,gates},null,2));
