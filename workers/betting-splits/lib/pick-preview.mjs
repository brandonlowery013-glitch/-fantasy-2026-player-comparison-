// Read-only explanations of the evaluated picks. Text rankings never enter a model.
const canon=t=>({LA:'LAR',WAS:'WSH',JAC:'JAX'}[String(t||'').toUpperCase()]||String(t||'').toUpperCase());
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const fmt=x=>x.toFixed(1),pct=x=>(100*x).toFixed(1)+'%';
const nameKey=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const norm=s=>String(s||'').replace(/^(LA|WAS|JAC)(?= )/,t=>canon(t));
function quoteFor(g){return (g.snapshot_evaluations||[]).filter(q=>q.eligible_for_current_recommendation===true&&Date.parse(q.captured_at)<Date.parse(g.kickoff)).sort((a,b)=>Date.parse(b.captured_at)-Date.parse(a.captured_at)).find(q=>q.book==='draftkings')||(g.snapshot_evaluations||[]).filter(q=>q.eligible_for_current_recommendation===true&&Date.parse(q.captured_at)<Date.parse(g.kickoff)).sort((a,b)=>Date.parse(b.captured_at)-Date.parse(a.captured_at))[0];}
function validProfile(p,g){return p&&Date.parse(p.kickoff)===Date.parse(g.kickoff)&&canon(p.home_team)===canon(g.home_team)&&canon(p.away_team)===canon(g.away_team)&&p.evidence?.length===2&&p.evidence.every(e=>e.n>0&&Array.isArray(e.ids)&&e.ids.length>0&&Date.parse(e.through)<Date.parse(g.kickoff))&&p.evidence.some(e=>canon(e.team)===canon(g.home_team))&&p.evidence.some(e=>canon(e.team)===canon(g.away_team));}
function injuries(game,preview,availability,now){
 if(now>=Date.parse(game.kickoff)||!availability||Date.parse(availability.observed_at)>now||now-Date.parse(availability.observed_at)>30*60000)return [];
 const out=[];
 for(const team of [game.away_team,game.home_team]){
  const players=game.personnel_context?.teams?.[team]?.players||game.personnel_context?.teams?.[canon(team)]?.players||[],profile=preview.evidence.find(p=>canon(p.team)===canon(team));
  for(const i of availability.injuries||[]){if(canon(i.team)!==canon(team)||!/^(out|doubtful|questionable|inactive)$/i.test(i.status)||Date.parse(i.source_updated_at)>now||now-Date.parse(i.source_updated_at)>72*3600000)continue;
   const player=players.find(p=>nameKey(p.name)===nameKey(i.name)),roles=player?.depth_roles||[],leader=Object.values(profile?.leaders||{}).some(p=>nameKey(p.name)===nameKey(i.name));
   if(!leader&&!roles.some(r=>r.rank===1))continue;
   const position=player?.position||(nameKey(profile?.leaders?.quarterback?.name)===nameKey(i.name)?'QB':nameKey(profile?.leaders?.receiver?.name)===nameKey(i.name)?'WR':nameKey(profile?.leaders?.runner?.name)===nameKey(i.name)?'RB':'');
   if(/^(WR|TE|RB)$/.test(position)&&!leader)continue;
   out.push({...i,team:canon(team),position,priority:position==='QB'?5:/^(C|OG|OT|G|T|OL)$/.test(position)?4:/^(WR|TE|RB)$/.test(position)?3:2});
  }
 }
 return out.sort((a,b)=>b.priority-a.priority||Number(/^(out|inactive)$/i.test(b.status))-Number(/^(out|inactive)$/i.test(a.status)));
}
function injuryRead(i){
 const uncertain=/questionable/i.test(i.status),status=uncertain?'is questionable':/doubtful/i.test(i.status)?'is doubtful':'is listed out';
 const impact=i.position==='QB'?'Keeping drives alive will depend on who takes the snaps and how the offense functions around him.':/^(C|OG|OT|G|T|OL)$/.test(i.position)?'The available blockers may have to cover a different assignment to keep passing downs manageable.':/^(WR|TE)$/.test(i.position)?'Other receivers may have to handle important targets and keep the passing game moving.':i.position==='RB'?'The other backs may have to handle more carries and passing-down work.':'The defense may have to change who handles those assignments.';
 return `${i.name} ${status}. ${uncertain?'If he cannot play, the lineup and responsibilities will change. ':''}${impact}`;
}
function angles(p,o,concerns){
 const a=[],add=(id,score,text)=>a.push({id,score,text,teams:[p.team,o.team],game_ids:[...p.ids,...o.ids]});
 const receiver=p.leaders?.receiver,receiverOut=receiver&&concerns.some(i=>i.team===canon(p.team)&&nameKey(i.name)===nameKey(receiver.name)&&/^(out|doubtful|inactive)$/i.test(i.status));
 if(finite(p.rush)&&finite(o.rushAllowed)&&o.rushAllowed-p.rush>=.3)add('run-opening',2+(o.rushAllowed-p.rush),`${p.team} can attack on the ground to keep the chains manageable: ${o.team} has allowed ${fmt(o.rushAllowed)} yards a carry, above ${p.team}’s recent ${fmt(p.rush)}. Taking that opening would reduce the number of obvious passing downs and help ${p.team} control its possessions.`);
 if(finite(p.rushAllowed)&&finite(o.rush)&&o.rush-p.rushAllowed>=.3)add('run-defense',2+(o.rush-p.rushAllowed),`${p.team}’s run defense offers a way to disrupt ${o.team}’s plan. It has allowed ${fmt(p.rushAllowed)} yards a carry against an offense gaining ${fmt(o.rush)}. If that holds, ${o.team} would have to sustain more drives through its passing game.`);
 if(finite(p.pass)&&finite(o.passAllowed)&&o.passAllowed-p.pass>=25)add('passing-opening',2+(o.passAllowed-p.pass)/80,`${o.team} has allowed more through the air than ${p.team} has usually produced (${fmt(o.passAllowed)} net yards a game versus ${fmt(p.pass)}). ${p.team} has a route to longer drives by taking those completions${receiver&&!receiverOut?` through ${receiver.name}, who drew ${receiver.value} targets last time`:''}, rather than depending on short fields.`);
 if(finite(p.passAllowed)&&finite(o.pass)&&o.pass-p.passAllowed>=25)add('passing-defense',2+(o.pass-p.passAllowed)/80,`${p.team} can make ${o.team} work harder for its passing production. Its defense has allowed ${fmt(p.passAllowed)} net passing yards a game against an offense producing ${fmt(o.pass)}. Holding that passing game below its recent level would cut off a major route to sustained scoring.`);
 if(finite(p.thirdDown)&&finite(o.thirdDown)&&p.thirdDown-o.thirdDown>=.05)add('third-downs',2+(p.thirdDown-o.thirdDown)*8,`${p.team} has been extending drives more consistently on third down (${pct(p.thirdDown)} versus ${o.team}’s ${pct(o.thirdDown)}). Repeating that advantage would create more chances to finish possessions and fewer opportunities for ${o.team} to answer.`);
 if(finite(o.sacks)&&finite(p.sacksMade)&&o.sacks>=2.5&&p.sacksMade>=2)add('pressure',2+Math.min(o.sacks,p.sacksMade)/3,`${p.team} can attack a protection problem: ${o.team} has surrendered ${fmt(o.sacks)} sacks per game, while ${p.team} has made ${fmt(p.sacksMade)}. Sacks would leave ${o.team} needing longer conversions and make it harder to keep scoring drives alive.`);
 if(finite(p.turnovers)&&finite(o.turnovers)&&o.turnovers-p.turnovers>=.5)add('ball-security',1+(o.turnovers-p.turnovers),`${p.team} has been giving away fewer possessions (${fmt(p.turnovers)} turnovers per game versus ${o.team}’s ${fmt(o.turnovers)}). If it protects the ball again, ${o.team} would have to create its points on longer drives instead of being handed short fields.`);
 const missing=concerns.find(i=>i.team===canon(o.team));if(missing)add('opponent-availability',missing.position==='QB'?8:missing.priority/2,`${injuryRead(missing)} ${p.team} has an opening if ${o.team} cannot reproduce the same execution with its available lineup.`);
 return a.sort((x,y)=>y.score-x.score);
}
function requirement(kind,selection,home,g,line){
 const team=canon(home?g.home_team:g.away_team),other=canon(home?g.away_team:g.home_team),n=home?line:-line;
 if(kind==='moneyline')return `${team} only needs to finish ahead of ${other}; the size of the win does not matter.`;
 if(n<0)return `${team} must win by at least ${Math.floor(Math.abs(n))+1} to cover${Number.isInteger(Math.abs(n))?`; a ${Math.abs(n)}-point win is a push`:''}.`;
 if(n>0)return `${team} can win or lose by ${Math.ceil(n)-1} or fewer and still cover${Number.isInteger(n)?`; a ${n}-point loss is a push`:''}.`;
 return `${team} needs to win; a tie returns the stake.`;
}
function priceRead(e,home,kind,selection){
 const decision=e.recommendation?.decision||'WAIT',v=home?e.side_a:e.side_b;
 if(decision==='WAIT')return 'We are holding off on a bet while this market’s player-status review is unresolved.';
 if(decision==='PASS')return v?.expected_value<=0?'We lean this way, but the current price pays too little for the risk, so this is not a recommended bet.':'We lean this way, but the advantage at the current price is too small for a recommended bet.';
 if(decision==='PICK'&&norm(e.recommendation.selection)!==norm(selection))return `The outcome lean is ${selection}; the price-based betting recommendation is ${e.recommendation.selection}.`;
 return `The estimated ${kind==='spread'?'cover':kind==='total'?'win':'outright-win'} chance is high enough at the offered price to recommend this side.`;
}
function modelRead(e,home,kind,selection){
 const c=e.calibration;if(!c)return '';
 const orient=x=>home?x:1-x,book=finite(c.book_probability)?orient(c.book_probability):null,cal=finite(c.calibrated_probability)?orient(c.calibrated_probability):null,football=finite(c.football_probability)?orient(c.football_probability):null;
 if(kind==='spread')return cal!==null&&cal<.5?`What we learned from earlier games is what tips the final estimate toward ${selection}.`:`The odds, adjusted using earlier game results, favor ${selection} at this line.`;
 const team=selection.split(' ')[0];
 if(book>.5&&football>.5)return `The football forecast and sportsbook odds both favor ${team} to win.`;
 if(book<.5&&football<.5)return `The adjustment learned from earlier results is what tips the final win estimate toward ${team}.`;
 return `The football forecast and odds disagree; the combined estimate still favors ${team} after allowing for earlier results.`;
}
function calculationRead(e,home,kind){
 const c=e.calibration,orient=x=>home?x:1-x;
 if(!c)return null;
 const book=finite(c.book_probability)?orient(c.book_probability):null,calibrated=finite(c.calibrated_probability)?orient(c.calibrated_probability):null,final=(home?e.side_a:e.side_b)?.conditional_win_probability;
 return {sportsbook_probability:book,earlier_results_probability:calibrated,final_probability:final,football_probability:finite(c.football_probability)?orient(c.football_probability):null,learning_change:finite(c.learning_change)?c.learning_change*(home?1:-1):null,scope:kind==='spread'?'Exact evaluated spread quote, earlier-result adjustment, then the saved team-performance learning.':'Original football forecast, exact evaluated moneyline quote, earlier-result adjustment, then the saved team-performance learning.'};
}
function teamExplanation(kind,g,q,e,preview,concerns){
 const d=e.model_prediction;if(!d?.selection||d.exact_probability_tie===true)return {kind,selection:null,decision:e.recommendation?.decision||'WAIT',why:'The evaluated probabilities do not favor either side. We are not treating the tie-break as a football advantage.',risk:'A tiny change in the line or price can move an even matchup either way.',evidence_ids:[]};
 const home=canon(d.selection.split(' ')[0])===canon(g.home_team),p=preview.evidence.find(p=>canon(p.team)===canon(home?g.home_team:g.away_team)),o=preview.evidence.find(p=>canon(p.team)===canon(home?g.away_team:g.home_team));
 if(!p||!o)return null;
 const own=angles(p,o,concerns),opposing=angles(o,p,concerns),ownInjury=concerns.find(i=>i.team===canon(p.team)),line=q.market?.home_spread,need=requirement(kind,d.selection,home,g,line),close=d.probability<.52;
 let why=close?`This is essentially an even matchup; ${d.selection} is only a slight lean. ${need}`:need;
 why+=' '+modelRead(e,home,kind,d.selection)+' '+(own[0]?.text||`${p.team}’s case rests on keeping possessions intact and forcing ${o.team} to earn its points. The recent football comparisons do not provide a clear standalone advantage for this side; the lean comes from the evaluated odds and earlier results.`);

 why+=' '+priceRead(e,home,kind,d.selection);
 let risk=ownInjury?injuryRead(ownInjury)+' ':'';
 risk+=(opposing.find(x=>!ownInjury||!x.text.includes(ownInjury.name))?.text)||`${o.team} can reverse that script by protecting the ball and finishing its drives. ${p.team} cannot count on favorable field position or turnovers to supply its scoring.`;
 if(kind==='spread'){const n=home?line:-line;risk+=' '+(n<0?`Even if ${p.team} wins, late points from ${o.team} could keep the margin inside ${Math.abs(n)}.`:n>0?`${p.team} loses that cushion if sacks or giveaways turn a close game into a deficit larger than ${n}.`:`A tie would return the stake; a loss would beat this pick.`);}
 else risk+=` If ${o.team} controls the final possessions instead, a close game can still end in an outright loss for ${p.team}.`;
 return {kind,selection:d.selection,decision:e.recommendation?.decision||'WAIT',recommendation_selection:e.recommendation?.selection||null,probability:d.probability,why,risk,calculation:calculationRead(e,home,kind),evidence_ids:[...new Set([...p.ids,...o.ids])],quote:{snapshot_id:e.quote?.snapshot_id||q.snapshot_id,book:e.quote?.book||q.book,captured_at:e.quote?.captured_at||q.captured_at}};
}
function totalExplanation(g,q,e,preview,concerns){
 const d=e.model_prediction;if(!d?.selection||d.exact_probability_tie)return {kind:'total',selection:null,decision:e.recommendation?.decision||'WAIT',why:'The forecasted game outcomes are evenly split at this total; there is no scoring advantage to explain.',risk:'A single score can move an even total either way.',evidence_ids:[]};
 const over=d.selection.startsWith('OVER '),line=q.market?.total,[a,h]=preview.evidence,all=preview.evidence,attacks=[...angles(a,h,concerns),...angles(h,a,concerns)].filter(x=>['passing-opening','run-opening','third-downs'].includes(x.id)),stops=[...angles(a,h,concerns),...angles(h,a,concerns)].filter(x=>['passing-defense','run-defense','pressure','opponent-availability'].includes(x.id));
 const scoring=g.scoring_only_baseline||g.football_projection,total=scoring?.model_total??(finite(scoring?.home_score_mean)&&finite(scoring?.away_score_mean)?scoring.home_score_mean+scoring.away_score_mean:null),meanSupports=finite(total)&&(over?total>line:total<line);
 let why=over?`This pick needs both offenses to turn possessions into points and get the game above ${line}.`:`This pick needs enough drives to end in punts, field goals or lost possessions to keep the game below ${line}.`;
 if(meanSupports)why+=` The scoring forecast averages ${fmt(total)} combined points, ${over?'above':'below'} the line.`;
 else why+=` More of the forecasted game outcomes finish ${over?'above':'below'} the line${finite(total)?`, even though the average total is ${fmt(total)}`:''}.`;
 const support=(over?attacks:stops).sort((x,y)=>y.score-x.score)[0],counter=(over?stops:attacks).sort((x,y)=>y.score-x.score)[0];
 why+=' '+(support?.text||(over?`${a.team} and ${h.team} need to sustain drives instead of relying on turnovers to provide short fields.`:`The path is for ${a.team} and ${h.team} to make the opposing offense earn long drives rather than handing over easy scoring chances.`));
 why+=' '+priceRead(e,over,'total',d.selection);
 let risk=counter?.text||(over?'Sacks and empty red-zone trips can turn promising yardage into too few points.':'Short fields or a defensive touchdown can create scoring without either offense sustaining a drive.');
 const injury=concerns[0];if(over&&injury&&!risk.includes(injury.name))risk+=' '+injuryRead(injury);
 risk+=over?' If those possessions end in punts or field goals instead of touchdowns, the game can stay under despite moving the ball.':' Turnovers that give an offense a short field, a late touchdown or overtime can push the total over even when much of the game has been low-scoring.';
 return {kind:'total',selection:d.selection,decision:e.recommendation?.decision||'WAIT',recommendation_selection:e.recommendation?.selection||null,probability:d.probability,why,risk,evidence_ids:[...new Set(all.flatMap(p=>p.ids))],quote:{snapshot_id:q.snapshot_id,book:q.book,captured_at:q.captured_at}};
}
export function explainGamePicks(game,preview,availability,now=Date.now()){
 if(!validProfile(preview,game))return null;
 const quote=quoteFor(game);if(!quote)return null;
 const concerns=injuries(game,preview,availability,now),markets=[];
 for(const kind of ['spread','total','moneyline']){const e=quote.markets?.[kind];if(!e)continue;if(kind!=='total'&&e.model_version!==(kind==='spread'?'sportsbook-calibration-learning-v1':'football-sportsbook-learning-v1'))continue;const card=kind==='total'?totalExplanation(game,quote,e,preview,concerns):teamExplanation(kind,game,quote,e,preview,concerns);if(card)markets.push(card);}
 return {away_team:game.away_team,home_team:game.home_team,kickoff:game.kickoff,generated_at:preview.generated_at,explained_at:new Date(now).toISOString(),markets,sources:[...(preview.sources||[]),...concerns.filter(i=>i.source_url).map(i=>({label:i.name+' availability',url:i.source_url,at:i.source_updated_at}))],availability:concerns.map(i=>({team:i.team,name:i.name,status:i.status,position:i.position,source_updated_at:i.source_updated_at})),evidence_scope:'Prior verified games only; descriptive football scenarios do not change any selected model output.'};
}
export function withPickPreviews(feed,previews,availability,now=Date.now()){
 if(previews?.week!==feed.week||previews?.season!==feed.season)return feed;
 const games={};for(const [id,g]of Object.entries(feed.games||{}))games[id]={...g,matchup_preview:explainGamePicks(g,previews.games?.[id],availability,now)};
 return {...feed,games};
}
