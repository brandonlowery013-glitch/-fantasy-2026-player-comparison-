export const SCORES_SOURCE='https://www.scoresandodds.com/nfl/consensus-picks';
const canon=t=>({LA:'LAR',WAS:'WSH',JAC:'JAX'}[t]||t),text=s=>s.replace(/<[^>]*>/g,'').trim();
export function parseScoresSplits(html,{events,season,week},observedAt){
 const games=new Map(),sourceWeek=html.match(/rel="canonical"[^>]*href="[^"]*week=(\d+)-reg-(\d+)/),now=Date.parse(observedAt);
 if(Number(sourceWeek?.[1])!==Number(season)||Number(sourceWeek?.[2])!==Number(week))return {source:'ScoresAndOdds',source_url:SCORES_SOURCE,observed_at:observedAt,games:[]};
 const cards=html.split(/<div class="trend-card consensus /).slice(1);
 for(const card of cards){
  const kind=card.match(/data-market="(moneyline|spread|total)"/)?.[1],teams=[...card.matchAll(/class="team-flag"\s+([A-Z]{2,3})"/g)].slice(0,2).map(m=>canon(m[1])),providerStart=card.match(/data-role="localtime" data-value="([^"]+)"/)?.[1];if(!kind||teams.length!==2||!Number.isFinite(Date.parse(providerStart)))continue;
  const candidates=events.filter(e=>{const cs=e.competitions?.[0]?.competitors||[];return canon(cs.find(c=>c.homeAway==='away')?.team?.abbreviation)===teams[0]&&canon(cs.find(c=>c.homeAway==='home')?.team?.abbreviation)===teams[1];});if(candidates.length!==1)continue;
  const event=candidates[0],offset=Date.parse(providerStart)-Date.parse(event.date);
  // The public Week 8 board has a one-hour DST clock error. Match the unique
  // same-week team pairing and calendar date, retain the discrepancy, and use
  // ESPN's scheduled kickoff. Never remap a different date or week.
  if(![0,3600000,-3600000].includes(offset)||providerStart.slice(0,10)!==event.date.slice(0,10)||event.status?.type?.completed||Date.parse(event.date)<=now)continue;
  const graph=card.match(/<span class="trend-graph-chart"[\s\S]*?<span class="best-odds">/)?.[0]||'',bars=[...graph.matchAll(/<span class="percentage-([ab])"[^>]*style="width:(\d{1,3})%;[^"]*"[^>]*>(?:\d{1,3}%|&nbsp;)<\/span>/g)];
  if(bars.length!==4||bars.map(x=>x[1]).join('')!=='abab')continue;const [ba,bb,ma,mb]=bars.map(x=>Number(x[2]));if([ba,bb,ma,mb].some(n=>n<0||n>100)||Math.abs(ba+bb-100)>1||Math.abs(ma+mb-100)>1)continue;
  const id=String(event.id),g=games.get(id)||{event_id:id,away:teams[0],home:teams[1],start_at:event.date,source_start_at:providerStart,kickoff_offset_seconds:offset/1000,schedule_match:offset?'EXACT_WEEK_TEAMS_DATE_WITH_SOURCE_DST_OFFSET':'EXACT_KICKOFF',observed_at:observedAt,source:'ScoresAndOdds',source_url:SCORES_SOURCE,market_observed_at:{}};
  const labels=[...graph.matchAll(/<strong>([\s\S]*?)<\/strong>/g)].slice(0,2).map(m=>text(m[1]).replace(/\s+/g,' '));
  g[kind]=[{side:kind==='total'?'Over':teams[0],label:labels[0],bets:ba,money:ma},{side:kind==='total'?'Under':teams[1],label:labels[1],bets:bb,money:mb}];g.market_observed_at[kind]=observedAt;games.set(id,g);
 }
 return {source:'ScoresAndOdds',source_url:SCORES_SOURCE,season,week,observed_at:observedAt,coverage:'Public ticket and money percentages; source check time is not the time each wager was placed.',games:[...games.values()]};
}
