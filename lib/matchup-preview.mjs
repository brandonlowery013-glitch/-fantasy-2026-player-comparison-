// Descriptive football evidence only. Never reads or writes model probabilities.
const canon=t=>({LA:'LAR',WAS:'WSH',JAC:'JAX'}[t]||t);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const fmt=x=>x.toFixed(1);
export const previewKey=g=>`${canon(g.away_team)}@${canon(g.home_team)}:${Date.parse(g.kickoff||g.event_start)}`;
function profile(team,rows,kickoff,now){
 const prior=rows.filter(r=>r.entity_type==='team'&&canon(r.team)===team&&r.verified_final===true&&Date.parse(r.event_start)<Date.parse(kickoff)&&Date.parse(r.observed_at)<=now).sort((a,b)=>Date.parse(b.event_start)-Date.parse(a.event_start));
 const unique=[...new Map(prior.map(r=>[String(r.event_id),r])).values()].slice(0,3);
 const opponents=unique.map(r=>rows.find(o=>o.entity_type==='team'&&o.verified_final===true&&String(o.event_id)===String(r.event_id)&&canon(o.team)!==team&&Date.parse(o.observed_at)<=now));
 const avg=(set,k)=>{const vals=set.map(r=>r?.metrics?.[k]);return vals.length&&vals.every(finite)?vals.reduce((a,b)=>a+b,0)/vals.length:null;};
 const total=(set,k)=>set.reduce((s,r)=>s+(r?.metrics?.[k]||0),0);
 const rate=(set,a,b)=>set.length&&set.every(r=>finite(r?.metrics?.[a])&&finite(r?.metrics?.[b]))&&total(set,b)>0?total(set,a)/total(set,b):null;
 const leaders={};for(const [label,metric]of [['quarterback','pass_attempts'],['runner','rush_attempts'],['receiver','targets']]){const players=rows.filter(r=>r.entity_type==='player'&&canon(r.team)===team&&r.verified_final===true&&String(r.event_id)===String(unique[0]?.event_id)&&Date.parse(r.observed_at)<=now&&finite(r.metrics?.[metric])).sort((a,b)=>b.metrics[metric]-a.metrics[metric]);if(players[0]?.metrics[metric]>0)leaders[label]={name:players[0].player,value:players[0].metrics[metric]};}
 return {team,n:unique.length,ids:unique.map(r=>r.event_id),through:unique[0]?.event_start,opponents:opponents.filter(Boolean).map(r=>canon(r.team)),rush:rate(unique,'rush_yards','rush_attempts'),rushAllowed:rate(opponents,'rush_yards','rush_attempts'),pass:avg(unique,'net_passing_yards'),passAllowed:avg(opponents,'net_passing_yards'),sacks:avg(unique,'sacks_allowed'),sacksMade:avg(opponents,'sacks_allowed'),turnovers:avg(unique,'turnovers'),takeaways:avg(opponents,'turnovers'),thirdDown:rate(unique,'third_down_conversions','third_down_attempts'),leaders};
}
function attack(p,o){
 const sentences=[];
 if(finite(p.rush)&&finite(o.rushAllowed)){const gap=o.rushAllowed-p.rush;sentences.push(`${p.team} has averaged ${fmt(p.rush)} yards per carry across its last ${p.n} games, while ${o.team} has allowed ${fmt(o.rushAllowed)}. ${gap>=.3?'That defensive average leaves a possible opening to improve on the recent rushing output and reach manageable passing downs':gap<=-.3?'This defense has recently held opponents below that rushing average, so sustaining drives may require more from the passing game':'Those averages are close; blocking execution and early-down gains could decide whether the offense avoids long passing downs'}.`);}
 if(finite(p.pass)&&finite(o.passAllowed))sentences.push(`${p.team} has produced ${fmt(p.pass)} net passing yards a game against a defense allowing ${fmt(o.passAllowed)}.${p.leaders.receiver?` ${p.leaders.receiver.name} drew ${p.leaders.receiver.value} targets in the most recent game; that identifies a recent focal point, rather than a promise of the same workload.`:''}`);
 if(finite(p.sacks)&&finite(o.sacksMade))sentences.push(`Protection is a key test: ${p.team} has allowed ${fmt(p.sacks)} sacks per game, and ${o.team} has made ${fmt(o.sacksMade)}. ${o.sacksMade>p.sacks?'If that defensive production carries over, stalled drives could prevent the offense from turning yardage into points.':'Keeping the quarterback upright would give the passing game a better chance to sustain drives.'}`);
 return {title:`${p.team} offense vs. ${o.team} defense`,text:sentences.join(' ')};
}
export function buildPreview(game,ledger,availability,now=Date.now()){
 const kickoff=game.kickoff||game.event_start,cutoff=Math.min(now,Date.parse(kickoff)),rows=(ledger.observations||[]).filter(r=>Number(r.season)===new Date(kickoff).getUTCFullYear()),away=canon(game.away_team),home=canon(game.home_team),profiles=[profile(away,rows,kickoff,cutoff),profile(home,rows,kickoff,cutoff)];
 if(profiles.some(p=>!p.n))throw Error('Recent verified game evidence unavailable');
 const sections=[attack(profiles[0],profiles[1]),attack(profiles[1],profiles[0])].filter(s=>s.text);
 const [a,h]=profiles,swings=[];
 if(finite(a.thirdDown)&&finite(h.thirdDown))swings.push(`${away} has converted ${fmt(a.thirdDown*100)}% of third downs compared with ${home}’s ${fmt(h.thirdDown*100)}%. Winning those downs is one way to create extra possessions and keep the other offense off the field.`);
 if(finite(a.turnovers)&&finite(h.turnovers))swings.push(`Giveaways have averaged ${fmt(a.turnovers)} for ${away} and ${fmt(h.turnovers)} for ${home}. A turnover-driven lead can change the game quickly, so an offense relying on short fields may look stronger on the scoreboard than it does on sustained drives.`);
 if(swings.length)sections.push({title:'What could decide it',text:swings.join(' ')});
 const sources=profiles.flatMap(p=>p.ids.map(id=>({label:`${p.team} recent game`,url:`https://www.espn.com/nfl/boxscore/_/gameId/${id}`})));
 const current=Date.parse(availability?.observed_at)<=now&&now-Date.parse(availability?.observed_at)<30*60000;
 if(current&&now<Date.parse(kickoff))for(const team of [away,home]){
  const official=(availability.games||[]).find(g=>canon(g.team)===team&&Date.parse(g.kickoff)===Date.parse(kickoff)&&g.complete===true);
  const concerns=(availability.injuries||[]).filter(i=>canon(i.team)===team&&/^(out|doubtful|questionable|inactive)$/i.test(i.status)&&Date.parse(i.source_updated_at)<=now&&now-Date.parse(i.source_updated_at)<72*3600000);
  if(official){sections.push({title:`${team} availability`,text:`Official inactives: ${official.inactive_names.join(', ')}. Players on this list will not play; the offense and defense will need to cover their roles.`});sources.push({label:`${team} official inactives`,url:official.source_url,at:official.published_at});}
  else if(concerns.length){sections.push({title:`${team} availability`,text:concerns.slice(0,8).map(i=>`${i.name} is listed as ${i.status.toLowerCase()}`).join('; ')+'. These are the latest reported designations; final game-day availability can change which matchups matter.'});sources.push(...concerns.map(i=>({label:`${i.name} injury report`,url:i.source_url,at:i.source_updated_at})));}
 }
 sections.push({title:'The other side of the matchup',text:`These recent averages cover ${a.n} games for ${away} and ${h.n} for ${home}, against different opponents (${away}: ${a.opponents.join(', ')}; ${home}: ${h.opponents.join(', ')}). They describe possible routes to success, not a guarantee that either team repeats those numbers. A team that protects the ball and finishes drives can beat the apparent yardage matchup.`});
 return {key:previewKey(game),away_team:game.away_team,home_team:game.home_team,kickoff,sections,sources:[...new Map(sources.filter(s=>s.url).map(s=>[s.url+'|'+(s.at||''),s])).values()],evidence:profiles,history_before:kickoff,generated_at:new Date(now).toISOString(),availability_checked_at:current?availability.observed_at:null};
}
