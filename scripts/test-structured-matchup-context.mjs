import assert from 'node:assert/strict';import fs from 'node:fs';
import {priorRows,teamMetrics,buildStructuredContext} from '../lib/structured-matchup-context.mjs';
import {gameContextReview,playerContextReview} from '../lib/context-reconciliation.mjs';
const base={season:2026,season_type:'REG',week:3,game_id:'past',team:'WAS',opponent_team:'IND',attempts:30,sacks_suffered:0,carries:20,targets:25,passing_epa:3,rushing_epa:2,passing_yards:210,rushing_yards:80};
assert.equal(priorRows([base,{...base,week:4},{...base,season:2025},{...base,season_type:'POST'}],2026,4).length,1);
assert.equal(teamMetrics([base]).sack_rate,0);assert.equal(teamMetrics([{...base,sacks_suffered:''}]).sack_rate,null);assert.throws(()=>teamMetrics([base,base]),/Duplicate/);
const p={...base,player_id:'one',player_display_name:'Test Player',position:'WR',targets:5,receptions:4,receiving_yards:50,fantasy_points:5,fantasy_points_ppr:9};
const c=buildStructuredContext([base,{...base,team:'IND',opponent_team:'WAS'}],[p],{season:2026,week:4});
assert.equal(c.players.one.target_share,.2);assert.equal(c.players.one.expected_targets,null);assert.equal(c.teams.IND.position_allowed.WR.ppr_fantasy_points_per_game,9);assert.equal(c.teams.IND.position_allowed.QB.ppr_fantasy_points_per_game,null);
assert.equal(playerContextReview(c,{player:'Test Player',team:'WSH',opponent:'IND',week:5}),null);
assert.match(playerContextReview(c,{player:'Test Player',team:'WAS',opponent:'IND',week:4,scoring:'standard'}).text,/5.0 standard/);
c.matchups=[{home_team:'WAS',away_team:'IND',event_start:'2026-10-04T12:30:00Z'}];
const game={home_team:'WSH',away_team:'IND',kickoff:'2026-10-04T12:30:00Z'};c.teams.WSH.offense.sack_rate=null;
const review=gameContextReview(c,game,'WSH +4.5','spread');assert.equal(review.numeric_adjustment,0);assert.match(review.sections[0].text,/own sack rate was unavailable/);assert.equal(gameContextReview(c,{...game,kickoff:'2026-10-05T12:30:00Z'},'WSH','spread').status,'UNAVAILABLE');
const actual=JSON.parse(fs.readFileSync('data/probability/generated/structured-matchup-context-2026.json'));assert.equal(Object.keys(actual.teams).length,32);assert.equal(actual.matchups.length,16);
for(const p of Object.values(actual.players)){assert(p.latest_week<actual.week);assert.equal(p.expected_targets,null);}
console.log('PASS: chronology, aliases, duplicate rejection, missing versus zero, positional scoring, exact matchup identity, no invented projections or numerical adjustment');
