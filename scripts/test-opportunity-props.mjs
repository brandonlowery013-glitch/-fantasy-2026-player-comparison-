import assert from 'node:assert/strict';
import {fitOpportunityPrior,aggregateTeams,teamOpportunity,simulateOpportunityGame,empiricalTails,empiricalSummary} from '../lib/opportunity-props.mjs';
import {normalizePlayerRows} from './build-opportunity-props.mjs';
const rows=[];
for(const season of [2021,2022,2023])for(let week=1;week<=8;week++)for(const team of ['BUF','NYJ'])for(const [name,position,target,rec,ry,carry,rush,attempt,pass]of [['QB','QB',0,0,0,3,12,30,210],['RB','RB',3,2,10,20,80,0,0],['WR','WR',9,6,90,0,0,0,0],['TE','TE',6,4,40,0,0,0,0]])rows.push({season,week,team,opponent:team==='BUF'?'NYJ':'BUF',player:team+name,position,targets:target,receptions:rec,receiving_yards:ry,rush_attempts:carry,rush_yards:rush,pass_attempts:attempt,pass_yards:pass,pass_tds:2,receiving_tds:position==='WR'?1:0,rush_tds:position==='RB'?1:0,interceptions:position==='QB'?1:0});
const prior=fitOpportunityPrior(rows,{throughSeason:2022}),asOf='2023-11-01T10:00:00Z',kickoff='2023-11-02T10:00:00Z';
const earlier=rows.filter(r=>r.season<2023||r.week<8);
const roster=t=>['QB','RB','WR','TE'].map(position=>({name:t+position,position,expected_active:true}));
const build=(team,opponent,extra={})=>teamOpportunity({team,opponent,roster:roster(team),rows:earlier,prior,season:2023,week:8,expectedQB:team+'QB',asOf,kickoff,...extra});
const home=build('BUF','NYJ'),away=build('NYJ','BUF'),game={game_id:'fixture',season:2023,week:8,kickoff,as_of:asOf};
const sim=simulateOpportunityGame({game,home,away,prior,draws:256});
assert.deepEqual(sim,simulateOpportunityGame({game,home,away,prior,draws:256}),'seed replay must be exact');
for(const side of ['home','away'])for(const t of sim.team_draws[side]){assert.equal(t.plays,t.pass_attempts+t.rush_attempts);assert.equal(t.targets,t.pass_attempts);assert(t.receptions<=t.targets);assert.equal(t.passing_yards,t.receiving_yards);assert.equal(t.passing_tds,t.receiving_tds);}
for(const p of Object.values(sim.players))for(let i=0;i<256;i++){assert(p.draws.receptions[i]<=p.draws.targets[i]);assert(p.draws.receiving_tds[i]<=p.draws.receptions[i]);assert(p.draws.rush_tds[i]<=p.draws.rush_attempts[i]);}
assert(sim.players.BUFWR.draws.receiving_yards.some(v=>v>0));assert(empiricalSummary(sim.players.BUFWR.draws.receiving_yards).sd>0);
const samples=Array.from({length:128},(_,i)=>i%4);assert.deepEqual(empiricalTails(samples,2),{over:.25,under:.5,push:.25});assert.deepEqual(empiricalTails(samples,2.5),{over:.25,under:.75,push:0});
assert.throws(()=>empiricalTails([NaN],2),/Invalid/);
assert.throws(()=>build('BUF','NYJ',{rows}),/Future/);
assert.throws(()=>build('BUF','NYJ',{prior:{...prior,through_season:2023}}),/exclude/);
assert.throws(()=>build('BUF','NYJ',{asOf:kickoff}),/Pregame/);
const injuredRoster=roster('BUF').map(p=>({...p,expected_active:p.position==='WR'?false:true})),injured=build('BUF','NYJ',{roster:injuredRoster});
const out=simulateOpportunityGame({game,home:injured,away,prior,draws:256});assert(out.players.BUFWR.draws.targets.every(v=>v===0));assert(out.players.BUFWR.draws.receiving_yards.every(v=>v===0));assert(injured.lost_target_share>0);assert(injured.missing.some(s=>s.includes('Vacated')));
assert.throws(()=>build('BUF','NYJ',{roster:roster('BUF').map(p=>({...p,expected_active:p.position!=='QB'}))}),/QB is reported unavailable/);
const routeRoster=roster('BUF').map(p=>p.position==='TE'?{...p,routes_per_dropback:.9,targets_per_route:.3,route_source:'verified fixture',route_observed_at:asOf}:p),routed=build('BUF','NYJ',{roster:routeRoster});assert.equal(routed.profiles.find(p=>p.position==='TE').opportunity_method,'ROUTES_X_TARGETS_PER_ROUTE');
const staleRoute=build('BUF','NYJ',{roster:routeRoster.map(p=>({...p,route_observed_at:'2023-01-01T00:00:00Z'}))});assert.equal(staleRoute.profiles.find(p=>p.position==='TE').opportunity_method,'EARLIER_TARGET_SHARE_FALLBACK');
const tough=earlier.map(r=>r.team==='NYJ'?{...r,receiving_yards:r.receiving_yards/2,rush_yards:r.rush_yards/2}:r);
// Opponent allowances are rows AGAINST the opponent, not that opponent's own offense.
const changed=earlier.map(r=>r.opponent==='NYJ'?{...r,receiving_yards:r.receiving_yards/2,rush_yards:r.rush_yards/2}:r),defense=build('BUF','NYJ',{rows:changed});assert(defense.profiles.find(p=>p.position==='WR').receiving.mean<home.profiles.find(p=>p.position==='WR').receiving.mean);
const inflated=home.profiles.map(p=>({...p,target_weight:1,carry_weight:1})),oversubscribed=simulateOpportunityGame({game,home:{...home,profiles:inflated},away,prior,draws:128});for(const t of oversubscribed.team_draws.home)assert.equal(t.targets,t.pass_attempts);
const csv='season,week,season_type,position,player_display_name,team,opponent_team,attempts,passing_yards,passing_interceptions\n2026,9,REG,QB,"First, Last",BUF,NYJ,30,240,2\n2026,9,POST,QB,Wrong,BUF,NYJ,30,240,2\n';assert.equal(normalizePlayerRows(csv).length,1);assert.equal(normalizePlayerRows(csv)[0].interceptions,2);
console.log('PASS: chronological cutoffs, opponent adjustments, inactive/replacement holds, verified/stale routes, repeatable joint draws, exact QB/receiver and team opportunity accounting, integer pushes and source adapter.');
