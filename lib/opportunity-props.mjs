// Football-only, joint team/player simulator. No sportsbook input is accepted.
export const OPPORTUNITY_VERSION='ctd-opportunity-props-v1';
export const canonicalTeam=t=>({LA:'LAR',WSH:'WAS',JAC:'JAX'}[t]||t);
export const playerIdentity=n=>String(n||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'').replace(/(jr|iii|ii)$/,'');
const sum=(a,k)=>a.reduce((s,r)=>s+(Number(r[k])||0),0),avg=a=>a.reduce((s,v)=>s+v,0)/(a.length||1);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),safe=(a,b,f=0)=>b>0?a/b:f;
const STATS=['pass_attempts','pass_yards','pass_tds','interceptions','rush_attempts','rush_yards','rush_tds','targets','receptions','receiving_yards','receiving_tds'];
export function beforeWeek(r,season,week){return Number.isInteger(r.season)&&Number.isInteger(r.week)&&r.week>=1&&r.week<=18&&(r.season<season||r.season===season&&r.week<week);}
export function aggregateTeams(rows){
 const map=new Map();
 for(const r of rows){const team=canonicalTeam(r.team),opponent=canonicalTeam(r.opponent),key=[r.season,r.week,team].join('|');
  if(!team||!opponent)continue;
  if(!map.has(key))map.set(key,{season:r.season,week:r.week,team,opponent,...Object.fromEntries(STATS.map(k=>[k,0]))});
  const t=map.get(key);if(t.opponent!==opponent)throw Error('Conflicting team/week opponent');for(const k of STATS)t[k]+=Number(r[k])||0;
 }
 return [...map.values()].sort((a,b)=>a.season-b.season||a.week-b.week);
}
// These estimates use only the specified fitting window. Hyperparameters are
// selected on a subsequent development window, never on the final holdout.
export function fitOpportunityPrior(rows,{throughSeason=2022,shrinkGames=4}={}){
 const fit=rows.filter(r=>r.season<=throughSeason),teams=aggregateTeams(fit),positions={};
 if(teams.length<32)throw Error('Insufficient historical team games');
 for(const pos of ['QB','RB','WR','TE']){
  const rs=fit.filter(r=>r.position===pos),receiving=rs.filter(r=>r.receptions>0),rushing=rs.filter(r=>r.rush_attempts>0);
  const efficiency=(a,count,yards)=>{
   const mean=safe(sum(a,yards),sum(a,count)),variance=safe(a.reduce((s,r)=>s+(r[yards]-mean*r[count])**2,0),sum(a,count),1);
   const shift=Math.min(0,...a.map(r=>safe(r[yards],r[count])));
   return {mean,variance:Math.max(.01,variance),shift};
  };
  positions[pos]={catch_rate:safe(sum(rs,'receptions'),sum(rs,'targets'),.65),receiving:efficiency(receiving,'receptions','receiving_yards'),rushing:efficiency(rushing,'rush_attempts','rush_yards'),receiving_td_rate:safe(sum(rs,'receiving_tds'),sum(rs,'receptions')),rushing_td_rate:safe(sum(rs,'rush_tds'),sum(rs,'rush_attempts')),interception_rate:safe(sum(rs,'interceptions'),sum(rs,'pass_attempts'),.025)};
 }
 return {version:OPPORTUNITY_VERSION,through_season:throughSeason,shrink_games:shrinkGames,sportsbook_inputs_used:false,fit_rows:fit.length,team_games:teams.length,positions,league:{plays:avg(teams.map(r=>r.pass_attempts+r.rush_attempts)),pass_rate:safe(sum(teams,'pass_attempts'),sum(teams,'pass_attempts')+sum(teams,'rush_attempts')),catch_rate:safe(sum(teams,'receptions'),sum(teams,'targets')),ypc:safe(sum(teams,'receiving_yards'),sum(teams,'receptions')),yards_per_carry:safe(sum(teams,'rush_yards'),sum(teams,'rush_attempts')),interception_rate:safe(sum(teams,'interceptions'),sum(teams,'pass_attempts'))}};
}
function random(seed){let a=2166136261;for(const c of String(seed)){a^=c.charCodeAt(0);a=Math.imul(a,16777619);}return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function normal(rng){return Math.sqrt(-2*Math.log(Math.max(rng(),1e-12)))*Math.cos(2*Math.PI*rng());}
function gamma(shape,scale,rng){if(shape<1)return gamma(shape+1,scale,rng)*Math.max(rng(),1e-12)**(1/shape);const d=shape-1/3,c=1/Math.sqrt(9*d);for(let i=0;i<1000;i++){const z=normal(rng),v=(1+c*z)**3;if(v<=0)continue;const u=rng();if(u<1-.0331*z**4||Math.log(Math.max(u,1e-12))<z*z/2+d*(1-v+Math.log(v)))return scale*d*v;}throw Error('Gamma sampling failed');}
const binomial=(n,p,rng)=>{let k=0;for(let j=0;j<n;j++)if(rng()<p)k++;return k;};
function categorical(weights,rng){const total=weights.reduce((a,b)=>a+b,0);if(!(total>0))return weights.length-1;let x=rng()*total;for(let i=0;i<weights.length;i++){x-=weights[i];if(x<=0)return i;}return weights.length-1;}
function yardDraw(count,eff,rng){if(!count)return 0;const mu=eff.mean-eff.shift;if(!(mu>0)||!(eff.variance>0))throw Error('Invalid yard efficiency');const shape=mu*mu/eff.variance;return Math.round(count*eff.shift+gamma(count*shape,eff.variance/mu,rng));}
function shrink(n,d,prior,strength){return (n+prior*strength)/(d+strength);}
function groupHistory(rows){const by=new Map();for(const r of rows){const k=playerIdentity(r.player);if(!by.has(k))by.set(k,[]);by.get(k).push(r);}return by;}
export function teamOpportunity({team,opponent,roster,rows,prior,season,week,expectedQB,asOf,kickoff}){
 if(prior.sportsbook_inputs_used!==false||prior.through_season>=season)throw Error('Prior must exclude forecast season and sportsbook data');
 if(!Number.isFinite(Date.parse(asOf))||Date.parse(asOf)>=Date.parse(kickoff))throw Error('Pregame as-of required');
 if(rows.some(r=>!beforeWeek(r,season,week)))throw Error('Future or same-week result in opportunity inputs');
 team=canonicalTeam(team);opponent=canonicalTeam(opponent);
 const teams=aggregateTeams(rows),own=teams.filter(r=>r.team===team).slice(-8),against=teams.filter(r=>r.opponent===opponent).slice(-8),history=groupHistory(rows),N=prior.shrink_games,L=prior.league;
 if(own.length<2||against.length<2)throw Error('At least two earlier team and opponent games required');
 const eff=(a,n,d,base)=>shrink(sum(a,n),sum(a,d),base,N*(d==='rush_attempts'?25:d==='receptions'?22:35));
 const plays=a=>(sum(a,'pass_attempts')+sum(a,'rush_attempts')+N*L.plays)/(a.length+N);
 const ownPass=shrink(sum(own,'pass_attempts'),sum(own,'pass_attempts')+sum(own,'rush_attempts'),L.pass_rate,N*L.plays),oppPass=shrink(sum(against,'pass_attempts'),sum(against,'pass_attempts')+sum(against,'rush_attempts'),L.pass_rate,N*L.plays);
 const totalPlays=(plays(own)+plays(against))/2,passRate=clamp((ownPass+oppPass)/2,.05,.95),receivingFactor=eff(against,'receiving_yards','receptions',L.ypc)/L.ypc,runFactor=eff(against,'rush_yards','rush_attempts',L.yards_per_carry)/L.yards_per_carry,catchFactor=eff(against,'receptions','targets',L.catch_rate)/L.catch_rate;
 const qbHistory=(history.get(playerIdentity(expectedQB))||[]).filter(r=>r.pass_attempts>0).slice(-8),teamYPA=safe(sum(own,'pass_yards'),sum(own,'pass_attempts'),L.ypc*L.catch_rate),qbFactor=shrink(sum(qbHistory,'pass_yards'),sum(qbHistory,'pass_attempts'),teamYPA,N*35)/Math.max(.01,teamYPA);
 const teamIndex=new Map(teams.map(t=>[[t.season,t.week,t.team].join('|'),t]));
 const unique=new Set(),profiles=[];
 for(const p of roster){
  const key=playerIdentity(p.name);if(!key||unique.has(key))throw Error('Duplicate player identity in roster');unique.add(key);
  if(!['QB','RB','WR','TE'].includes(p.position))continue;
  if(p.position==='QB'&&key!==playerIdentity(expectedQB))continue;
  const h=(history.get(key)||[]).slice(-8),cohort=prior.positions[p.position];
  const teamWeeks=h.map(r=>teamIndex.get([r.season,r.week,canonicalTeam(r.team)].join('|'))).filter(Boolean);
  const targetShare=safe(sum(h,'targets'),sum(teamWeeks,'pass_attempts')),carryShare=safe(sum(h,'rush_attempts'),sum(teamWeeks,'rush_attempts'));
  const catching=shrink(sum(h,'receptions'),sum(h,'targets'),cohort.catch_rate,N*5)*catchFactor;
  const receiving={...cohort.receiving,mean:shrink(sum(h,'receiving_yards'),sum(h,'receptions'),cohort.receiving.mean,N*3)*receivingFactor*qbFactor};
  const rushing={...cohort.rushing,mean:shrink(sum(h,'rush_yards'),sum(h,'rush_attempts'),cohort.rushing.mean,N*6)*runFactor};
  receiving.mean=Math.max(receiving.shift+.01,receiving.mean);rushing.mean=Math.max(rushing.shift+.01,rushing.mean);
  const hasRoutes=Number.isFinite(p.routes_per_dropback)&&p.routes_per_dropback>=0&&p.routes_per_dropback<=1&&Number.isFinite(p.targets_per_route)&&p.targets_per_route>=0&&p.targets_per_route<=1&&p.route_source&&Number.isFinite(Date.parse(p.route_observed_at))&&Date.parse(p.route_observed_at)<=Date.parse(asOf)&&Date.parse(asOf)-Date.parse(p.route_observed_at)<=48*3600000;
  const share=hasRoutes?p.routes_per_dropback*p.targets_per_route:targetShare;
  profiles.push({...p,key,history_games:h.length,target_weight:p.expected_active===false?0:share,carry_weight:p.expected_active===false?0:carryShare,receiving,rushing,catch_rate:clamp(catching,0,1),receiving_td_rate:shrink(sum(h,'receiving_tds'),sum(h,'receptions'),cohort.receiving_td_rate,N*3),rushing_td_rate:shrink(sum(h,'rush_tds'),sum(h,'rush_attempts'),cohort.rushing_td_rate,N*6),interception_rate:shrink(sum(h,'interceptions'),sum(h,'pass_attempts'),cohort.interception_rate,N*35),opportunity_method:hasRoutes?'ROUTES_X_TARGETS_PER_ROUTE':'EARLIER_TARGET_SHARE_FALLBACK',routes_verified:!!hasRoutes});
 }
 if(!profiles.some(p=>p.position==='QB'))throw Error('Verified expected QB missing from roster');
 if(profiles.find(p=>p.position==='QB').expected_active===false)throw Error('Expected QB is reported unavailable');
 const lostTarget=profiles.filter(p=>p.expected_active===false).reduce((s,p)=>{const h=(history.get(p.key)||[]).slice(-8);return s+safe(sum(h,'targets'),sum(h.map(r=>teamIndex.get([r.season,r.week,canonicalTeam(r.team)].join('|'))).filter(Boolean),'pass_attempts'));},0);
 // Vacated work is deliberately NOT automatically handed to every backup.
 // Verified replacement shares, if supplied, take precedence exactly once.
 for(const p of profiles)if(p.expected_active!==false&&Number.isFinite(p.verified_target_share)&&Number.isFinite(Date.parse(p.role_observed_at))&&Date.parse(p.role_observed_at)<=Date.parse(asOf)&&Date.parse(asOf)-Date.parse(p.role_observed_at)<=48*3600000&&p.role_source){p.target_weight=clamp(p.verified_target_share,0,1);p.opportunity_method='VERIFIED_REPLACEMENT_ROLE';}
 return {team,opponent,profiles,plays:totalPlays,pass_rate:passRate,quarterback_efficiency_factor:qbFactor,own,against,lost_target_share:lostTarget,coverage:{own_games:own.length,opponent_games:against.length,latest_season:rows.at(-1)?.season,latest_week:rows.at(-1)?.week},missing:['Pressure/sacks and scrambles are not separable in weekly player aggregates','Weather and specific coverage assignments unavailable','Goal-line carries and red-zone routes unavailable',...(qbHistory.length<2?['Starting QB has insufficient earlier passing history']:[]),...(lostTarget>0?['Vacated opportunities require verified replacement roles']:[])]};
}
export function simulateOpportunityGame({game,home,away,prior,draws=2048,seed=game.game_id}){
 if(!Number.isInteger(draws)||draws<128||draws>20000)throw Error('Draw count outside supported range');
 if(home.team===away.team||home.opponent!==away.team||away.opponent!==home.team)throw Error('Teams/opponents do not reconcile');
 const rng=random(seed),outputs={},teams={home:[],away:[]};
 for(const context of [home,away])for(const p of context.profiles){if(outputs[p.name])throw Error('Duplicate player across game');outputs[p.name]={position:p.position,team:context.team,expected_active:p.expected_active,opportunity_method:p.opportunity_method,history_games:p.history_games,draws:Object.fromEntries(STATS.map(k=>[k,[]])),missing:[...context.missing,...(!p.routes_verified&&['WR','TE'].includes(p.position)?['Verified routes unavailable; target-share fallback used']:[]),...(p.history_games<2?['Insufficient observed player workload']:[])]};}
 for(let d=0;d<draws;d++){
  // One common pace draw keeps opposing team volumes related. Sampling earlier
  // observed plays avoids inventing a fixed league-wide Gaussian for all props.
  const sample=home.own[Math.floor(rng()*home.own.length)],pace=(sample.pass_attempts+sample.rush_attempts)/avg(home.own.map(r=>r.pass_attempts+r.rush_attempts));
  for(const [side,c]of [['home',home],['away',away]]){
   const records=c.profiles.map(()=>Object.fromEntries(STATS.map(k=>[k,0]))),plays=Math.max(0,Math.round(c.plays*pace)),attempts=binomial(plays,c.pass_rate,rng),carries=plays-attempts;
   const tw=c.profiles.map(p=>p.target_weight),rw=c.profiles.map(p=>p.carry_weight);
   const targetMass=tw.reduce((a,b)=>a+b,0),carryMass=rw.reduce((a,b)=>a+b,0);
   // OTHER retains unmodeled roster work/throwaways; overallocated shares are
   // normalized, never independently multiplied into impossible team totals.
   const targetWeights=[...tw,Math.max(0,1-targetMass)],carryWeights=[...rw,Math.max(0,1-carryMass)];
   let otherTargets=0,otherReceptions=0,otherYards=0,otherTDs=0,otherCarries=0,otherRushYards=0;
   for(let j=0;j<attempts;j++){const i=categorical(targetWeights,rng);if(i<c.profiles.length)records[i].targets++;else otherTargets++;}
   for(let j=0;j<carries;j++){const i=categorical(carryWeights,rng);if(i<c.profiles.length)records[i].rush_attempts++;else otherCarries++;}
   for(let i=0;i<c.profiles.length;i++){const p=c.profiles[i],r=records[i];r.receptions=binomial(r.targets,p.catch_rate,rng);r.receiving_yards=yardDraw(r.receptions,p.receiving,rng);r.rush_yards=yardDraw(r.rush_attempts,p.rushing,rng);r.receiving_tds=binomial(r.receptions,p.receiving_td_rate,rng);r.rush_tds=binomial(r.rush_attempts,p.rushing_td_rate,rng);}
   otherReceptions=binomial(otherTargets,prior.league.catch_rate,rng);otherYards=yardDraw(otherReceptions,prior.positions.WR.receiving,rng);otherTDs=binomial(otherReceptions,prior.positions.WR.receiving_td_rate,rng);otherRushYards=yardDraw(otherCarries,prior.positions.RB.rushing,rng);
   const qb=c.profiles.findIndex(p=>p.position==='QB'),q=records[qb];q.pass_attempts=attempts;q.pass_yards=sum(records,'receiving_yards')+otherYards;q.pass_tds=sum(records,'receiving_tds')+otherTDs;q.interceptions=binomial(attempts,c.profiles[qb].interception_rate,rng);
   for(let i=0;i<c.profiles.length;i++)for(const k of STATS)outputs[c.profiles[i].name].draws[k].push(records[i][k]);
   teams[side].push({plays,pass_attempts:attempts,rush_attempts:carries,targets:sum(records,'targets')+otherTargets,receptions:sum(records,'receptions')+otherReceptions,receiving_yards:sum(records,'receiving_yards')+otherYards,passing_yards:q.pass_yards,passing_tds:q.pass_tds,receiving_tds:sum(records,'receiving_tds')+otherTDs,rushing_yards:sum(records,'rush_yards')+otherRushYards,other_targets:otherTargets,other_carries:otherCarries,other_receiving_yards:otherYards});
  }
 }
 return {version:OPPORTUNITY_VERSION,game_id:game.game_id,season:game.season,week:game.week,kickoff:game.kickoff,generated_at:game.as_of,draw_count:draws,sportsbook_inputs_used:false,actionable:false,players:outputs,team_draws:teams};
}
export function empiricalSummary(values){if(!Array.isArray(values)||values.length<128||!values.every(Number.isFinite))throw Error('Invalid empirical sample');const sorted=[...values].sort((a,b)=>a-b),mean=avg(values),sd=Math.sqrt(avg(values.map(v=>(v-mean)**2)));return {mean,sd,p10:sorted[Math.floor(.1*(sorted.length-1))],median:sorted[Math.floor(.5*(sorted.length-1))],p90:sorted[Math.floor(.9*(sorted.length-1))]};}
export function empiricalHistogram(samples){empiricalSummary(samples);const m=new Map();for(const v of samples)m.set(v,(m.get(v)||0)+1);const values=[...m.keys()].sort((a,b)=>a-b);return {values,counts:values.map(v=>m.get(v))};}
export function empiricalTails(values,line){
 if(!Number.isFinite(line))throw Error('Finite prop line required');
 if(!Array.isArray(values)){
  const a=values?.values,c=values?.counts;
  if(!Array.isArray(a)||!Array.isArray(c)||a.length!==c.length||!a.length||!a.every(Number.isFinite)||!c.every(n=>Number.isInteger(n)&&n>0)||new Set(a).size!==a.length)throw Error('Invalid empirical histogram');
  const total=c.reduce((s,v)=>s+v,0);if(total<128||total>20000)throw Error('Invalid empirical histogram sample count');
  const mass=test=>a.reduce((s,v,i)=>s+(test(v)?c[i]:0),0)/total;
  return {over:mass(v=>v>line),under:mass(v=>v<line),push:mass(v=>v===line)};
 }
 empiricalSummary(values);return {over:values.filter(v=>v>line).length/values.length,under:values.filter(v=>v<line).length/values.length,push:values.filter(v=>v===line).length/values.length};
}
