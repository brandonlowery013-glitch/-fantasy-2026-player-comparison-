// Only rendered, publicly visible table cells. Never reads hydration data or locked money fields.
export const ACTION_SOURCE='https://www.actionnetwork.com/nfl/public-betting';
const canon=t=>({LA:'LAR',WAS:'WSH',JAC:'JAX'}[t]||t);
const text=s=>s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').trim();
export function parseActionPublic(html,events,observedAt){
 const now=Date.parse(observedAt),games=[];
 // This public page defaults to spread. Reject a changed market instead of assigning it incorrectly.
 const selects=[...html.matchAll(/<select\b[^>]*>([\s\S]*?)<\/select>/gi)];
 if(!/<option\b(?=[^>]*value="spread")(?=[^>]*selected)[^>]*>/i.test(selects[1]?.[1]||''))return {source:'Action Network',source_url:ACTION_SOURCE,observed_at:observedAt,games};
 const table=html.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i)?.[1]||'';
 for(const match of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
  const cells=[...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>m[1]);if(cells.length<5)continue;
  const teams=[...cells[0].matchAll(/class="game-info__team--mobile"[^>]*>([\s\S]*?)<\/div>/g)].map(m=>canon(text(m[1])));if(teams.length!==2)continue;
  const day=cells[0].match(/href="\/nfl-game\/[^"/]*-([a-z]+)-(\d{1,2})-(\d{4})\/\d+"/i);if(!day)continue;
  const sourceDate=Date.parse(`${day[1]} ${day[2]}, ${day[3]} 12:00:00 GMT`);if(!Number.isFinite(sourceDate))continue;
  const event=events.find(e=>{const cs=e.competitions?.[0]?.competitors||[];return canon(cs.find(c=>c.homeAway==='away')?.team?.abbreviation)===teams[0]&&canon(cs.find(c=>c.homeAway==='home')?.team?.abbreviation)===teams[1]&&new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(e.date))===new Date(sourceDate).toISOString().slice(0,10);});
  if(!event||event.status?.type?.completed===true||Date.parse(event.date)<=now)continue;
  const percentages=cell=>{if(/Locked Content|locked-content|\/upgrade/i.test(cell))return null;const vals=[...text(cell).matchAll(/(\d{1,3})\s*%/g)].map(m=>Number(m[1]));return vals.length===2&&vals.every(n=>n>=0&&n<=100)&&Math.abs(vals[0]+vals[1]-100)<=1?vals:null;};
  const bets=percentages(cells[3]),money=percentages(cells[4]);if(!bets&&!money)continue;
  games.push({event_id:String(event.id),away:teams[0],home:teams[1],start_at:event.date,observed_at:observedAt,source:'Action Network',source_url:ACTION_SOURCE,spread:teams.map((side,i)=>({side,bets:bets?.[i]??null,money:money?.[i]??null}))});
 }
 return {source:'Action Network',source_url:ACTION_SOURCE,observed_at:observedAt,coverage:'Public spread tickets; money only where publicly published. Other markets remain unavailable.',games};
}
