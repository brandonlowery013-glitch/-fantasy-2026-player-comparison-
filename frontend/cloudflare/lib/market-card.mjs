const codes=['ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC','LV','LAC','LAR','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SF','SEA','TB','TEN','WSH'];
const names=['Arizona Cardinals','Atlanta Falcons','Baltimore Ravens','Buffalo Bills','Carolina Panthers','Chicago Bears','Cincinnati Bengals','Cleveland Browns','Dallas Cowboys','Denver Broncos','Detroit Lions','Green Bay Packers','Houston Texans','Indianapolis Colts','Jacksonville Jaguars','Kansas City Chiefs','Las Vegas Raiders','Los Angeles Chargers','Los Angeles Rams','Miami Dolphins','Minnesota Vikings','New England Patriots','New Orleans Saints','New York Giants','New York Jets','Philadelphia Eagles','Pittsburgh Steelers','San Francisco 49ers','Seattle Seahawks','Tampa Bay Buccaneers','Tennessee Titans','Washington Commanders'];
const canon=n=>codes[names.indexOf(n)]||({LA:'LAR',WAS:'WSH',JAC:'JAX'}[n]||n);
const signed=n=>typeof n==='number'&&Number.isFinite(n)?(n>0?'+':'')+n:'—';
export function cardQuote(game,feed){
 const start=Date.parse(game.event_start||game.kickoff||game.start_at);
 const match=feed?.games?.find(x=>canon(x.home_team)===canon(game.home_team)&&canon(x.away_team)===canon(game.away_team)&&Date.parse(x.start_at)===start);if(!match)return null;
 const books=(match.bookmakers||[]).filter(b=>Date.parse(b.last_update)<start&&Number.isFinite(Date.parse(b.last_update))).sort((a,b)=>Date.parse(b.last_update)-Date.parse(a.last_update));
 const book=books.find(b=>['h2h','spreads','totals'].every(k=>b.markets?.some(m=>m.key===k)))||books[0];if(!book)return null;
 const side=(k,n)=>book.markets?.find(m=>m.key===k)?.outcomes?.find(o=>canon(o.name)===n);
 const a=canon(game.away_team),h=canon(game.home_team),over=side('totals','Over'),under=side('totals','Under');
 return {book:book.title||book.key,at:book.last_update,rows:[['Moneyline',`${a} ${signed(side('h2h',a)?.price)}`,`${h} ${signed(side('h2h',h)?.price)}`],['Spread',`${a} ${signed(side('spreads',a)?.point)} (${signed(side('spreads',a)?.price)})`,`${h} ${signed(side('spreads',h)?.point)} (${signed(side('spreads',h)?.price)})`],['Total',`Over ${over?.point??'—'} (${signed(over?.price)})`,`Under ${under?.point??'—'} (${signed(under?.price)})`]]};
}
export function cardOddsHTML(game,feed,esc,now=Date.now()){
 const q=cardQuote(game,feed);if(!q)return '<div class="ctdCardOdds"><strong>Sportsbook odds &amp; totals</strong><p class="ctdSplitEmpty">Quotes unavailable · Percentages are tracked separately.</p></div>';
 const age=now-Date.parse(q.at),archived=now>=Date.parse(game.event_start||game.kickoff||game.start_at);
 return `<div class="ctdCardOdds"><div class="ctdSplitHeading"><strong>Odds &amp; totals</strong><span>${esc(q.book)}</span></div>${q.rows.map(([kind,a,h])=>`<div class="ctdCardQuote"><small>${kind}</small><b>${esc(a)}</b><b>${esc(h)}</b></div>`).join('')}<p class="ctdSplitChecked">${archived?'Archived pregame':age>900000?'Stale quote':'Quote'} · ${esc(new Date(q.at).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))}</p></div>`;
}
