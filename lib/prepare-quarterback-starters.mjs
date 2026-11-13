import {quarterbackStarterNews} from './quarterback-starter-news.mjs';
import {quarterbackLiveFeatures} from './quarterback-live-features.mjs';
import {canon} from './game-scoring-calibration.mjs';
export function prepareQuarterbackStarters({news,games,players,stats,teamStats,schedule,model,previous,receivedAt,sourceIds,injuries=[]}){
 const parsed=quarterbackStarterNews({articles:news.articles,games,players,receivedAt});
 const output={captured_at:receivedAt,source:'ESPN dated starter announcements',games:{},rejected:parsed.rejected};
 for(const game of games){
  if(Date.parse(game.kickoff)<=Date.parse(receivedAt))continue;
  const reports=[...(previous?.games?.[game.id]?.supporting_reports||previous?.games?.[game.id]?.reports||[]),...parsed.reports.filter(r=>r.game_id===game.id)];
  const latest=new Map();
  for(const r of reports.filter(r=>r.verified===true&&r.game_id===game.id&&Date.parse(r.received_at)<=Date.parse(receivedAt)).sort((a,b)=>Date.parse(a.reported_at)-Date.parse(b.reported_at))){latest.set(canon(r.team),r);}
  if(!latest.size)continue;
  const home=latest.get(canon(game.home_team)),away=latest.get(canon(game.away_team));
  const current=[...latest.values()].sort((a,b)=>Date.parse(a.reported_at)-Date.parse(b.reported_at)).at(-1);
  const entry={reports:[current],scenarios:[],supporting_reports:[...latest.values()]};output.games[game.id]=entry;
  try{
   if(!home?.confirmed_starter_id||!away?.confirmed_starter_id||![home,away].every(r=>['CONFIRMED_PLAYING','REPLACEMENT_CONFIRMED'].includes(r.status)))throw Error('Both starting quarterbacks need dated confirmation');
   for(const report of [home,away]){
    const name=players.find(p=>p.gsis_id===report.confirmed_starter_id)?.display_name;
    const newer=injuries.find(i=>i.player===name&&canon(i.team)===canon(report.team)&&['Q','D','O','IR','SSPD'].includes(i.designation)&&(!Number.isFinite(Date.parse(i.source_updated_at))||Date.parse(i.source_updated_at)>=Date.parse(report.reported_at)));
    if(newer)throw Error(`${name} has an unresolved ${newer.designation} injury report after the starter announcement`);
   }
   const vector=quarterbackLiveFeatures({game,homeQb:home.confirmed_starter_id,awayQb:away.confirmed_starter_id,players,stats,teamStats,schedule,model});
   entry.scenarios=[{...vector,game_id:game.id,model_version:model.version,report_id:current.id,reported_at:current.reported_at,player_id:current.confirmed_starter_id,player_name:players.find(p=>p.gsis_id===current.confirmed_starter_id)?.display_name,inputs_as_of:receivedAt,source_ids:sourceIds,coverage_complete:true,starter_report_ids:[home.id,away.id]}];
  }catch(e){entry.missing_input=e.message;}
 }
 return output;
}
