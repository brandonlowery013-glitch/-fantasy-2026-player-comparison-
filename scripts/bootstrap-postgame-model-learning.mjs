import fs from 'node:fs';
import {appendForecasts,newLedger,gameFeatures} from '../lib/postgame-model-learning.mjs';
import {simulateGameDistribution,outcomeProbabilities} from '../lib/game-market-probability.mjs';
const source=process.argv[2];if(!source)throw Error('Pass a verified archived forecast input file');
const path='data/market/postgame-model-learning-2026.json';if(fs.existsSync(path))throw Error('Never overwrite an existing learning ledger');
const rows=JSON.parse(fs.readFileSync(source,'utf8')).rows,forecasts=[];
const norm=t=>({LA:'LAR',WAS:'WSH',JAC:'JAX'}[t]||t);
for(const r of rows){
 const g=r.forecast.game,m=g.model;
 const probability=r.market==='moneyline'?m.home_win_probability/(m.home_win_probability+m.away_win_probability):outcomeProbabilities(simulateGameDistribution(r.game_id,g).map(d=>d.margin),-r.home_line,'OVER').conditional_win_probability;
 const row={game_id:r.game_id,market:r.market,home_line:r.home_line,season:2026,week:r.week,event_id:r.verified_final.event_id,home_team:norm(g.home_team),away_team:norm(g.away_team),kickoff:r.kickoff,captured_at:r.decision_at,source_generated_at:r.forecast.generated_at,source_commit:r.forecast.source_commit,source:'Archived original football forecast recovered for learning; not a newly issued prediction',model_version:g.model_version||'LEGACY_PRIOR_SCORING_MODEL',probability,home_score_mean:m.home_score_mean,away_score_mean:m.away_score_mean,features:null,evidence:{scoring:g.scoring_evidence||null,quote_snapshot_id:r.sportsbook_snapshot.snapshot_id,quote_at:r.sportsbook_snapshot.captured_at},bootstrap:true};
 row.features=gameFeatures(row,{});forecasts.push(row);
}
const ledger=appendForecasts(newLedger(),forecasts);fs.writeFileSync(path,JSON.stringify(ledger,null,2)+'\n');console.log(JSON.stringify({frozen_forecasts:ledger.forecasts.length,games:new Set(ledger.forecasts.map(r=>r.game_id)).size,weeks:[...new Set(ledger.forecasts.map(r=>r.week))]}));
