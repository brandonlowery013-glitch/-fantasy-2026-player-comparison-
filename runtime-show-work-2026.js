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
  function contextReview(signals=[],now=Date.now()){
    const rows=[],covered=new Set();
    for(const s of signals){
      const captured=Date.parse(s.captured_at),hours=num(s.freshness_limit_hours);
      const current=s.status==='CURRENT'&&!!s.source&&Number.isFinite(captured)&&captured<=now&&hours>0&&now-captured<=hours*3600000;
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
    return [`Price ${odds??'unavailable'} implies ${pct(implied)}; no-vig market ${pct(fair)}.`,`Model win ${pct(win)}, push ${pct(push)}, loss ${pct(loss)}; conditional win ${pct(s.model_conditional_win_probability??s.conditional_win_probability)}.`,`EV per unit = win × net payout − loss = ${fmt(win)} × ${fmt(profit)} − ${fmt(loss)} = ${fmt(ev)}. Probability edge ${pct(s.probability_edge)}.`];
  }
  function gameWork(game,snapshot,kind,now=Date.now()){
    const p=game.football_projection||{},m=snapshot?.market||{},e=snapshot?.markets?.[kind]||{},r=e.recommendation||{decision:'WAIT'};
    const a=e.side_a||{},b=e.side_b||{},isA=num(a.expected_value)!=null&&(num(b.expected_value)==null||a.expected_value>=b.expected_value),s=isA?a:b;
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
    return finish([`Model score: ${game.away_team} ${fmt(away)}, ${game.home_team} ${fmt(home)}. Market ${kind}: ${kind==='spread'?spread??'unavailable':kind==='total'?total??'unavailable':`${m.home_moneyline??'unavailable'} / ${m.away_moneyline??'unavailable'}`}.`,kind==='moneyline'?'Moneyline uses the score-distribution win probability.':`${kind==='spread'?'Home cover edge = home score − away score + home spread':'Over edge = model total − market total'} = ${fmt(edge)} points.`,`Team implied totals: ${implied}. Market scoring expectations are context only.`,...priceMath(s,e.fair_market?.[isA?'side_a_probability':'side_b_probability'])],context,reconciliation,s.conditional_win_probability,r.confidence,r.decision,[attribution,`Evaluated side: ${kind==='total'?(isA?'OVER':'UNDER'):(isA?game.home_team:game.away_team)}. Selection: ${r.selection||'none'}; ${r.reason||'locked thresholds applied'}. Quote: ${snapshot?.book||'unavailable'}, ${snapshot?.captured_at||'unavailable'}. Additional score adjustment: 0; context has no validated game-score weight.`]);
  }
  function propWork(e,spec,projection,signals=[],opportunities={},now=Date.now(),environment=null){
    const side=e.recommendation?.side||e.model_pick?.side;
    const s=(e.sides||[]).find(x=>x.side===side)||{},mean=num(spec?.mean??spec?.parameters?.mu),base=num(projection?.baseline?.mean);
    const context=contextReview(signals,now),reconciliation=reconcile(base,num(projection?.mean),e.line,side);
    const applied=projection?.adjustments?.applied||[];
    const environmentText=environment?`Game total ${fmt(environment.total)}; ${environment.team} implied points ${fmt(environment.implied_total)} = (total − team spread) / 2. Quote: ${environment.book}, ${environment.captured_at}. This is market context, not a fantasy projection adjustment.`:'Game total / team implied total unavailable for the matching team and week.';
    return finish([`Baseline ${fmt(base)} → context-adjusted projection ${fmt(mean)} ${e.stat}; ${spec?.family||'unavailable'} distribution, SD ${fmt(spec?.sd??spec?.parameters?.sigma)}.`,`Market ${side||'unavailable'} ${e.line}; projection − line = ${mean!=null&&num(e.line)!=null?fmt(mean-e.line):'unavailable'}.`,...priceMath(s,s.no_vig_market_probability)],context,reconciliation,s.model_conditional_win_probability,e.recommendation?.confidence,e.recommendation?.decision,[`Model direction: ${e.model_pick?.side||'unavailable'}. Betting selection: ${e.recommendation?.side||'none'}.`,environmentText,`Opportunities: ${Object.entries(opportunities).filter(([,v])=>num(v)!=null).map(([k,v])=>`${k} ${fmt(v)}`).join(', ')||'unavailable; no attempts or volume inferred from yardage'}.`,`Existing applied adjustments: ${applied.map(a=>`${a.signal}: mean ${pct(a.mean_pct)}, uncertainty ${pct(a.sd_pct)} (${a.source||'source unavailable'})`).join('; ')||'none'}.`,`Availability: ${e.eligibility?.availability_status||'unavailable'}. Quote: ${e.book||'unavailable'}, ${e.captured_at||'unavailable'}.`]);
  }
  function fantasyWork(projection,signals=[],now=Date.now()){
    const context=contextReview(signals,now),base=num(projection?.baseline?.mean),mean=num(projection?.mean);
    return finish([`Historical baseline ${fmt(base)} × existing context multiplier ${fmt(projection?.adjustments?.mean_multiplier)} = ${fmt(mean)}.`,`Combined uncertainty ${fmt(projection?.combined_sd)}; performance ${fmt(projection?.performance_sd)}, projection error ${fmt(projection?.projection_error_sd)}.`],context,reconcile(base,mean),null,null,'PROJECTION_ONLY',['Fantasy comparison uses football production, opportunity and uncertainty. Sportsbook price and implied team totals do not change fantasy rankings. A calibrated start/sit win probability is unavailable for this stat projection.']);
  }
  function teamEnvironment(games,team,week){
    const g=Object.values(games||{}).find(g=>Number(g.week)===Number(week)&&[g.home_team,g.away_team].includes(team));
    const snap=(g?.snapshot_evaluations||[]).filter(s=>s.eligible_for_current_recommendation===true).sort((a,b)=>Date.parse(b.captured_at)-Date.parse(a.captured_at))[0];
    const total=num(snap?.market?.total),homeSpread=num(snap?.market?.home_spread);
    if(total==null||homeSpread==null)return null;
    return {team,total,implied_total:(total-(team===g.home_team?homeSpread:-homeSpread))/2,book:snap.book,captured_at:snap.captured_at};
  }
  root.CTD_SHOW_WORK={teamEnvironment,num,contextReview,reconcile,gameWork,propWork,fantasyWork};
})(globalThis);
