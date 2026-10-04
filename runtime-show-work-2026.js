/* Shared by the visible interface and Node builders. No collection or model fitting. */
(function(root){
  const num=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
  const fmt=x=>num(x)==null?'unavailable':x.toFixed(2);
  const pct=x=>num(x)==null?'unavailable':`${(x*100).toFixed(1)}%`;
  const fields={
    'Positional production / fantasy allowed':['fantasy_points_allowed','qb_fantasy_points_allowed','rb_fantasy_points_allowed','wr_fantasy_points_allowed','te_fantasy_points_allowed'],
    'Pass/run tendencies and PROE':['pass_rate','rush_rate','proe','pass_rate_over_expectation'],
    'Pressure / sacks':['pressure_rate','sack_rate'],
    'Coverage / run defense':['coverage_grade','run_defense_grade','yards_per_attempt_allowed','yards_per_carry_allowed'],
    'Injuries / offensive line / secondary':['status','practice_status','body_part','offensive_line_injuries','secondary_injuries'],
    'Pace / script':['pace','plays_per_game','expected_game_script'],
    'Home / road / dome / weather':['home_away','venue','dome','temperature','wind_mph','precipitation'],
    'Role / usage / opportunities':['depth_rank','snap_share','route_share','target_share','attempts','targets','carries','routes','snaps']
  };
  function contextCurrent(s,kind=s?.kind,now=Date.now()){
    if(!s||s.status!=='CURRENT'||typeof s.source!=='string'||!s.source.trim()||s.sportsbook_inputs_used===true)return false;
    const limit=num(s.freshness_limit_hours),captured=Date.parse(s.captured_at);
    if(limit==null||limit<=0||!Number.isFinite(captured)||captured>now||now-captured>limit*3600000)return false;
    if(kind==='injury'){
      const updated=Date.parse(s.evidence?.source_updated_at);
      if(!Number.isFinite(updated)||updated>now||now-updated>limit*3600000||s.evidence?.conflicting_reports)return false;
    }
    return true;
  }
  function contextReview(signals=[],now=Date.now()){
    const rows=[],covered=new Set();
    for(const s of signals){
      const current=contextCurrent(s,s.kind||s.signal,now);
      const facts=[];
      for(const [category,keys]of Object.entries(fields))for(const key of keys){const value=s.evidence?.[key];if(value!=null&&value!==''&&typeof value!=='object'){facts.push(`${key.replaceAll('_',' ')}: ${value}`);if(current)covered.add(category);}}
      rows.push({kind:s.kind||s.signal||'context',current,source:s.source||null,captured_at:s.captured_at||null,text:`${s.player?`${s.player}: `:''}${facts.join('; ')||'No supported contextual metric supplied'}. ${current?'Current evidence':'Review required: stale, missing freshness, or unverified evidence'}. Source: ${s.source||'unavailable'}; captured ${s.captured_at||'unavailable'}.`});
    }
    return {rows,missing:Object.keys(fields).filter(x=>!covered.has(x)),status:covered.size===Object.keys(fields).length?'COMPLETE':'REVIEW_REQUIRED'};
  }
  function reconcile(baseline,adjusted,line,side){
    if([baseline,adjusted].some(x=>num(x)==null))return 'UNVALIDATED';
    if(adjusted===baseline)return 'UNCHANGED';
    if(num(line)==null)return adjusted>baseline?'INCREASES_PROJECTION':'DECREASES_PROJECTION';
    const sign=side==='UNDER'?-1:1,b=(baseline-line)*sign,a=(adjusted-line)*sign;
    if(b>0&&a<0)return 'CONTRADICTS';
    return a>b?'STRENGTHENS':'WEAKENS';
  }
  function finish(math,context,reconciliation,probability,confidence,decision,extra=[]){
    return {version:1,math,context,reconciliation,final_probability:num(probability),final_confidence:confidence||null,decision:decision||'REVIEW',additional_probability_adjustment:0,
      paragraphs:[...math,...extra,`Context: ${context.rows.length?context.rows.slice(0,4).map(x=>x.text).join(' ')+(context.rows.length>4?` ${context.rows.length-4} additional evidence records are available below.`:''):'No sourced contextual evidence attached.'}`,`Missing or unverified: ${context.missing.join(', ')||'none'}.`,`Reconciliation: ${reconciliation}. Existing calibrated adjustments are counted once; unvalidated context does not change model weights or probability.`,`Final: ${decision||'REVIEW'}; model probability ${pct(probability)}; confidence ${confidence||'unavailable'}. Context validation: ${context.status}.`]};
  }
  function priceMath(s={},fair){
    const odds=num(s.offered_odds),win=num(s.model_win_probability??s.win_probability),push=num(s.model_push_probability??s.push_probability),loss=num(s.model_loss_probability??s.loss_probability);
    const profit=odds===null||Math.abs(odds)<100?null:odds>0?odds/100:100/-odds;
    const implied=profit==null?null:1/(1+profit);
    const ev=win!=null&&loss!=null&&profit!=null?win*profit-loss:null;
    return [`Price ${odds??'unavailable'} implies ${pct(implied)}; no-vig market ${pct(fair)}.`,`Model win ${pct(win)}, push ${pct(push)}, loss ${pct(loss)}; conditional win ${pct(s.model_conditional_win_probability??s.conditional_win_probability)}.`,`EV per unit = win × net payout − loss = ${fmt(win)} × ${fmt(profit)} − ${fmt(loss)} ≈ ${fmt(ev)}. Probability edge ${pct(s.probability_edge)}.`];
  }
  function plainPrice(s){
    const odds=num(s.offered_odds),win=num(s.model_win_probability??s.win_probability),loss=num(s.model_loss_probability??s.loss_probability);
    if(odds==null||Math.abs(odds)<100||win==null||loss==null)return 'We do not have enough information to compare the chance of winning with the price.';
    const payout=odds>0?odds/100:100/-odds,ev=win*payout-loss;
    return `At ${odds>0?'+':''}${odds}, a $100 bet would profit $${(100*payout).toFixed(2)} if it wins. You need to win ${pct(1/(1+payout))} of bets without a refund to break even. Using our win, loss and refund chances, the estimated average result is ${ev>=0?'+':'−'}$${Math.abs(ev*100).toFixed(2)} per $100 bet over many similar bets—not a guaranteed return.`;
  }
  function propAvailability(e,signals=[],kickoff,now=Date.now()){
    const start=Date.parse(kickoff);
    if(Number.isFinite(start)&&start<=now)return {available:false,label:'Game started',reason:'This is a saved pregame forecast. It is no longer an available pregame play.'};
    const injury=signals.find(s=>s.kind==='injury'),role=signals.find(s=>s.kind==='role');
    const status=String(injury?.evidence?.status||'').toLowerCase();
    if(['out','inactive','injured reserve','ir','pup','suspended'].includes(status))return {available:false,label:'Not available',reason:'The latest report lists this player as '+status+'. This prop is removed from current recommendations.'};
    const active=injury?contextCurrent(injury,'injury',now)&&(status==='active'||/^(full participant|full participation|full practice)$/i.test(injury.evidence?.practice_status||''))&&!['questionable','doubtful','unknown'].includes(status)&&!/limited|did not|dnp/i.test(injury.evidence?.practice_status||''):contextCurrent(role,'role',now)&&role.evidence?.espn_active_flag===true;
    if(!active)return {available:false,label:'Waiting for player status',reason:'We need a recent report confirming this player is available before recommending a prop.'};
    if(!Number.isFinite(start))return {available:false,label:'Waiting for game time',reason:'We cannot confirm that this market is still open.'};
    const quote=Date.parse(e.captured_at);
    if(!Number.isFinite(quote)||quote>now||now-quote>6*3600000)return {available:false,label:'Waiting for updated odds',reason:'This saved price is too old to treat as an available play.'};
    return {available:e.eligibility?.eligible_for_pick===true&&e.recommendation?.decision==='PICK',label:e.recommendation?.decision==='PICK'&&e.eligibility?.eligible_for_pick===true?'Model pick':'No bet',reason:e.recommendation?.decision==='PICK'?'Check the current price before placing a bet.':'The model does not recommend a bet at this price.'};
  }
  function matchupFacts(signals,now){
    const labels={fantasy_points_allowed:'Fantasy points allowed',qb_fantasy_points_allowed:'Fantasy points allowed to quarterbacks',rb_fantasy_points_allowed:'Fantasy points allowed to running backs',wr_fantasy_points_allowed:'Fantasy points allowed to receivers',te_fantasy_points_allowed:'Fantasy points allowed to tight ends',pass_rate:'Pass rate',rush_rate:'Run rate',proe:'Pass rate above expectation',pressure_rate:'Pressure rate',sack_rate:'Sack rate',yards_per_attempt_allowed:'Passing yards allowed per attempt',yards_per_carry_allowed:'Rushing yards allowed per carry',plays_per_game:'Plays per game',wind_mph:'Wind (mph)',temperature:'Temperature',venue:'Venue',home_away:'Location',status:'Injury report',practice_status:'Practice participation',snap_share:'Share of snaps',route_share:'Share of routes',target_share:'Share of targets',depth_rank:'Depth-chart position',attempts:'Pass attempts',targets:'Targets',carries:'Carries',routes:'Routes',snaps:'Snaps'};
    const facts=[];
    for(const signal of signals){if(!contextCurrent(signal,signal.kind||signal.signal,now))continue;
      for(const [key,label] of Object.entries(labels)){const v=signal.evidence?.[key];if(v==null||v===''||typeof v==='object')continue;
        const value=num(v)!=null&&(/rate|share|proe/.test(key))?pct(v):String(v);
        facts.push({text:`${signal.player?signal.player+': ':signal.evidence?.opponent?signal.evidence.opponent+': ':''}${label}: ${value}.`,source:signal.source,at:signal.kind==='injury'?signal.evidence.source_updated_at:signal.captured_at});
      }
    }return facts.slice(0,6);
  }
  function verdictText(decision,selection,probability,confidence,complete){
    if(decision==='WAIT')return 'Wait. This is not a current recommendation.';
    if(decision!=='PICK')return 'No bet. Neither side meets the model’s requirements at this price.';
    return `${selection}. The model estimates a ${pct(probability)} chance${confidence?` (${String(confidence).toLowerCase()} model confidence)`:''}. ${complete?'The available matchup reports have been checked.':''}`;
  }
  function humanTime(value){if(!value||!Number.isFinite(Date.parse(value)))return 'time not supplied';if(/^\d{4}-\d{2}-\d{2}$/.test(value))return new Date(value+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'America/Chicago'});return new Date(value).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/Chicago',timeZoneName:'short'});}
  function renderWork(work){
    if(!work?.reader)return '';
    const r=work.reader,escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const report=globalThis.CTD_MATCHUP_REPORTS?.get(r.matchupKey)||r.matchupIdentity,a=globalThis.CTD_MATCHUP_ASSESSMENT?.(r,report),facts=r.matchup||[];
    const sources=a?.sources||facts.filter(f=>f.source).map(f=>({label:f.source,at:f.at}));
    const unique=[...new Map(sources.filter(x=>x.label).map(x=>[x.url||x.label,x])).values()];
    const sourceHtml=unique.map(x=>`<li>${/^https:\/\//.test(x.url||'')?`<a href="${escape(x.url)}" target="_blank" rel="noopener noreferrer">${escape(x.label)}</a>`:escape(x.label)}${x.at?` <small>· ${escape(humanTime(x.at))}</small>`:''}</li>`).join('');
    return `<section class="showWork ctdFormattedWork"><h4>The forecast</h4><p>${escape(r.summary)}</p>${r.distributionExplanation?`<p>${escape(r.distributionExplanation)}</p>`:''}${a?.sections?.length?(r.kind==='spread'?a.sections:[]).map(s=>`<h4>${escape(s.title)}</h4><p>${escape(s.text)}</p>`).join(''):`<h4>The matchup</h4><ul>${facts.slice(0,r.kind?facts.length:2).map(f=>`<li>${escape(f.text)}</li>`).join('')}</ul>`}<h4>What this means for the pick</h4><p>${escape(a?.risk||r.reconciliation)}</p><p class="workVerdict"><b>${a?.risk?'Saved forecast: ':''}${escape(r.verdict)}</b></p><details><summary>Numbers and sources</summary><h4>The numbers</h4><ul>${(r.details||[]).map(x=>`<li>${escape(x)}</li>`).join('')}</ul>${a?`<p>${escape(r.reconciliation)}</p>${(a.comparisons||[]).map(s=>`<h4>${escape(s.title)}</h4><p>${escape(s.text)}</p>`).join('')}<h4>Recent form</h4><ul>${facts.map(f=>`<li>${escape(f.text)}</li>`).join('')}</ul>`:''}<h4>Sources</h4><ul class="workSources">${sourceHtml}</ul></details></section>`;
  }
  function gameWork(game,snapshot,kind,now=Date.now()){
    const p=game.football_projection||{},m=snapshot?.market||{},e=snapshot?.markets?.[kind]||{},r=e.recommendation||{decision:'WAIT'};
    const a=e.side_a||{},b=e.side_b||{},chosen=String(r.selection||'').split(' ')[0],labelA=kind==='total'?'OVER':game.home_team,labelB=kind==='total'?'UNDER':game.away_team,isA=chosen===labelA?true:chosen===labelB?false:num(a.expected_value)!=null&&(num(b.expected_value)==null||a.expected_value>=b.expected_value),s=isA?a:b;
    const total=num(m.total),spread=num(m.home_spread),home=num(p.home_score_mean),away=num(p.away_score_mean);
    const implied=total!=null&&spread!=null?`${game.home_team} (${total} − (${spread})) / 2 = ${fmt((total-spread)/2)}; ${game.away_team} (${total} + (${spread})) / 2 = ${fmt((total+spread)/2)}`:'unavailable: both spread and total are required';
    const edge=home!=null&&away!=null?(kind==='spread'&&spread!=null?home-away+spread:kind==='total'&&total!=null?home+away-total:null):null;
    const signals=(game.context_evidence?.players||[]).flatMap(p=>(p.signals||[]).map(s=>({...s,player:p.player})));
    const context=contextReview(signals,now);
    const contribution=game.scoring_evidence?.contributions?.[kind==='total'?'total':'margin'];
    const terms=(contribution?.terms||[]).filter(t=>num(t.contribution)!=null);
    const threshold=kind==='total'?total:kind==='spread'&&spread!=null?-spread:0;
    const reconciliation=terms.length?reconcile(contribution.intercept,contribution.reconstructed,threshold,isA?'OVER':'UNDER'):'UNVALIDATED';
    const attribution=terms.length?`Existing formula: intercept ${fmt(contribution.intercept)} + ${terms.map(t=>`${t.name.replaceAll('_',' ')} ${fmt(t.contribution)} (${((isA?1:-1)*t.contribution)>0?'strengthens':'weakens'} the evaluated side)`).join(' + ')} = ${fmt(contribution.reconstructed)}. These contributions are already included; venue is not added twice.`:'Calibrated score-contribution detail unavailable.';
    const work=finish([`Model score: ${game.away_team} ${fmt(away)}, ${game.home_team} ${fmt(home)}. Market ${kind}: ${kind==='spread'?spread??'unavailable':kind==='total'?total??'unavailable':`${m.home_moneyline??'unavailable'} / ${m.away_moneyline??'unavailable'}`}.`,kind==='moneyline'?'Moneyline uses the score-distribution win probability.':`${kind==='spread'?'Home cover edge = home score − away score + home spread':'Over edge = model total − market total'} = ${fmt(edge)} points.`,`Team implied totals: ${implied}. Market scoring expectations are context only.`,...priceMath(s,e.fair_market?.[isA?'side_a_probability':'side_b_probability'])],context,reconciliation,s.conditional_win_probability,r.confidence,r.decision,[attribution,`Evaluated side: ${kind==='total'?(isA?'OVER':'UNDER'):(isA?game.home_team:game.away_team)}. Selection: ${r.selection||'none'}; ${r.reason||'locked thresholds applied'}. Quote: ${snapshot?.book||'unavailable'}, ${snapshot?.captured_at||'unavailable'}. Additional score adjustment: 0; context has no validated game-score weight.`]);
    const pick=r.selection||'No bet',projectedTotal=home!=null&&away!=null?home+away:null;
    const summary=kind==='total'?`We expect about ${fmt(projectedTotal)} combined points. The line is ${fmt(total)}, so our forecast is ${fmt(edge==null?null:Math.abs(edge))} points ${edge>=0?'above':'below'} it.`:kind==='spread'?`We project ${game.away_team} ${fmt(away)}–${game.home_team} ${fmt(home)}${home!=null&&away!=null?`, with ${home>=away?game.home_team:game.away_team} winning by ${fmt(Math.abs(home-away))}`:''}. ${edge!=null?`Against the ${game.home_team} ${spread>=0?'+':''}${spread} spread, that favors ${edge>=0?game.home_team:game.away_team} by ${fmt(Math.abs(edge))} points.`:'A matching spread is needed to judge the bet.'}`:`We give ${game.home_team} a ${pct(p.home_win_probability)} chance to win and ${game.away_team} ${pct(p.away_win_probability)}.`;
    work.reader={summary,details:[`Our choice at this saved price: ${pick}.`, `Our estimated chance for the evaluated side: ${pct(s.conditional_win_probability)} when the bet does not end in a refund.`,plainPrice(s),`The spread and total imply ${game.home_team} ${total!=null&&spread!=null?fmt((total-spread)/2):'unknown'} points and ${game.away_team} ${total!=null&&spread!=null?fmt((total+spread)/2):'unknown'} points. These are the sportsbook’s scoring expectations.`, `Odds from ${snapshot?.book||'an unknown sportsbook'}, recorded ${humanTime(snapshot?.captured_at)}.`]};
    const teamFacts=[];
    for(const [team,opponent] of [[game.home_team,game.away_team],[game.away_team,game.home_team]]){
      const t=game.scoring_evidence?.teams?.[team],o=game.scoring_evidence?.teams?.[opponent];
      if(num(t?.current_points_for)!=null&&num(o?.current_points_allowed)!=null)teamFacts.push({text:`${team} has scored ${fmt(t.current_points_for)} points per game across ${t.current_games} completed games this season. ${opponent} has allowed ${fmt(o.current_points_allowed)} per game across ${o.current_games} games.`,source:team+' offense / '+opponent+' defense · scoring averages',at:null});
    }
    const rest=game.scoring_evidence?.rest_days;
    if(num(rest?.home)!=null&&num(rest?.away)!=null)teamFacts.push({text:`${game.home_team} has ${rest.home} days of rest; ${game.away_team} has ${rest.away} days.`,source:'Game schedule',at:null});
    const liveKey=`${({WAS:'WSH',LA:'LAR',JAC:'JAX'}[game.away_team]||game.away_team)}@${({WAS:'WSH',LA:'LAR',JAC:'JAX'}[game.home_team]||game.home_team)}:${Date.parse(game.kickoff||game.event_start||game.start_at)}`;
    work.reader.matchupKey=liveKey;work.reader.selection=pick;work.reader.kind=kind;work.reader.matchupIdentity={away:liveKey.split('@')[0],home:liveKey.split('@')[1].split(':')[0],kickoff:game.kickoff||game.event_start||game.start_at,profiles:[{sources:Object.entries(game.scoring_evidence?.teams||{}).flatMap(([team,t])=>(t.completed_game_ids||[]).map(id=>({label:team+' · pregame box score '+id,url:'https://www.espn.com/nfl/boxscore/_/gameId/'+id})))}]};
    work.reader.matchup=[...teamFacts,...matchupFacts(signals,now),...(globalThis.CTD_MATCHUP_FACTS?.get(liveKey)||[])];
    const baseline=num(contribution?.intercept),adjusted=num(contribution?.reconstructed);
    work.reader.reconciliation=baseline!=null&&adjusted!=null?`${kind==='total'?`The scoring matchup and rest move the total from ${fmt(baseline)} to ${fmt(adjusted)} points.`:`The scoring matchup and rest change the forecast from ${baseline>=0?game.home_team:game.away_team} winning by ${fmt(Math.abs(baseline))} to ${adjusted>=0?game.home_team:game.away_team} winning by ${fmt(Math.abs(adjusted))}.`} ${kind==='total'?`That leaves the projection ${fmt(Math.abs(edge||0))} points ${edge>=0?'above':'below'} the line.`:kind==='moneyline'?'The score distribution gives each team’s chance of winning.':'The final score forecast is what we compare with the spread.'} These effects are already included in the projection.`:'The pick uses the score forecast above. There is not enough verified evidence to assign an additional matchup adjustment.';
    work.reader.verdict=verdictText(r.decision,pick,s.conditional_win_probability,r.confidence,context.status==='COMPLETE');
    work.reader.limit=context.status==='COMPLETE'?null:'Current injury, workload or matchup reports are incomplete. No extra probability boost has been applied.';
    return work;
  }
  function propWork(e,spec,projection,signals=[],opportunities={},now=Date.now(),environment=null){
    const side=e.recommendation?.side||e.model_pick?.side;
    const s=(e.sides||[]).find(x=>x.side===side)||{},mean=num(spec?.mean??spec?.parameters?.mu),base=num(projection?.baseline?.mean);
    const context=contextReview(signals,now),reconciliation=reconcile(base,num(projection?.mean),e.line,side);
    const applied=projection?.adjustments?.applied||[];
    const environmentText=environment?`Game total ${fmt(environment.total)}; ${environment.team} implied points ${fmt(environment.implied_total)} = (total − team spread) / 2. Quote: ${environment.book}, ${environment.captured_at}. This is market context, not a fantasy projection adjustment.`:'Game total / team implied total unavailable for the matching team and week.';
    const work=finish([`Baseline ${fmt(base)} → context-adjusted projection ${fmt(mean)} ${e.stat}; ${spec?.family||'unavailable'} distribution, SD ${fmt(spec?.sd??spec?.parameters?.sigma)}.`,`Market ${side||'unavailable'} ${e.line}; projection − line = ${mean!=null&&num(e.line)!=null?fmt(mean-e.line):'unavailable'}.`,...priceMath(s,s.no_vig_market_probability)],context,reconciliation,s.model_conditional_win_probability,e.recommendation?.confidence,e.recommendation?.decision,[`Model direction: ${e.model_pick?.side||'unavailable'}. Betting selection: ${e.recommendation?.side||'none'}.`,environmentText,`Opportunities: ${Object.entries(opportunities).filter(([,v])=>num(v)!=null).map(([k,v])=>`${k} ${fmt(v)}`).join(', ')||'unavailable; no attempts or volume inferred from yardage'}.`,`Existing applied adjustments: ${applied.map(a=>`${a.signal}: mean ${pct(a.mean_pct)}, uncertainty ${pct(a.sd_pct)} (${a.source||'source unavailable'})`).join('; ')||'none'}.`,`Availability: ${e.eligibility?.availability_status||'unavailable'}. Quote: ${e.book||'unavailable'}, ${e.captured_at||'unavailable'}.`]);
    const stat=String(e.stat||'').replaceAll('_',' ');
    work.reader={summary:`We project ${fmt(mean)} ${stat}, compared with a line of ${e.line??'unknown'}. ${side?`The model leans ${side.toLowerCase()}.`:'Neither side has a confirmed recommendation.'}`,details:[`The starting projection was ${fmt(base)}. After the supported matchup and usage adjustments, it is ${fmt(mean)}.`, `Estimated chance for ${side||'the selected side'}: ${pct(s.model_conditional_win_probability)} when the bet does not end in a refund.`,plainPrice(s),`Projected workload: ${Object.entries(opportunities).filter(([,v])=>num(v)!=null).map(([k,v])=>`${fmt(v)} ${k}`).join(', ')||'not available'}.`,environment?`The game total is ${fmt(environment.total)}. The spread and total imply ${fmt(environment.implied_total)} points for ${environment.team}.`:'We do not have matching game odds for this player.']};
    const median=spec?.family==='lognormal_shifted'&&num(spec?.parameters?.log_mu)!=null?Math.exp(spec.parameters.log_mu)+(num(spec.parameters.shift)||0):null;
    const over=(e.sides||[]).find(x=>x.side==='OVER')?.model_conditional_win_probability,under=(e.sides||[]).find(x=>x.side==='UNDER')?.model_conditional_win_probability;
    if(mean!=null&&num(e.line)!=null&&((side==='UNDER'&&mean>e.line)||(side==='OVER'&&mean<e.line))){
      work.reader.distributionExplanation=`${fmt(mean)} is the average across the model’s possible outcomes, not the midpoint.${median!=null?` The midpoint is ${fmt(median)} ${stat}; a smaller number of big games pull the average higher.`:''} ${num(over)!=null&&num(under)!=null?`At this line, the model gives Over ${pct(over)} and Under ${pct(under)}.`:`The selected side has a ${pct(s.model_conditional_win_probability)} chance.`} That is why the direction can differ from comparing the average with the line.`;
    }
    work.reader.matchup=matchupFacts(signals,now);
    const workload=Object.entries(opportunities).filter(([,v])=>num(v)!=null).map(([k,v])=>`${fmt(v)} ${k}`).join(', ');
    if(workload)work.reader.matchup.unshift({text:'Expected workload: '+workload+'.',source:'Player projection',at:null});
    const changes=applied.filter(a=>num(a.mean_pct)!=null).map(a=>`${String(a.signal||'Matchup').replaceAll('_',' ')} ${a.mean_pct>=0?'raises':'lowers'} the forecast by ${pct(Math.abs(a.mean_pct))}`);
    const effect={STRENGTHENS:'Those adjustments support this side.',WEAKENS:'Those adjustments reduce the advantage for this side.',CONTRADICTS:'Those adjustments move the forecast across the line and work against this side.',UNCHANGED:'The context does not change the starting projection.'};
    work.reader.reconciliation=(changes.length?changes.join('; ')+'. ':'')+(effect[reconciliation]||'There is not enough supported context to measure a matchup adjustment.');
    work.reader.verdict=verdictText(e.recommendation?.decision,`${side||''} ${e.line??''}`.trim(),s.model_conditional_win_probability,e.recommendation?.confidence,context.status==='COMPLETE');
    work.reader.limit=context.status==='COMPLETE'?null:'Some current matchup inputs are missing. The explanation includes only the evidence available for this forecast.';
    return work;
  }
  function fantasyWork(projection,signals=[],now=Date.now()){
    const context=contextReview(signals,now),base=num(projection?.baseline?.mean),mean=num(projection?.mean);
    const work=finish([`Historical baseline ${fmt(base)} × existing context multiplier ${fmt(projection?.adjustments?.mean_multiplier)} = ${fmt(mean)}.`,`Combined uncertainty ${fmt(projection?.combined_sd)}; performance ${fmt(projection?.performance_sd)}, projection error ${fmt(projection?.projection_error_sd)}.`],context,reconcile(base,mean),null,null,'PROJECTION_ONLY',['Fantasy comparison uses football production, opportunity and uncertainty. Sportsbook price and implied team totals do not change fantasy rankings. A calibrated start/sit win probability is unavailable for this stat projection.']);
    work.reader={summary:`Our starting forecast is ${fmt(base)}. The supported matchup and workload adjustments bring it to ${fmt(mean)}.`,details:[`Expected variation around the forecast: ${fmt(projection?.combined_sd)}. A wider range means a less predictable result.`]};
    return work;
  }
  function teamEnvironment(games,team,week){
    const g=Object.values(games||{}).find(g=>Number(g.week)===Number(week)&&[g.home_team,g.away_team].includes(team));
    const snap=(g?.snapshot_evaluations||[]).filter(s=>s.eligible_for_current_recommendation===true).sort((a,b)=>Date.parse(b.captured_at)-Date.parse(a.captured_at))[0];
    const total=num(snap?.market?.total),homeSpread=num(snap?.market?.home_spread);
    if(total==null||homeSpread==null)return null;
    return {team,total,implied_total:(total-(team===g.home_team?homeSpread:-homeSpread))/2,book:snap.book,captured_at:snap.captured_at};
  }
  function marketConsensus(snapshots=[]){
    const latest=new Map();
    for(const s of snapshots){
      if(s.eligible_for_current_recommendation!==true||!s.book||!Number.isFinite(Date.parse(s.captured_at)))continue;
      const key=s.book.toLowerCase(),old=latest.get(key);
      if(!old||Date.parse(s.captured_at)>Date.parse(old.captured_at))latest.set(key,s);
    }
    const books=[...latest.values()];
    const median=key=>{const values=books.map(s=>num(s.market?.[key])).filter(x=>x!=null).sort((a,b)=>a-b);const n=values.length;return {count:n,value:n<2?null:n%2?values[(n-1)/2]:(values[n/2-1]+values[n/2])/2};};
    return {home_spread:median('home_spread'),total:median('total'),books:books.map(s=>({book:s.book,captured_at:s.captured_at,home_spread:num(s.market?.home_spread),total:num(s.market?.total)}))};
  }
  root.CTD_SHOW_WORK={renderWork,humanTime,propAvailability,contextCurrent,marketConsensus,teamEnvironment,num,contextReview,reconcile,gameWork,propWork,fantasyWork};
})(globalThis);
