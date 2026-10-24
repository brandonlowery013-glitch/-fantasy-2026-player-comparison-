// Both selected forecasts are inputs. Final probabilities share one integer-margin
// distribution, so covers, wins, ties, refunds and returns describe the same game.
export const JOINT_VERSION='joint-margin-selected-models-v1';
const finite=Number.isFinite,logistic=x=>1/(1+Math.exp(-x)),epsilon=1e-12;
export function fitMarginScale(rows,week,asOf=Infinity){
 const seen=new Set(),errors=[];
 for(const r of rows){const f=r.final;if(r.week>=week||seen.has(r.game_id)||!finite(r.home_line)||!finite(f?.home_score)||!finite(f?.away_score))continue;
 const finished=Date.parse(f.observed_at||f.kickoff||r.kickoff);if(!finite(finished)||finished>=asOf)continue;
 if(f.home_team!==r.home_team||f.away_team!==r.away_team)throw Error('Training final matchup mismatch');
 seen.add(r.game_id);errors.push(f.home_score-f.away_score+r.home_line);}
 if(errors.length<12)throw Error('Insufficient earlier-game margin outcomes');
 const mean=errors.reduce((a,b)=>a+b,0)/errors.length,variance=errors.reduce((a,b)=>a+(b-mean)**2,0)/(errors.length-1),scale=Math.sqrt(variance*3)/Math.PI;
 if(!finite(scale)||scale<=0)throw Error('Invalid margin scale');
 return {scale,training_games:errors.length,training_through_week:week-1,training_game_ids:[...seen]};
}
export function marginProbabilities(location,scale,line){
 if(!finite(location)||!finite(scale)||scale<=0||!finite(line)||Math.abs(line*2-Math.round(line*2))>epsilon)throw Error('Invalid margin inputs');
 const cdf=x=>logistic((x-location)/scale),tie=cdf(.5)-cdf(-.5),homeWin=1-cdf(.5),awayWin=cdf(-.5),threshold=-line;
 const cover=1-cdf(Math.floor(threshold)+.5),loss=cdf(Math.ceil(threshold)-.5),push=Number.isInteger(threshold)?cdf(threshold+.5)-cdf(threshold-.5):0;
 return {moneyline:{home:homeWin,away:awayWin,push:tie,conditional_home:homeWin/(homeWin+awayWin)},spread:{home:cover,away:loss,push,conditional_home:cover/(cover+loss)}};
}
export function solveJointMargin(moneyline,spread,line,scale){
 if(![moneyline,spread].every(p=>finite(p)&&p>0&&p<1))throw Error('Invalid selected-model input');
 const ce=(target,p)=>-target*Math.log(Math.max(epsilon,p))-(1-target)*Math.log(Math.max(epsilon,1-p));
 const loss=mu=>{const p=marginProbabilities(mu,scale,line);return ce(moneyline,p.moneyline.conditional_home)+ce(spread,p.spread.conditional_home);};
 let lo=-1000,hi=1000;for(let i=0;i<110;i++){const a=lo+(hi-lo)/3,b=hi-(hi-lo)/3;if(loss(a)<loss(b))hi=b;else lo=a;}
 const location=(lo+hi)/2;return {location,scale,objective:loss(location),...marginProbabilities(location,scale,line)};
}
function evaluation(raw,values,kind,game,line,policy){
 const e=structuredClone(raw),fair=e.fair_market;if(!fair||!finite(e.side_a?.offered_odds)||!finite(e.side_b?.offered_odds))throw Error('Two-sided prices required');
 const side=(win,loss,old,pfair)=>{const conditional=win/(win+loss),odds=old.offered_odds;return {...old,win_probability:win,loss_probability:loss,push_probability:values.push,conditional_win_probability:conditional,probability_edge:conditional-pfair,expected_value:win*(odds>0?odds/100:100/-odds)-loss,expected_value_scope:'per_staked_unit'};};
 e.side_a=side(values.home,values.away,e.side_a,fair.side_a_probability);e.side_b=side(values.away,values.home,e.side_b,fair.side_b_probability);
 const selection=home=>{const team=home?game.home_team:game.away_team,n=home?line:-line;return kind==='moneyline'?team+' ML':team+' '+(n>0?'+':'')+n;};
 const home=e.side_a.conditional_win_probability>.5,prob=Math.max(e.side_a.conditional_win_probability,e.side_b.conditional_win_probability),even=Math.abs(prob-.5)<epsilon;
 e.model_prediction={status:even?'EVEN':'MODEL_DIRECTION',selection:even?null:selection(home),probability:prob,confidence:prob<.52?'LOW':prob<.6?'MODERATE':'HIGH',exact_probability_tie:even,scope:'Joint margin distribution from selected spread and moneyline forecasts'};
 const bestHome=e.side_a.expected_value>=e.side_b.expected_value,best=bestHome?e.side_a:e.side_b,pick=best.probability_edge>=(policy.minimum_probability_edge??.03)&&best.expected_value>=(policy.minimum_expected_value??.02)&&best.conditional_win_probability>=(policy.minimum_model_conditional_win_probability??.52);
 e.recommendation=pick?{decision:'PICK',selection:selection(bestHome),confidence:best.probability_edge>=.08?'HIGH':best.probability_edge>=.05?'MODERATE':'LEAN',probability_edge:best.probability_edge,expected_value:best.expected_value,expected_value_scope:'per_staked_unit',model_conditional_win_probability:best.conditional_win_probability}:{decision:'PASS',selection:null,reason:even?'EVEN_MODEL_PROBABILITY':'NO_EDGE_CLEARS_EXISTING_THRESHOLDS'};
 e.joint_model_version=JOINT_VERSION;e.push_estimate_status='JOINT_INTEGER_MARGIN_DISTRIBUTION';delete e.tie_estimate_source;delete e.side_a.tie_estimate_source;delete e.side_b.tie_estimate_source;
 return e;
}
export function cohereGameFeed(base,training,now=Date.now()){
 const out=structuredClone(base);out.joint_model_version=JOINT_VERSION;out.joint_model_checked_at=new Date(now).toISOString();
 for(const [id,g]of Object.entries(out.games||{})){
  let accepted=0;
  for(const q of g.snapshot_evaluations||[]){if(q.eligible_for_current_recommendation===false)continue;
   try{
    const ml=q.markets?.moneyline,sp=q.markets?.spread;
    if(ml?.model_version!=='football-sportsbook-learning-v1'||sp?.model_version!=='sportsbook-calibration-learning-v1')throw Error('Selected model missing');
    const raw=q.independent_model_inputs||{moneyline:structuredClone(ml),spread:structuredClone(sp)};
    const mw=raw.moneyline.side_a?.conditional_win_probability,sw=raw.spread.side_a?.conditional_win_probability;
    const cutoff=Math.min(now,Date.parse(g.kickoff)),fit=fitMarginScale(training,g.week||base.week,cutoff),joint=solveJointMargin(mw,sw,q.market?.home_spread,fit.scale);
    q.independent_model_inputs=raw;q.markets.moneyline=evaluation(raw.moneyline,joint.moneyline,'moneyline',g,q.market.home_spread,base.recommendation_policy||{});q.markets.spread=evaluation(raw.spread,joint.spread,'spread',g,q.market.home_spread,base.recommendation_policy||{});
    q.joint_distribution={version:JOINT_VERSION,family:'discretized_logistic_margin',location:joint.location,scale:joint.scale,training_games:fit.training_games,training_through_week:fit.training_through_week,input_home_moneyline_probability:mw,input_home_spread_probability:sw,objective:joint.objective};accepted++;
   }catch(e){for(const kind of ['moneyline','spread']){q.markets||={};q.markets[kind]={model_version:kind==='spread'?'sportsbook-calibration-learning-v1':'football-sportsbook-learning-v1',joint_model_version:JOINT_VERSION,recommendation:{decision:'WAIT',reason:'JOINT_MODEL_UNAVAILABLE',detail:e.message}};}delete q.joint_distribution;}
  }
  const quotes=(g.snapshot_evaluations||[]).filter(q=>q.eligible_for_current_recommendation!==false&&q.joint_distribution).sort((a,b)=>Date.parse(b.captured_at)-Date.parse(a.captured_at)),q=quotes.find(q=>q.book==='draftkings')||quotes[0];
  g.joint_model={version:JOINT_VERSION,status:accepted?'CURRENT':'UNAVAILABLE',checked_at:out.joint_model_checked_at};
  for(const kind of ['moneyline','spread']){g[kind+'_model']={...g[kind+'_model'],joint_version:JOINT_VERSION,current_prediction:q?.markets[kind].model_prediction||null};g.model_predictions||={};g.model_predictions[kind]=q?.markets[kind].model_prediction||{status:'UNAVAILABLE',selection:null};g.current_recommendations||={};g.current_recommendations[kind]=q?.markets[kind].recommendation||{decision:'WAIT',reason:'JOINT_MODEL_UNAVAILABLE'};}
 }
 return out;
}
export function replaceJointOutputs(feed,consumer,now=Date.now()){
 if(feed.week!=null&&Number(feed.week)!==Number(consumer.week))throw Error('Joint prediction week mismatch');
 const out=structuredClone(feed),ids=new Set(Object.keys(consumer.games||{})),old=x=>ids.has(x?.event_id||x?.game_id)&&['spread','moneyline'].includes(String(x.market_type||x.market).toLowerCase()),legs=[],ranked=[];
 for(const [id,g]of Object.entries(consumer.games||{})){
 const quotes=(g.snapshot_evaluations||[]).filter(q=>q.eligible_for_current_recommendation!==false&&q.joint_distribution).sort((a,b)=>Date.parse(b.captured_at)-Date.parse(a.captured_at)),q=quotes.find(q=>q.book==='draftkings')||quotes[0],target=Array.isArray(out.games)?out.games.find(x=>x.event_id===id||(x.home_team===g.home_team&&x.away_team===g.away_team)):null;
 if(target){target.joint_model=g.joint_model;target.current_recommendations={...target.current_recommendations,...g.current_recommendations};target.moneyline_model=g.moneyline_model;target.spread_model=g.spread_model;target.moneyline_pick=q?.markets.moneyline.model_prediction?.selection||'Not available';target.model_spread_pick=q?.markets.spread.model_prediction?.selection||'Not available';target.win_probability=q?.markets.moneyline.side_a.win_probability??null;target.home_win_probability=q?.markets.moneyline.side_a.conditional_win_probability??null;target.away_win_probability=q?.markets.moneyline.side_b.conditional_win_probability??null;target.show_work={...target.show_work,moneyline:null,spread:null};target.model_summary=q?['moneyline','spread','total'].map(k=>q.markets[k]?.model_prediction?.selection).filter(Boolean).join(' · '):'Waiting for current picks.';target.model_edge=target.model_summary;target.moneyline_quote=q?.markets.moneyline.quote||null;if(q){const mq=q.markets.moneyline.quote;target.moneyline=mq?g.away_team+' '+mq.away_moneyline+' / '+g.home_team+' '+mq.home_moneyline:target.moneyline;target.spread=g.home_team+' '+(q.market.home_spread>0?'+':'')+q.market.home_spread;}delete target.spread_breakdown;delete target.model_projection_home;delete target.model_projection_away;if(Array.isArray(target.model_pick))target.model_pick=target.model_pick.filter(x=>! /^(MONEYLINE|SPREAD):/i.test(x));}
 if(!q)continue;
 for(const kind of ['spread','moneyline']){const e=q.markets[kind],r=e.recommendation;if(r.decision!=='PICK')continue;const home=r.selection.startsWith(g.home_team+' '),v=home?e.side_a:e.side_b,mq=e.quote||q,leg_id=id+':'+kind+':'+q.snapshot_id+':'+r.selection.replace(/\s/g,'_');
 if(target&&Array.isArray(target.model_pick))target.model_pick.push(kind.toUpperCase()+': '+r.selection+' ('+r.confidence+')');
 if(Date.parse(g.kickoff)<=now)continue;
 legs.push({leg_id,event_id:id,week:consumer.week,market_type:kind,side:r.selection,sportsbook:q.book,american_odds:v.offered_odds,model_win_probability:v.win_probability,model_conditional_win_probability:v.conditional_win_probability,model_push_probability:v.push_probability,probability_edge:v.probability_edge,expected_value:v.expected_value,expected_value_scope:'per_staked_unit',observed_at:mq.captured_at,standalone_approved:true,label:'PICK',source_type:'GAME',model_version:e.model_version,joint_model_version:JOINT_VERSION});
 ranked.push({opportunity_id:'GAME|'+id+'|'+kind.toUpperCase()+'|'+q.snapshot_id,week:consumer.week,entity_type:'GAME',market_type:kind.toUpperCase(),game_id:id,matchup:g.away_team+' @ '+g.home_team,selection:r.selection,decision:'PICK',confidence:r.confidence,book:q.book,captured_at:mq.captured_at,line:kind==='spread'?(home?q.market.home_spread:-q.market.home_spread):null,offered_odds:v.offered_odds,model_win_probability:v.win_probability,model_conditional_win_probability:v.conditional_win_probability,model_push_probability:v.push_probability,probability_edge:v.probability_edge,expected_value:v.expected_value,expected_value_scope:'per_staked_unit',model_version:e.model_version,joint_model_version:JOINT_VERSION});}
 }
 if(Array.isArray(out.eligible_legs))out.eligible_legs=[...out.eligible_legs.filter(x=>!old(x)),...legs];if(Array.isArray(out.ranked_picks))out.ranked_picks=[...out.ranked_picks.filter(x=>!old(x)),...ranked];for(const k of ['near_misses','stale_findings'])if(Array.isArray(out[k]))out[k]=out[k].filter(x=>!old(x));if(Array.isArray(out.parlays))out.parlays=out.parlays.filter(t=>!(t.legs||[]).some(l=>typeof l==='string'?[...ids].some(id=>['spread','moneyline'].some(k=>l.startsWith(id+':'+k+':'))):old(l)));out.joint_model_version=JOINT_VERSION;return out;
}
export function jointMarketView(raw,joint,kind){
 if(joint?.model_version!==JOINT_VERSION||!joint.consumer)throw Error('Joint publication required');
 const out={...structuredClone(raw),joint_model_version:JOINT_VERSION,checked_at:joint.checked_at,status:joint.status,health:joint.health,revision_id:joint.revision_id,games:{}};
 for(const [id,g]of Object.entries(joint.consumer.games||{})){
 const quotes=(g.snapshot_evaluations||[]).filter(q=>q.eligible_for_current_recommendation!==false&&q.joint_distribution).sort((a,b)=>Date.parse(b.captured_at)-Date.parse(a.captured_at)),q=quotes.find(q=>q.book==='draftkings')||quotes[0];if(!q)continue;
 out.games[id]={...raw?.games?.[id],game_id:id,week:joint.week,home_team:g.home_team,away_team:g.away_team,kickoff:g.kickoff,quote:kind==='moneyline'?(q.markets.moneyline.quote||q):q,evaluation:q.markets[kind],joint_distribution:q.joint_distribution};
 }
 return out;
}
