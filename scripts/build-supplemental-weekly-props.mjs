import fs from 'node:fs';
import path from 'node:path';
import {regularGames,fitUsage,norm,VERSION} from '../lib/supplemental-weekly-props.mjs';
const root=process.cwd(),read=(p,fallback)=>{try{return JSON.parse(fs.readFileSync(path.join(root,p),'utf8'))}catch(e){if(e.code==='ENOENT'&&fallback!==undefined)return fallback;throw e;}};
const dest='data/market/supplemental-weekly-props-2026.json',old=read(dest,{players:{},forecasts:[],settled:[]});
const projection=read('data/probability/weekly-projection-inputs-2026.json'),quotes=read('data/market/player-prop-board-quotes-2026.json'),schedule=read('data/calibration/weekly-event-schedule-2026.json'),personnel=read('data/ingestion/team-personnel-2026.json');
const now=Date.now(),at=new Date(now).toISOString(),week=Number(schedule.week),roster=Object.values(personnel.teams||{}).flatMap(t=>t.players||[]),targets=new Map(),forecasts=[...(old.forecasts||[])],settled=[...(old.settled||[])],players={},errors=[];
for(const q of quotes.snapshots||[]){if(!['TE','WR'].includes(q.position)||projection.players?.[q.player]||q.week!==week||!(Date.parse(q.kickoff)>now))continue;
 const matches=roster.filter(p=>norm(p.name)===norm(q.player)&&p.team===q.team&&p.position===q.position&&String(p.athlete_id)===String(q.athlete_id));
 const game=schedule.games?.[q.game_id];if(matches.length===1&&game&&Date.parse(game.event_start)===Date.parse(q.kickoff))targets.set(q.player,{player:q.player,athlete_id:String(q.athlete_id),team:q.team,position:q.position,game_id:q.game_id,kickoff:q.kickoff});
}
for(const f of forecasts)if(!targets.has(f.player))targets.set(f.player,{player:f.player,athlete_id:f.athlete_id,team:f.team,position:f.position});
for(const t of [...targets.values()].filter(t=>t.game_id||forecasts.some(f=>f.player===t.player&&Date.parse(f.kickoff)<now&&!settled.some(s=>s.forecast_id===f.forecast_id))).slice(0,16))try{
 const pending=forecasts.some(f=>f.player===t.player&&Date.parse(f.kickoff)<now&&!settled.some(s=>s.forecast_id===f.forecast_id));
 const cached=old.players?.[t.player];
 if(!t.game_id&&!pending)continue;
 if(t.game_id&&cached?.game_id===t.game_id&&now-Date.parse(cached.generated_at)<3600000&&!pending){players[t.player]=cached;continue;}
 const url=`https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${t.athlete_id}/gamelog?season=2026`;
 const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('ESPN '+r.status);const body=await r.json(),games=regularGames(body,{season:2026,team:t.team,now});
 for(const f of forecasts.filter(f=>f.player===t.player&&Date.parse(f.kickoff)<now&&Date.parse(f.generated_at)<Date.parse(f.kickoff)&&!settled.some(s=>s.forecast_id===f.forecast_id))){const game=games.find(g=>g.week===f.week);if(!game)continue;settled.push({forecast_id:f.forecast_id,player:f.player,stat:f.stat,week:f.week,event_id:game.event_id,actual:game[f.stat],mean:f.mean,raw_mean:f.raw_mean??f.mean,settled_at:at,source_url:url});}
 if(!t.game_id)continue;
 const p=fitUsage(games,{...t,week,generated_at:at,settled});if(!p){errors.push({player:t.player,reason:'Fewer than four verified receiving-game logs'});continue;}
 const prior=old.players?.[t.player];players[t.player]=prior?.input_hash===p.input_hash&&now-Date.parse(prior.generated_at)<12*3600000?prior:p;
 for(const [stat,spec]of Object.entries(p.distribution.distributions)){const forecast_id=[VERSION,t.game_id,t.athlete_id,stat,p.input_hash].join(':');if(!forecasts.some(f=>f.forecast_id===forecast_id))forecasts.push({...t,forecast_id,week,stat,mean:p.projection.projections[stat].mean,raw_mean:p.projection.projections[stat].baseline.unadjusted_mean,distribution:spec,generated_at:at,input_hash:p.input_hash});}
}catch(e){errors.push({player:t.player,reason:String(e.message)});const p=old.players?.[t.player];if(p?.week===week&&Date.parse(p.kickoff)>now&&now-Date.parse(p.generated_at)<24*3600000)players[t.player]=p;}
const out={schema_version:1,model_version:VERSION,season:2026,week,generated_at:at,sportsbook_inputs_used:false,canonical_players_changed:false,players,forecasts,settled,errors};
if(JSON.stringify({...out,generated_at:null})===JSON.stringify({...old,generated_at:null}))out.generated_at=old.generated_at;
fs.mkdirSync(path.join(root,'data/market'),{recursive:true});fs.writeFileSync(path.join(root,dest),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({weekly_supplement:Object.keys(players),pregame_forecasts:forecasts.length,graded_results:settled.length,errors,canonical_players_changed:false}));
