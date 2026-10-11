import {parseSplits,SOURCE} from './public-splits.mjs';
export async function capturePublicSplits(schedule,previous={schema_version:1,snapshots:[]}){
 const events=Object.values(schedule.games||{}).map(g=>({id:g.event_id,date:g.event_start,competitions:[{competitors:[{homeAway:'home',team:{abbreviation:g.home_team}},{homeAway:'away',team:{abbreviation:g.away_team}}]}]}));
 const pages=await Promise.all([SOURCE,SOURCE.replace('tb_page=1','tb_page=2')].map(async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(12000),headers:{'user-agent':'fantasy-2026-public-market-context'}});if(!r.ok)throw Error('Public splits unavailable');const html=await r.text();if(html.length>1500000)throw Error('Source too large');return parseSplits(html,events,new Date().toISOString());}));
 const games=[...new Map(pages.flatMap(p=>p.games).map(g=>[g.event_id,g])).values()].filter(g=>Date.parse(g.observed_at)<Date.parse(g.start_at));
 if(!games.length)throw Error('No verified pregame splits');
 return {schema_version:1,source_url:SOURCE,numeric_authority:0,snapshots:[...(previous.snapshots||[]),...games]};
}
