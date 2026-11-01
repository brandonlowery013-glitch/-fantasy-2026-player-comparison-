import {writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {overlayGameFeed} from './workers/betting-splits/lib/personnel-matchup.mjs';
import {overlayFootballMoneyline,attachFootballMoneylineDrivers,FOOTBALL_MONEYLINE_VERSION} from './workers/betting-splits/lib/football-moneyline.mjs';
import {withModelDrivers} from './workers/betting-splits/lib/model-driver-preview.mjs';
import {applyHistoricalSelection,applyHistoricalFinal} from './workers/betting-splits/lib/historical-model-selection.mjs';
import {overlaySpreadFeed,replaceSpreadOutputs} from './workers/betting-splits/lib/spread-feed.mjs';
import {replaceMoneylineOutputs} from './workers/betting-splits/lib/moneyline-feed.mjs';
import historicalSelection from './workers/betting-splits/model/ne-chi-current-models.json' with {type:'json'};
const repo='brandonlowery013-glitch/-fantasy-2026-player-comparison-';
const read=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(url+' '+r.status);return r.json();};
const release=await read('https://api.github.com/repos/'+repo+'/git/ref/heads/main');
const ref=release.object.sha,root='https://raw.githubusercontent.com/'+repo+'/'+ref+'/';
const worker='https://ctd-background-splits.brandonlowery013.workers.dev';
const [base,live,moneyline,rawProjections,learning,personnel]=await Promise.all([
 read(root+'data/market/game-model-consumer-2026.json'),read(worker+'/spread-projections/latest.json'),
 read(worker+'/moneyline-projections/latest.json'),read(root+'data/probability/generated/weekly-game-projections-2026.json'),
 read(root+'data/market/football-moneyline-learning-2026.json'),read(worker+'/game-projections/latest.json')]);
for(const game of Object.values(base.games||{}))delete game.behavior_learning_context;
const projections=overlayGameFeed(rawProjections,personnel,'projections');
if(projections?.personnel_matchup_status==='EXPERIMENTAL_CONDITIONAL')projections.generated_at=personnel.checked_at;
const now=Date.now();
const evaluated=overlayFootballMoneyline(applyHistoricalSelection(overlaySpreadFeed(base,live),historicalSelection),projections,moneyline,now,learning);
const result=attachFootballMoneylineDrivers(await withModelDrivers(evaluated,live,moneyline,rawProjections));
result.delivery={kind:'PRECOMPUTED_SERVER_MODEL',generated_at:new Date(now).toISOString(),expires_at:new Date(now+20*60000).toISOString(),producer_ref:ref,engine_ref:process.env.CTD_ENGINE_REF||null};
if(!Object.keys(result.games||{}).length||result.season!==2026)throw Error('Invalid model publication');
const output=process.argv[2]||'published-recommendations.json';
await writeFile(output,JSON.stringify(result));
await writeFile(output+'.gz',gzipSync(JSON.stringify(result)));
await writeFile(output+'.manifest.json',JSON.stringify({...result.delivery,season:result.season,week:result.week}));
const games={};
for(const [id,g]of Object.entries(result.games)){
 if(Date.parse(g.kickoff)<=now)continue;
 const q=(g.snapshot_evaluations||[]).find(q=>q.markets?.moneyline?.model_version===FOOTBALL_MONEYLINE_VERSION&&q.markets.moneyline.model_prediction);
 if(q)games[id]={game_id:id,home_team:g.home_team,away_team:g.away_team,kickoff:g.kickoff,evaluation:q.markets.moneyline};
}
await writeFile(output+'.moneyline.json',JSON.stringify({season:result.season,week:result.week,status:result.moneyline_model_status,model_version:FOOTBALL_MONEYLINE_VERSION,checked_at:result.delivery.generated_at,sportsbook_inputs_used_for_win_probability:false,learned_correction_enabled:true,automatic_upset_override_enabled:false,games,delivery:result.delivery}));
for(const [kind,path]of [['model','data/market/unified-opportunities-2026.json'],['betting','data/market/final-betting-ui-feed-2026.json']]){
 const source=await read(root+path);
 const data=applyHistoricalFinal(replaceMoneylineOutputs(replaceSpreadOutputs(source,result,live,now),result,null,now,{evaluated:result,version:FOOTBALL_MONEYLINE_VERSION}),historicalSelection);
 await writeFile(output+'.'+kind+'.json.gz',gzipSync(JSON.stringify(data)));
 await writeFile(output+'.'+kind+'-envelope.json.gz',gzipSync(JSON.stringify({generated_at:result.delivery.generated_at,data})));
}
console.log(JSON.stringify({games:Object.keys(result.games).length,delivery:result.delivery}));
