import {parseSplits,SOURCE} from './public-splits.mjs';
import {preservePublished} from './splits-history.mjs';
export const DATA_BRANCH='data/betting-splits';
export const ROOT='data/betting-splits';
export const MARKETS=['moneyline','spread','total'];
export function upcoming(schedule,now=Date.now()){
 return (schedule.events||[]).filter(e=>Date.parse(e.date)>now&&!e.status?.type?.completed);
}
export async function collectSplits({fetcher=fetch,now=Date.now()}={}){
 const read=async url=>{const r=await fetcher(url,{signal:AbortSignal.timeout(20000),headers:{accept:'application/json,text/html','user-agent':'ChuckTheDuke-background-splits/1.0'}});if(!r.ok)throw Error('Provider HTTP '+r.status);const s=await r.text();if(s.length>2000000)throw Error('Provider response too large');return s;};
 const scoreboard='https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=100';
 let schedule=JSON.parse(await read(scoreboard));
 const week=Number(schedule.week?.number);
 if(schedule.events?.length&&schedule.events.every(e=>e.status?.type?.completed)&&Number.isInteger(week)&&week<18){
  schedule=JSON.parse(await read(`${scoreboard}&dates=${schedule.season?.year||new Date(now).getUTCFullYear()}&seasontype=2&week=${week+1}`));
 }
 if(!Array.isArray(schedule.events)||schedule.events.some(e=>!e.id||!Number.isFinite(Date.parse(e.date))||!Array.isArray(e.competitions?.[0]?.competitors)))throw Error('Invalid provider schedule');
 const events=upcoming(schedule,now),observed_at=new Date(now).toISOString();
 if(!events.length)return {schema_version:1,observed_at,source_url:SOURCE,games:[],expected_games:0,status:'IDLE'};
 const pages=await Promise.all([SOURCE,SOURCE.replace('tb_page=1','tb_page=2')].map(async url=>parseSplits(await read(url),events,new Date().toISOString())));
 const games=preservePublished(pages[1],pages[0]).games.filter(g=>Date.parse(g.observed_at)<Date.parse(g.start_at));
 if(!games.length)throw Error('No verified pregame splits in provider response');
 const complete=games.length===events.length&&games.every(g=>MARKETS.every(m=>g[m]?.length===2));
 return {schema_version:1,observed_at:new Date().toISOString(),source:'DraftKings Sportsbook',source_url:SOURCE,coverage:'DraftKings only; bets are ticket share and money is handle share, not identified professional bettors',numeric_authority:0,games,expected_games:events.length,status:complete?'CURRENT':'PARTIAL'};
}
export function publication(previous,index,history,capture,run){
 const day=capture.observed_at.slice(0,10),capture_id=String(run.id);
 const entry={capture_id,event:run.event,run_url:run.url,...capture};
 const snapshots=history?.snapshots||[];
 const nextHistory={schema_version:1,date:day,snapshots:snapshots.some(s=>s.capture_id===capture_id)?snapshots:[...snapshots,entry]};
 const latest={...preservePublished(capture,previous),collection:{capture_id,event:run.event,run_url:run.url,last_success_at:capture.observed_at,status:capture.status,cadence_minutes:15},history:{index:'/api/live/splits?history=index',date:day}};
 const nextIndex={schema_version:1,updated_at:capture.observed_at,days:[...new Set([...(index?.days||[]),day])].sort(),latest_capture_id:capture_id};
 return {latest,index:nextIndex,history:nextHistory};
}
