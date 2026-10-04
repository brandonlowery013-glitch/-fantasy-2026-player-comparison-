import assert from 'node:assert/strict';import fs from 'node:fs';import '../runtime-show-work-2026.js';
const {gameMarketView,quarterbackConcerns}=globalThis.CTD_SHOW_WORK;
const g=JSON.parse(fs.readFileSync('data/market/all-game-model-rerun-2026.json')).games['2026-W4-GB-TB'];
const original=JSON.stringify(g),s=g.snapshot_evaluations.find(s=>s.snapshot_id===g.current_recommendations.snapshot_id),now=Date.parse('2026-10-04T16:00:00Z');
assert(quarterbackConcerns(g,now).some(p=>p.player==='Baker Mayfield'));
for(const t of [now,Date.parse('2026-10-04T22:00:00Z')]){
 const held=gameMarketView({...g,rerun:true},s,t);
 for(const k of ['spread','moneyline','total']){assert.equal(held.markets[k].recommendation.decision,'WAIT');assert.equal(held.markets[k].recommendation.confidence,null);assert.deepEqual(held.markets[k].side_a,s.markets[k].side_a);}
}
assert.equal(JSON.stringify(g),original);
assert.equal(gameMarketView({...g,rerun:false},s,Date.parse('2026-10-04T22:00:00Z')),s,'Original historical picks remain unchanged');
const fresh=structuredClone(g);const qb=fresh.personnel_context.teams.TB.players.find(p=>p.name==='Baker Mayfield');qb.injury_reports.push({status:'Active',source_updated_at:'2026-10-04T15:30:00Z'});
assert(!quarterbackConcerns(fresh,now).some(p=>p.player==='Baker Mayfield'),'Newer clearance supersedes old adverse report');
const backup=structuredClone(g);backup.context_evidence={players:[]};backup.personnel_context.teams.TB.players.find(p=>p.name==='Baker Mayfield').depth_roles=[{position:'QB',rank:2}];assert.equal(quarterbackConcerns(backup,now).length,0);
assert.equal(quarterbackConcerns(g,Date.parse('2026-09-01T00:00:00Z')).length,0);
console.log('PASS: actual stale Mayfield report holds all three markets, including reruns after kickoff; original history and probabilities unchanged; backup/future/clearance cases pass');

const after=structuredClone(g);after.personnel_context.teams.TB.players.find(p=>p.name==='Baker Mayfield').injury_reports.push({status:'Active',source_updated_at:'2026-10-04T20:00:00Z'});
assert.equal(gameMarketView({...after,rerun:true},s,Date.parse('2026-10-04T22:00:00Z')).markets.spread.recommendation.decision,'WAIT','An after-kickoff report cannot clear the pregame injury in a retrospective rerun');
console.log('PASS: retrospective gate excludes after-kickoff status changes');
