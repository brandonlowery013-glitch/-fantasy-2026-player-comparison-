import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const ref=read('data/probability/generated/historical-reference-population-2021-2025.json');
const sourceOfTruth=read('MODEL_SOURCE_OF_TRUTH.json');
const activeCount=Number(sourceOfTruth.active_player_model);
const participation=read('data/probability/generated/historical-pass-play-participation-2021-2025.json');
const rows=(ref.rows||[]).filter(r=>r.played!==false&&['QB','RB','WR','TE'].includes(r.position));
const finite=x=>Number.isFinite(Number(x));
const n=x=>finite(x)?Number(x):0;
const round=(x,d=4)=>Number(Number(x).toFixed(d));
const partByIdSeason=new Map((participation.rows||[]).filter(r=>r.player_id&&r.season).map(r=>[`${r.player_id}|${r.season}`,r]));

const POLICY={
  QB_STARTER:{position:'QB',description:'Starting-role QB season proxy',qualify:s=>s.pass_attempts>=250&&s.games_pass_15>=8},
  QB_MOBILE_STARTER:{position:'QB',description:'Starting-role QB with material designed/scramble rushing usage',qualify:s=>s.pass_attempts>=250&&s.games_pass_15>=8&&(s.rush_attempts>=50||s.rush_yards>=250)},
  QB_LOW_RUSH_STARTER:{position:'QB',description:'Starting-role QB without material rushing volume',qualify:s=>s.pass_attempts>=250&&s.games_pass_15>=8&&!(s.rush_attempts>=50||s.rush_yards>=250)},
  RB_LEAD:{position:'RB',description:'Lead-back workload season proxy',qualify:s=>s.rush_attempts>=180||(s.rush_attempts>=150&&s.targets>=35)},
  RB_COMMITTEE:{position:'RB',description:'Committee/secondary rushing workload season proxy',qualify:s=>s.rush_attempts>=90&&s.rush_attempts<180&&!(s.rush_attempts>=150&&s.targets>=35)},
  RB_RECEIVING:{position:'RB',description:'Material receiving-back role season proxy',qualify:s=>s.targets>=40&&s.target_games>=10&&s.targets_per_target_game>=2.5},
  WR_FULL_TIME:{position:'WR',description:'Observed full-time receiving-role season using pass-play participation plus receiving involvement',qualify:s=>s.pass_play_participation>=0.80&&s.pass_play_snaps>=300&&s.target_rate_per_pass_play_snap>=0.10},
  WR_NEAR_FULL_TIME:{position:'WR',description:'Observed near-full-time receiving-role season',qualify:s=>s.pass_play_participation>=0.65&&s.pass_play_snaps>=225&&s.target_rate_per_pass_play_snap>=0.10&&!(s.pass_play_participation>=0.80&&s.pass_play_snaps>=300&&s.target_rate_per_pass_play_snap>=0.10)},
  TE_RECEIVING:{position:'TE',description:'Observed primary receiving-TE role season using pass-play participation plus receiving involvement',qualify:s=>s.pass_play_participation>=0.65&&s.pass_play_snaps>=225&&s.target_rate_per_pass_play_snap>=0.08},
  TE_SECONDARY_RECEIVING:{position:'TE',description:'Observed secondary receiving-TE role season',qualify:s=>s.pass_play_participation>=0.45&&s.pass_play_snaps>=150&&s.target_rate_per_pass_play_snap>=0.08&&!(s.pass_play_participation>=0.65&&s.pass_play_snaps>=225&&s.target_rate_per_pass_play_snap>=0.08)}
};

const bySeason=new Map();
for(const r of rows){const key=`${r.player_id}|${r.season}`;if(!bySeason.has(key))bySeason.set(key,{player_id:r.player_id,player:r.player,position:r.position,season:r.season,rows:[]});bySeason.get(key).rows.push(r);}
function aggregateSeason(g){
  const rs=g.rows;let targets=0,targetGames=0,passAttempts=0,gamesPass15=0,rushAttempts=0,rushYards=0;
  for(const r of rs){const t=n(r.targets),pa=n(r.pass_attempts),ra=n(r.rush_attempts),ry=n(r.rush_yards);targets+=t;if(t>0)targetGames++;passAttempts+=pa;if(pa>=15)gamesPass15++;rushAttempts+=ra;rushYards+=ry;}
  const pp=partByIdSeason.get(`${g.player_id}|${g.season}`)||null;
  return {player_id:g.player_id,player:g.player,position:g.position,season:g.season,games:rs.length,targets,target_games:targetGames,targets_per_target_game:targetGames?targets/targetGames:0,pass_attempts:passAttempts,games_pass_15:gamesPass15,rush_attempts:rushAttempts,rush_yards:rushYards,pass_play_participation:pp?.pass_play_participation??null,pass_play_snaps:pp?.pass_play_snaps??null,eligible_team_dropbacks:pp?.eligible_team_dropbacks??null,target_rate_per_pass_play_snap:pp?.target_rate_per_pass_play_snap??null,participation_source:pp?.source??null,rows:rs};
}
const seasons=[...bySeason.values()].map(aggregateSeason);
const statFields={QB:['pass_attempts','pass_yards','pass_tds','rush_attempts','rush_yards','rush_tds'],RB:['rush_attempts','rush_yards','rush_tds','targets','receptions','receiving_yards','receiving_tds'],WR:['targets','receptions','receiving_yards','receiving_tds'],TE:['targets','receptions','receiving_yards','receiving_tds']};
function meanSd(values){const a=values.filter(finite).map(Number);if(!a.length)return {n:0,mean:null,sd:null};const mean=a.reduce((x,y)=>x+y,0)/a.length;const variance=a.length>1?a.reduce((x,y)=>x+(y-mean)**2,0)/(a.length-1):0;return {n:a.length,mean:round(mean),sd:round(Math.sqrt(Math.max(0,variance)))}};

