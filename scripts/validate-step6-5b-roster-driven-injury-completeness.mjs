import fs from 'node:fs';

const cfg=JSON.parse(fs.readFileSync('guardrails/guardrails-config.json','utf8'));
const registry=JSON.parse(fs.readFileSync('data/sources/step6-5b-roster-driven-injury-review-registry-2026.json','utf8'));
let players=[];
for(let i=0;i<cfg.authoritative_player_shards;i++) players.push(...JSON.parse(fs.readFileSync(`players${i}.json`,'utf8')));
const expected=players.map(p=>p.n);
const reviews=registry.reviews||[];
const reviewed=reviews.map(r=>r.subject);
const dup=[...new Set(reviewed.filter((n,i)=>reviewed.indexOf(n)!==i))];
const missing=expected.filter(n=>!reviewed.includes(n));
const unknown=reviewed.filter(n=>!expected.includes(n));
const missingTeams=[];
const nflTeams=['ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC','LV','LAC','LAR','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SEA','SF','TB','TEN','WAS'];
const teamsComplete=new Set(registry.impact_non_fantasy_universe?.teams_complete||[]);
for(const t of nflTeams) if(!teamsComplete.has(t)) missingTeams.push(t);
const complete=players.length===cfg.authoritative_player_count && missing.length===0 && dup.length===0 && unknown.length===0 && missingTeams.length===0;
if(registry.closure_allowed===true && !complete){
  console.error(JSON.stringify({status:'FAIL_FALSE_CLOSURE',missing_fantasy_players:missing,duplicate_reviews:dup,unknown_reviews:unknown,missing_impact_team_manifests:missingTeams},null,2));
  process.exit(1);
}
if(registry.closure_allowed===false && registry.status==='IN_PROGRESS'){
  console.log(JSON.stringify({status:'IN_PROGRESS_BLOCKED_FROM_CLOSURE',authoritative_fantasy_players:players.length,reviewed_fantasy_players:reviewed.filter(n=>expected.includes(n)).length,missing_fantasy_count:missing.length,missing_fantasy_players:missing,missing_impact_team_manifest_count:missingTeams.length,missing_impact_team_manifests:missingTeams,closure_allowed:false},null,2));
  process.exit(0);
}
if(!complete){
  console.error(JSON.stringify({status:'FAIL_INCOMPLETE',missing_fantasy_players:missing,duplicate_reviews:dup,unknown_reviews:unknown,missing_impact_team_manifests:missingTeams},null,2));
  process.exit(1);
}
console.log(JSON.stringify({status:'PASS_COMPLETE',fantasy_players:players.length,impact_team_manifests:teamsComplete.size,closure_allowed:registry.closure_allowed===true},null,2));
