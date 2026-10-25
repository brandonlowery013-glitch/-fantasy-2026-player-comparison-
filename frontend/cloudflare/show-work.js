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
    Object.assign(labels,{pass_rate_over_expectation:'Pass rate above expectation',coverage_grade:'Coverage grade',run_defense_grade:'Run-defense grade',pace:'Pace',expected_game_script:'Expected game situation',dome:'Dome',precipitation:'Precipitation',offensive_line_injuries:'Offensive-line injuries',secondary_injuries:'Secondary injuries'});
    const facts=[];
    for(const signal of signals){if(!contextCurrent(signal,signal.kind||signal.signal,now))continue;
      for(const [key,label] of Object.entries(labels)){const v=signal.evidence?.[key];if(v==null||v===''||typeof v==='object')continue;
        const value=typeof v==='boolean'?(v?'Yes':'No'):num(v)!=null&&(/rate|share|proe/.test(key))?pct(v):String(v);
        facts.push({kind:signal.kind||signal.signal,field:key,text:`${signal.player?signal.player+': ':signal.evidence?.opponent?signal.evidence.opponent+': ':''}${label}: ${value}.`,source:signal.source,at:signal.kind==='injury'?signal.evidence.source_updated_at:signal.captured_at});
      }
    }return facts;
  }