const cohorts={};const memberships=[];
for(const [name,p] of Object.entries(POLICY)){
  const eligible=seasons.filter(s=>s.position===p.position&&p.qualify(s));const gameRows=eligible.flatMap(s=>s.rows);const stats={};for(const stat of statFields[p.position])stats[stat]=meanSd(gameRows.map(r=>r[stat]));
  cohorts[name]={position:p.position,description:p.description,player_seasons:eligible.length,unique_players:new Set(eligible.map(s=>s.player_id)).size,player_games:gameRows.length,stats,sample_player_seasons:eligible.slice(0,20).map(s=>({player:s.player,season:s.season,games:s.games,pass_attempts:s.pass_attempts,rush_attempts:s.rush_attempts,targets:s.targets,pass_play_participation:s.pass_play_participation==null?null:round(s.pass_play_participation),pass_play_snaps:s.pass_play_snaps,target_rate_per_pass_play_snap:s.target_rate_per_pass_play_snap==null?null:round(s.target_rate_per_pass_play_snap),participation_source:s.participation_source}))};
  for(const s of eligible)memberships.push({cohort:name,player_id:s.player_id,player:s.player,position:s.position,season:s.season,pass_play_participation:s.pass_play_participation,pass_play_snaps:s.pass_play_snaps,target_rate_per_pass_play_snap:s.target_rate_per_pass_play_snap});
}

const blocked=[];
if(ref.live_player_universe_count!==activeCount)blocked.push(`live player universe mismatch: expected ${activeCount}, found ${ref.live_player_universe_count}`);
if(participation.sportsbook_inputs_used!==false)blocked.push('participation history unexpectedly uses sportsbook inputs');
for(const required of ['QB_STARTER','RB_LEAD','RB_RECEIVING','WR_FULL_TIME','TE_RECEIVING']){if((cohorts[required]?.player_seasons||0)<25)blocked.push(`${required} player-season sample too small: ${cohorts[required]?.player_seasons||0}`);if((cohorts[required]?.player_games||0)<250)blocked.push(`${required} player-game sample too small: ${cohorts[required]?.player_games||0}`);}
for(const [name,c] of Object.entries(cohorts))for(const [stat,x] of Object.entries(c.stats))if(x.n>0&&(!finite(x.mean)||!finite(x.sd)||x.sd<0))blocked.push(`${name} ${stat} invalid summary`);
for(const name of ['WR_FULL_TIME','WR_NEAR_FULL_TIME','TE_RECEIVING','TE_SECONDARY_RECEIVING'])for(const m of memberships.filter(x=>x.cohort===name))if(!(finite(m.pass_play_participation)&&finite(m.pass_play_snaps)&&finite(m.target_rate_per_pass_play_snap)))blocked.push(`${name} includes non-observed role member: ${m.player} ${m.season}`);

const generated_at=new Date().toISOString();
const output={schema_version:'2.1.1',generated_at,season_target:2026,history_window:[2021,2022,2023,2024,2025],mode:'SHADOW_ONLY',actionable:false,sportsbook_inputs_used:false,live_player_universe_count:ref.live_player_universe_count,purpose:'Role-matched historical prior foundation. WR/TE cohorts use observed GSIS pass-play participation plus receiving involvement; true route metrics are not fabricated.',policy_notes:['QB cohorts exclude low-volume backup/relief seasons from the starting-role passing baseline.','RB cohorts separate lead rushing, committee rushing, and receiving-back roles.','WR/TE cohorts no longer use target totals alone to define full-time roles.','Pass-play participation is an observed on-field dropback metric and is explicitly not called route participation.','Receiving-involvement rate filters reduce blocking-only TE and cardio-only WR contamination.','Fantasy Life remains the preferred true-route validation source when available; StatRankings is secondary verification only.','No sportsbook line, price, spread or total is used.'],cohorts,memberships};
const report={generated_at,result:blocked.length?'BLOCKED':'PASS',mode:'SHADOW_ONLY',actionable:false,sportsbook_inputs_used:false,live_player_universe_count:ref.live_player_universe_count,participation_history_rows:(participation.rows||[]).length,cohort_counts:Object.fromEntries(Object.entries(cohorts).map(([k,v])=>[k,{player_seasons:v.player_seasons,unique_players:v.unique_players,player_games:v.player_games}])),blocked,safeguards:[`WR/TE primary cohorts require observed pass-play role evidence plus meaningful receiving involvement.`,`The authoritative live fantasy population is read from MODEL_SOURCE_OF_TRUTH (${activeCount} players).`,'Missing participation data does not qualify a WR/TE season and is never converted to zero.','Pass-play participation is never mislabeled as routes run or route participation.','This creates priors only; it does not rewrite current fantasy ranks or make betting recommendations.']};
fs.writeFileSync(path.join(root,'data/probability/generated/role-cohort-priors-2021-2025.json'),JSON.stringify(output,null,2)+'\n');
fs.writeFileSync(path.join(root,'guardrails/role-cohort-priors-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(blocked.length)process.exit(1);