function gameDirectionPrediction(game,snapshot,kind){
 if(!['moneyline','spread','total'].includes(kind))return null;
 const selected=snapshot?.markets?.[kind]?.model_prediction;if(kind==='moneyline'&&selected?.selection_basis==='both-prior-upset-wins-home-underdog-v1'&&snapshot?.markets?.moneyline?.selection_exception?.applied)return {...selected,betting_decision:snapshot.markets.moneyline.recommendation?.decision||'PASS'};if(['moneyline','spread'].includes(kind)&&selected?.status==='EVEN')return {...selected,selection:null};
 const e=snapshot?.markets?.[kind],a=e?.side_a?.conditional_win_probability,b=e?.side_b?.conditional_win_probability;
 let home=a,away=b;
 const version=kind==='spread'?'sportsbook-calibration-learning-v1':'football-sportsbook-learning-v1';
 if(kind!=='total'&&e?.model_version!==version)return {status:'UNAVAILABLE',selection:null,reason:'Waiting for current picks',betting_decision:'WAIT'};
 if(!Number.isFinite(home)||!Number.isFinite(away))return {status:'UNAVAILABLE',selection:null,reason:'Matching model probability or spread line unavailable; no invented pick',betting_decision:e?.recommendation?.decision||'WAIT'};
 if(kind==='total'){
  const line=snapshot?.market?.total;
  if(!Number.isFinite(line))return {status:'UNAVAILABLE',selection:null,reason:'Total line unavailable',betting_decision:e?.recommendation?.decision||'WAIT'};
  const tie=Math.abs(a-b)<1e-12,over=a>=b,p=over?a:b;
  return {status:'MODEL_DIRECTION',side:over?'OVER':'UNDER',selection:`${over?'OVER':'UNDER'} ${line}`,probability:p,confidence:p<.52?'LOW':p<.6?'MODERATE':'HIGH',exact_probability_tie:tie,tie_break:tie?'Over before Under; no statistical preference':null,betting_decision:e?.recommendation?.decision||'WAIT',scope:'Prediction of the outcome; separate from value/availability-based betting recommendation'};
 }
 const tie=Math.abs(home-away)<1e-12,isHome=tie?game.home_team.localeCompare(game.away_team)<0:home>away;
 const team=isHome?game.home_team:game.away_team,p=isHome?home:away,line=snapshot?.market?.home_spread;
 if(kind==='spread'&&!Number.isFinite(line))return {status:'UNAVAILABLE',selection:null,reason:'Spread line unavailable',betting_decision:e?.recommendation?.decision||'WAIT'};
 const sideLine=isHome?line:-line;
 return {status:'MODEL_DIRECTION',team,selection:kind==='moneyline'?`${team} ML`:`${team} ${sideLine>0?'+':''}${sideLine}`,probability:p,confidence:p<.52?'LOW':p<.6?'MODERATE':'HIGH',exact_probability_tie:tie,tie_break:tie?'Alphabetical team code; no statistical preference':null,betting_decision:e?.recommendation?.decision||'WAIT',scope:'Prediction of the outcome; separate from value/availability-based betting recommendation'};
}

  function verdictText(decision,selection,probability,confidence,complete){
    if(decision==='WAIT')return 'Wait. This is not a current recommendation.';
    if(decision!=='PICK')return 'No bet. Neither side meets the model’s requirements at this price.';
    return `${selection}. The model estimates a ${pct(probability)} chance${confidence?` (${String(confidence).toLowerCase()} model confidence)`:''}. ${complete?'The available matchup reports have been checked.':''}`;
  }
  function humanTime(value){if(!value||!Number.isFinite(Date.parse(value)))return 'time not supplied';if(/^\d{4}-\d{2}-\d{2}$/.test(value))return new Date(value+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'America/Chicago'});return new Date(value).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/Chicago',timeZoneName:'short'});}
  function interfaceCopy(value){
    const text=String(value??'');if(/^https?:\/\//.test(text))return text;
    return text.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(sentence=>!/(?:sportsbook odds are adjusted|calibrat(?:ion|ed)|Polymarket|bye bonuses?|regulariz|residual|coefficients?|intercept|postgame learning|training (?:games|uses)|numeric.authority|model weights|pipeline|context validation|reconciliation|prospective validation|conditional model|experimental conditional|current formula|probability(?: and confidence)? adjustment:\s*0|additional score adjustment|personnel forecast|no extra probability boost|no untested point value|predictive effect has not been validated|Rest is excluded|These effects are already included)/i.test(sentence)).join(' ').replace(/SHADOW_ONLY|SHADOW ONLY/g,'Preview').replace(/ACTIONABLE/g,'Available').replace(/conditional projection/ig,'Assumes player starts').replace(/canonical /ig,'');
  }
  function renderWork(work){
    if(!work?.reader)return '';
    const r=work.reader,escape=x=>interfaceCopy(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const report=globalThis.CTD_MATCHUP_REPORTS?.get(r.matchupKey)||r.matchupIdentity,a=globalThis.CTD_MATCHUP_ASSESSMENT?.(r,report),facts=r.matchup||[];
    const sources=[...(a?.sources||facts.filter(f=>f.source).map(f=>({label:f.source,at:f.at}))),...(r.sources||[])];
    const unique=[...new Map(sources.filter(x=>x.label).map(x=>[x.url||x.label,x])).values()];
    const sourceHtml=unique.map(x=>`<li>${/^https:\/\//.test(x.url||'')?`<a href="${escape(x.url)}" target="_blank" rel="noopener noreferrer">${escape(x.label)}</a>`:escape(x.label)}${x.at?` <small>· ${escape(humanTime(x.at))}</small>`:''}</li>`).join('');
    if(!r.kind){
      const availability=facts.find(f=>f.kind==='injury'&&f.field==='status'&&!/Injury report: Active\./i.test(f.text));
      const lead=availability||facts[0];
      return `<section class="showWork ctdFormattedWork"><p>${escape(r.summary)}</p>${r.distributionExplanation?`<p>${escape(r.distributionExplanation)}</p>`:''}${lead?`<p>${escape(lead.text)}</p>`:''}${r.hideVerdict||!r.verdict?'':`<p><b>${escape(r.verdict)}</b></p>`}<details><summary>Numbers and sources</summary><ul>${(r.details||[]).map(x=>`<li>${escape(x)}</li>`).join('')}</ul>${r.reconciliation?`<p>${escape(r.reconciliation)}</p>`:''}${facts.length?`<h4>Matchup and workload</h4><ul>${facts.map(f=>`<li>${escape(f.text)}</li>`).join('')}</ul>`:''}${sourceHtml?`<h4>Sources</h4><ul class="workSources">${sourceHtml}</ul>`:''}</details></section>`;
    }
    return `<section class="showWork ctdFormattedWork">${r.hold?`<h4>No recommended bet · quarterback change</h4><p>${escape(r.hold)}</p>`:''}${r.modelPrediction?.selection?`<p><b>Model prediction: ${escape(r.modelPrediction.selection)}</b> · ${pct(r.modelPrediction.probability)}${r.hold?' · waiting for quarterback confirmation':''}</p>`:''}<h4>${r.hold?'Awaiting quarterback confirmation':'The forecast'}</h4><p>${escape(r.summary)}</p>${r.distributionExplanation?`<p>${escape(r.distributionExplanation)}</p>`:''}${a?.sections?.length?(r.kind==='spread'?a.sections:[]).map(s=>`<h4>${escape(s.title)}</h4><p>${escape(s.text)}</p>`).join(''):`<h4>The matchup</h4><ul>${facts.slice(0,r.kind?facts.length:2).map(f=>`<li>${escape(f.text)}</li>`).join('')}</ul>`}${r.publicBettingRead?`<h4>Consensus and Smart Money</h4><p>${escape(r.publicBettingRead)}</p>`:''}<h4>What this means for the pick</h4><p>${escape(a?.risk||r.reconciliation)}</p><p class="workVerdict"><b>${a?.risk?'Saved forecast: ':''}${escape(r.verdict)}</b></p><details><summary>Numbers and sources</summary><h4>The numbers</h4><ul>${(r.details||[]).map(x=>`<li>${escape(x)}</li>`).join('')}</ul>${a?`<p>${escape(r.reconciliation)}</p>${(a.comparisons||[]).map(s=>`<h4>${escape(s.title)}</h4><p>${escape(s.text)}</p>`).join('')}<h4>Recent form</h4><ul>${facts.map(f=>`<li>${escape(f.text)}</li>`).join('')}</ul>`:''}<h4>Sources</h4><ul class="workSources">${sourceHtml}</ul></details></section>`;
  }
  function quarterbackConcerns(game,now=Date.now()){
    const canon=t=>({WAS:'WSH',LA:'LAR',JAC:'JAX'}[t]||t),teams=[game.home_team,game.away_team].map(canon),concerns=new Map(),latestPersonnel=new Map();
    const risky=x=>/^(out|inactive|doubtful|questionable|injured reserve|ir|suspended|pup)$/i.test(String(x||'').trim());
    // An aging adverse report is unresolved evidence, not clearance to play.
    for(const [team,record] of Object.entries(game.personnel_context?.teams||{})){
      if(!teams.includes(canon(team)))continue;
      for(const p of record.players||[]){
        if(p.position!=='QB'||!p.depth_roles?.some(r=>r.position==='QB'&&Number(r.rank)===1))continue;
        const reports=(p.injury_reports||[]).filter(r=>Number.isFinite(Date.parse(r.source_updated_at))&&Date.parse(r.source_updated_at)<=now).sort((a,b)=>Date.parse(a.source_updated_at)-Date.parse(b.source_updated_at));
        const latest=reports.at(-1);if(latest)latestPersonnel.set(canon(team),Date.parse(latest.source_updated_at));if(!latest||!risky(latest.status))continue;
        const cleared=p.availability?.expected_active===true&&p.availability?.designation_confirmed_for_game===true&&Date.parse(p.availability.source_updated_at)>=Date.parse(latest.source_updated_at)&&Date.parse(p.availability.source_updated_at)<=now;
        if(!cleared)concerns.set(canon(team),{player:p.name,team:canon(team),status:latest.status,reported_at:latest.source_updated_at});
      }
    }
    for(const p of game.context_evidence?.players||[]){
      if(p.position!=='QB')continue;
      const role=p.signals?.find(s=>['role','qb_context'].includes(s.kind)&&Number(s.evidence?.depth_rank)===1&&teams.includes(canon(s.team||s.evidence?.team))&&Date.parse(s.captured_at)<=now);
      if(!role)continue;
      const team=canon(role.team||role.evidence?.team),injury=p.signals?.find(s=>s.kind==='injury'&&canon(s.team||s.evidence?.team)===team&&Date.parse(s.evidence?.source_updated_at||s.captured_at)<=now);
      const at=injury?.evidence?.source_updated_at||injury?.captured_at;
      if(injury&&contextCurrent(injury,'injury',now)&&/^(active|healthy|available)$/i.test(String(injury.evidence?.status||''))&&Date.parse(at)>Date.parse(concerns.get(team)?.reported_at||0))concerns.delete(team);
      if(injury&&!(latestPersonnel.get(team)>Date.parse(at))&&risky(injury.evidence?.status)&&(!concerns.has(team)||Date.parse(at)>Date.parse(concerns.get(team).reported_at)))concerns.set(team,{player:p.player,team,status:injury.evidence.status,reported_at:at});
    }
    return [...concerns.values()];
  }
  function gameMarketView(game,snapshot,now=Date.now()){
    if(!snapshot||!Number.isFinite(Date.parse(game.kickoff||game.event_start)))return snapshot;
    if(Date.parse(game.kickoff||game.event_start)<=now&&game.rerun!==true)return snapshot;
    const concerns=quarterbackConcerns(game,Math.min(now,Date.parse(game.kickoff||game.event_start)));if(!concerns.length)return snapshot;
    const reason=concerns.map(p=>`${p.player}: last reported ${String(p.status).toLowerCase()}`).join('; ')+'. This forecast has not accounted for the starting-quarterback uncertainty. No recommended bet until availability and the replacement are evaluated.';
    return {...snapshot,markets:Object.fromEntries(Object.entries(snapshot.markets||{}).map(([kind,e])=>[kind,(['football-sportsbook-learning-v1','sportsbook-calibration-learning-v1'].includes(e.model_version)?e:{...e,baseline_recommendation:e.baseline_recommendation||e.recommendation,recommendation:{decision:'WAIT',selection:null,confidence:null,reason},context_validation:{status:'HOLD',reason,quarterbacks:concerns,checked_at:new Date(now).toISOString(),numeric_adjustment:0}})]))};
  }
  function publicBettingContext(feed,game,kind,asOf=Date.now()){
    const canon=t=>({WAS:'WSH',LA:'LAR',JAC:'JAX'}[t]||t),kickoff=Date.parse(game.kickoff||game.event_start),at=typeof asOf==='number'?asOf:Date.parse(asOf);
    const empty={status:'UNAVAILABLE',market:kind,numeric_authority:0,reason:'No verified pregame consensus or money-share observation is available for this matchup and decision time.'};
    if(!Number.isFinite(at)||!Number.isFinite(kickoff))return empty;
    const candidates=(feed?.snapshots||[]).filter(g=>canon(g.home)===canon(game.home_team)&&canon(g.away)===canon(game.away_team)&&Date.parse(g.start_at)===kickoff&&Date.parse(g.observed_at)<=at&&Date.parse(g.observed_at)<kickoff&&Array.isArray(g[kind])).sort((a,b)=>Date.parse(b.observed_at)-Date.parse(a.observed_at));
    const g=candidates[0],rows=g?.[kind];
    if(!g?.source||!/^https:\/\//.test(g.source_url||'')||!rows||rows.length!==2||!['bets','money'].every(k=>rows.every(r=>num(r[k])!=null&&r[k]>=0&&r[k]<=100)&&Math.abs(rows[0][k]+rows[1][k]-100)<=1))return empty;
    if(new Set(rows.map(r=>canon(String(r.side).toUpperCase()))).size!==2||!rows.every(r=>kind==='total'?['OVER','UNDER'].includes(String(r.side).toUpperCase()):[canon(game.home_team),canon(game.away_team)].includes(canon(r.side))))return empty;
    const stale=at-Date.parse(g.observed_at)>6*3600000;
    return {status:stale?'STALE':'OBSERVATION',market:kind,source:g.source,source_url:g.source_url,observed_at:g.observed_at,decision_at:new Date(at).toISOString(),numeric_authority:0,rows:rows.map(r=>({...r,side:canon(String(r.side).toUpperCase()),handle_minus_bets_pp:Number((r.money-r.bets).toFixed(3))})),reason:stale?'The saved shares are older than six hours; excluded from current decision context.':'Public bet share (consensus), money share (Smart Money display), and their difference are recorded as candidate decision variables. No validated probability or confidence coefficient is available.'};
  }
  function publicBettingRead(context,side){
    if(context?.status!=='OBSERVATION')return 'Consensus and Smart Money: '+(context?.reason||'No matching pregame observation; no assumed shares.');
    const canon=t=>({WAS:'WSH',LA:'LAR',JAC:'JAX'}[t]||t),r=context.rows.find(r=>r.side===canon(String(side).toUpperCase()));
    if(!r)return 'Consensus and Smart Money: no matching side; no adjustment.';
    return `${r.label||r.side}: consensus ${r.bets}% of bets, Smart Money ${r.money}% of dollars; money minus bets ${r.handle_minus_bets_pp>=0?'+':''}${r.handle_minus_bets_pp} percentage points. ${r.bets===50?'Bet share is even.':r.bets>50?'The majority of bets agrees with this side.':'The majority of bets opposes this side.'} ${r.money===50?'Money share is even.':r.money>50?'The majority of dollars agrees with this side.':'The majority of dollars opposes this side.'} Recorded ${humanTime(context.observed_at)}. These are DraftKings shares, not proof of professional betting; their predictive effect has not been validated. Probability and confidence adjustment: 0.`;
  }
  function gameWork(game,snapshot,kind,now=Date.now()){
    const e=snapshot?.markets?.[kind],p=gameDirectionPrediction(game,snapshot,kind),q=e?.quote||snapshot;
    return {reader:{summary:p?.selection?`Our pick: ${p.selection}.`:'Prediction unavailable.',details:p?.probability!=null?[`Estimated chance: ${(p.probability*100).toFixed(1)}%.`,`Price from ${q?.book||'sportsbook'}; ${q?.captured_at||'time unavailable'}.`]:['Waiting for current odds.'],verdict:p?.selection?(e?.recommendation?.decision||'WAIT'):'WAIT',hideVerdict:false}};
  }
  function propStatKey(stat){return ({passing_yards:'pass_yards',passing_tds:'pass_tds',rushing_yards:'rush_yards'})[stat]||stat;}
  function propStat(values,stat){return values?.[stat]??values?.[propStatKey(stat)];}
  function propWork(e,spec,projection,signals=[],opportunities={},now=Date.now(),environment=null){
    const side=e.recommendation?.side||e.model_pick?.side;
    const s=(e.sides||[]).find(x=>x.side===side)||{},mean=num(spec?.mean??spec?.parameters?.mu),base=num(projection?.baseline?.mean);
    const context=contextReview(signals,now),reconciliation=reconcile(base,num(projection?.mean),e.line,side);
    const applied=projection?.adjustments?.applied||[];
    const environmentText=environment?`Game total ${fmt(environment.total)}; ${environment.team} implied points ${fmt(environment.implied_total)} = (total − team spread) / 2. Quote: ${environment.book}, ${environment.captured_at}. This is market context, not a fantasy projection adjustment.`:'Game total / team implied total unavailable for the matching team and week.';
    const work=finish([`Baseline ${fmt(base)} → context-adjusted projection ${fmt(mean)} ${e.stat}; ${spec?.family||'unavailable'} distribution, SD ${fmt(spec?.sd??spec?.parameters?.sigma)}.`,`Market ${side||'unavailable'} ${e.line}; projection − line = ${mean!=null&&num(e.line)!=null?fmt(mean-e.line):'unavailable'}.`,...priceMath(s,s.no_vig_market_probability)],context,reconciliation,s.model_conditional_win_probability,e.recommendation?.confidence,e.recommendation?.decision,[`Model direction: ${e.model_pick?.side||'unavailable'}. Betting selection: ${e.recommendation?.side||'none'}.`,environmentText,`Opportunities: ${Object.entries(opportunities).filter(([,v])=>num(v)!=null).map(([k,v])=>`${k} ${fmt(v)}`).join(', ')||'unavailable; no attempts or volume inferred from yardage'}.`,`Existing applied adjustments: ${applied.map(a=>`${a.signal}: mean ${pct(a.mean_pct)}, uncertainty ${pct(a.sd_pct)} (${a.source||'source unavailable'})`).join('; ')||'none'}.`,`Availability: ${e.eligibility?.availability_status||'unavailable'}. Quote: ${e.book||'unavailable'}, ${e.captured_at||'unavailable'}.`]);
    const stat=String(e.stat||'').replaceAll('_',' ');
    work.reader={summary:`We project ${fmt(mean)} ${stat}, compared with a line of ${e.line??'unknown'}. ${side?`The model leans ${side.toLowerCase()}.`:'Neither side has a confirmed recommendation.'}`,details:[`The starting projection was ${fmt(base)}. After the supported matchup and usage adjustments, it is ${fmt(mean)}.`, `Estimated chance for ${side||'the selected side'}: ${pct(s.model_conditional_win_probability)} when the bet does not end in a refund.`,plainPrice(s),`Projected workload: ${Object.entries(opportunities).filter(([,v])=>num(v)!=null).map(([k,v])=>`${fmt(v)} ${k}`).join(', ')||'not available'}.`,environment?`The game total is ${fmt(environment.total)}. The spread and total imply ${fmt(environment.implied_total)} points for ${environment.team}.`:'We do not have matching game odds for this player.']};
    const contextMean=num(projection?.mean);
    work.math[0]=`Baseline ${fmt(base)} → context-adjusted projection ${fmt(contextMean)} → distribution average ${fmt(mean)} ${e.stat}; ${spec?.family||'unavailable'} distribution, SD ${fmt(spec?.sd??spec?.parameters?.sigma)}.`;
    work.paragraphs[0]=work.math[0];
    work.reader.details[0]=`The starting projection was ${fmt(base)}. After the recorded matchup and usage adjustments, it is ${fmt(contextMean)}.`;
    if(contextMean!=null&&mean!=null&&Math.abs(contextMean-mean)>0.005)work.reader.details.splice(1,0,`The final outcome distribution has an average of ${fmt(mean)}. That difference comes from the distribution stage, not an additional matchup adjustment.`);
    const median=spec?.family==='lognormal_shifted'&&num(spec?.parameters?.log_mu)!=null?Math.exp(spec.parameters.log_mu)+(num(spec.parameters.shift)||0):null;
    const over=(e.sides||[]).find(x=>x.side==='OVER')?.model_conditional_win_probability,under=(e.sides||[]).find(x=>x.side==='UNDER')?.model_conditional_win_probability;
    if(mean!=null&&num(e.line)!=null&&((side==='UNDER'&&mean>e.line)||(side==='OVER'&&mean<e.line))){
      work.reader.distributionExplanation=`${fmt(mean)} is the average across the model’s possible outcomes, not the midpoint.${median!=null?` The midpoint is ${fmt(median)} ${stat}; a smaller number of big games pull the average higher.`:''} ${num(over)!=null&&num(under)!=null?`At this line, the model gives Over ${pct(over)} and Under ${pct(under)}.`:`The selected side has a ${pct(s.model_conditional_win_probability)} chance.`} That is why the direction can differ from comparing the average with the line.`;
    }
    work.reader.matchup=matchupFacts(signals,now);
    work.reader.sources=applied.filter(a=>a.source).map(a=>({label:a.source}));
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
    const applied=(projection?.adjustments?.applied||[]).filter(a=>num(a.mean_pct)!=null);
    const changes=applied.map(a=>`${String(a.signal||'Matchup').replaceAll('_',' ')} ${a.mean_pct>=0?'raises':'lowers'} the forecast by ${pct(Math.abs(a.mean_pct))}`);
    const direction=base==null||mean==null?'There is not enough information to compare the starting and final forecasts.':mean===base?'The supported adjustments leave the starting forecast unchanged.':`Together, the supported adjustments ${mean>base?'raise':'lower'} the starting forecast by ${fmt(Math.abs(mean-base))}.`;
    work.reader={summary:`Our starting forecast is ${fmt(base)}. The supported matchup and workload adjustments bring it to ${fmt(mean)}.`,matchup:matchupFacts(signals,now),reconciliation:changes.length?changes.join('; ')+'. '+direction:direction,details:[`Expected variation around the forecast: ${fmt(projection?.combined_sd)}. A wider range means a less predictable result.`,`This is a player-stat projection. It does not establish a head-to-head start/sit win probability.`]};
    work.reader.sources=applied.filter(a=>a.source).map(a=>({label:a.source}));
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
  root.CTD_PUBLIC_COPY=interfaceCopy;
  root.CTD_SHOW_WORK={gameDirectionPrediction,publicBettingContext,publicBettingRead,quarterbackConcerns,gameMarketView,propStatKey,propStat,renderWork,humanTime,propAvailability,contextCurrent,marketConsensus,teamEnvironment,num,contextReview,reconcile,gameWork,propWork,fantasyWork};
})(globalThis);
