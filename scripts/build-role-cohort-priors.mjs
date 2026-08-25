import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const ref=read('data/probability/generated/historical-reference-population-2021-2025.json');
const rows=(ref.rows||[]).filter(r=>r.played!==false&&['QB','RB','WR','TE'].includes(r.position));
const finite=x=>Number.isFinite(Number(x));
const n=x=>finite(x)?Number(x):0;
const round=(x,d=4)=>Number(Number(x).toFixed(d));

const POLICY={
  QB_STARTER:{position:'QB',description:'Starting-role QB season proxy',qualify:s=>s.pass_attempts>=250&&s.games_pass_15>=8},
  QB_MOBILE_STARTER:{position:'QB',description:'Starting-role QB with material designed/scramble rushing usage',qualify:s=>s.pass_attempts>=250&&s.games_pass_15>=8&&(s.rush_attempts>=50||s.rush_yards>=250)},
  QB_LOW_RUSH_STARTER:{position:'QB',description:'Starting-role QB without material rushing volume',qualify:s=>s.pass_attempts>=250&&s.games_pass_15>=8&&!(s.rush_attempts>=50||s.rush_yards>=250)},
  RB_LEAD:{position:'RB',description:'Lead-back workload season proxy',qualify:s=>s.rush_attempts>=180||(s.rush_attempts>=150&&s.targets>=35)},
  RB_COMMITTEE:{position:'RB',description:'Committee/secondary rushing workload season proxy',qualify:s=>s.rush_attempts>=90&&s.rush_attempts<180&&!(s.rush_attempts>=150&&s.targets>=35)},
  RB_RECEIVING:{position:'RB',description:'Material receiving-back role season proxy',qualify:s=>s.targets>=40&&s.target_games>=10&&s.targets_per_target_game>=2.5},
  WR_FULL_TIME:{position:'WR',description:'Full-time/near-full-time receiving-role proxy pending broad route data',qualify:s=>s.targets>=80&&s.target_games>=12&&s.targets_per_target_game>=5},
  WR_NEAR_FULL_TIME:{position:'WR',description:'Secondary meaningful receiving-role proxy',qualify:s=>s.targets>=60&&s.target_games>=10&&s.targets_per_target_game>=4.5&&!(s.targets>=80&&s.target_games>=12&&s.targets_per_target_game>=5)},
  TE_RECEIVING:{position:'TE',description:'Primary receiving-TE role proxy pending broad route data',qualify:s=>s.targets>=50&&s.target_games>=10&&s.targets_per_target_game>=3.5},
  TE_SECONDARY_RECEIVING:{position:'TE',description:'Secondary receiving-TE role proxy',qualify:s=>s.targets>=35&&s.target_games>=9&&s.targets_per_target_game>=3&&!(s.targets>=50&&s.target_games>=10&&s.targets_per_target_game>=3.5)}
};

const bySeason=new Map();
for(const r of rows){
  const key=`${r.player_id}|${r.season}`;
  if(!bySeason.has(key))bySeason.set(key,{player_id:r.player_id,player:r.player,position:r.position,season:r.season,rows:[]});
  bySeason.get(key).rows.push(r);
}

function aggregateSeason(g){
  const rs=g.rows;
  let targets=0,targetGames=0,passAttempts=0,gamesPass15=0,rushAttempts=0,rushYards=0;
  for(const r of rs){
    const t=n(r.targets),pa=n(r.pass_attempts),ra=n(r.rush_attempts),ry=n(r.rush_yards);
    targets+=t;if(t>0)targetGames++;
    passAttempts+=pa;if(pa>=15)gamesPass15++;
    rushAttempts+=ra;rushYards+=ry;
  }
  return {
    player_id:g.player_id,player:g.player,position:g.position,season:g.season,
    games:rs.length,targets,target_games:targetGames,targets_per_target_game:targetGames?targets/targetGames:0,
    pass_attempts:passAttempts,games_pass_15:gamesPass15,rush_attempts:rushAttempts,rush_yards:rushYards,rows:rs
  };
}

const seasons=[...bySeason.values()].map(aggregateSeason);
const statFields={
  QB:['pass_attempts','pass_yards','pass_tds','rush_attempts','rush_yards','rush_tds'],
  RB:['rush_attempts','rush_yards','rush_tds','targets','receptions','receiving_yards','receiving_tds'],
  WR:['targets','receptions','receiving_yards','receiving_tds'],
  TE:['targets','receptions','receiving_yards','receiving_tds']
};
function meanSd(values){
  const a=values.filter(finite).map(Number);if(!a.length)return {n:0,mean:null,sd:null};
  const mean=a.reduce((x,y)=>x+y,0)/a.length;
  const variance=a.length>1?a.reduce((x,y)=>x+(y-mean)**2,0)/(a.length-1):0;
  return {n:a.length,mean:round(mean),sd:round(Math.sqrt(Math.max(0,variance)))};
}

const cohorts={};
const memberships=[];
for(const [name,p] of Object.entries(POLICY)){
  const eligible=seasons.filter(s=>s.position===p.position&&p.qualify(s));
  const gameRows=eligible.flatMap(s=>s.rows);
  const stats={};
  for(const stat of statFields[p.position])stats[stat]=meanSd(gameRows.map(r=>r[stat]));
  cohorts[name]={
    position:p.position,description:p.description,
    player_seasons:eligible.length,unique_players:new Set(eligible.map(s=>s.player_id)).size,player_games:gameRows.length,
    stats,
    sample_player_seasons:eligible.slice(0,20).map(s=>({player:s.player,season:s.season,games:s.games,pass_attempts:s.pass_attempts,rush_attempts:s.rush_attempts,targets:s.targets,target_games:s.target_games,targets_per_target_game:round(s.targets_per_target_game)}))
  };
  for(const s of eligible)memberships.push({cohort:name,player_id:s.player_id,player:s.player,position:s.position,season:s.season});
}

const blocked=[];
if(ref.live_player_universe_count!==162)blocked.push(`live player universe changed: ${ref.live_player_universe_count}`);
for(const required of ['QB_STARTER','RB_LEAD','RB_RECEIVING','WR_FULL_TIME','TE_RECEIVING']){
  if((cohorts[required]?.player_seasons||0)<25)blocked.push(`${required} player-season sample too small: ${cohorts[required]?.player_seasons||0}`);
  if((cohorts[required]?.player_games||0)<250)blocked.push(`${required} player-game sample too small: ${cohorts[required]?.player_games||0}`);
}
for(const [name,c] of Object.entries(cohorts)){
  for(const [stat,x] of Object.entries(c.stats)){
    if(x.n>0&&(!finite(x.mean)||!finite(x.sd)||x.sd<0))blocked.push(`${name} ${stat} invalid summary`);
  }
}

const generated_at=new Date().toISOString();
const output={
  schema_version:'1.0.0',generated_at,season_target:2026,history_window:[2021,2022,2023,2024,2025],
  mode:'SHADOW_ONLY',actionable:false,sportsbook_inputs_used:false,
  purpose:'Role-matched historical prior foundation. Cohorts are inspected and calibrated before any downstream weekly projection uses them.',
  policy_notes:[
    'QB cohorts exclude low-volume backup/relief seasons from the starting-role passing baseline.',
    'RB cohorts separate lead rushing, committee rushing, and receiving-back roles; overlap is allowed when a back genuinely held multiple roles.',
    'WR/TE cohort labels are receiving-workload proxies because broad 2021-2025 route participation is not yet complete. They must not be described as observed route-share cohorts.',
    'Fringe WR/TE seasons remain in historical storage but do not shape the primary full-time receiving-role priors.',
    'No sportsbook line, price, spread or total is used.'
  ],
  cohorts,memberships
};
const report={
  generated_at,result:blocked.length?'BLOCKED':'PASS',mode:'SHADOW_ONLY',actionable:false,sportsbook_inputs_used:false,
  live_player_universe_count:ref.live_player_universe_count,cohort_counts:Object.fromEntries(Object.entries(cohorts).map(([k,v])=>[k,{player_seasons:v.player_seasons,unique_players:v.unique_players,player_games:v.player_games}])),
  blocked,
  safeguards:[
    'Role cohorts are built only from football-side historical usage.',
    'The authoritative live fantasy population must remain exactly 162.',
    'Historical fringe players are retained for archival completeness but excluded from primary role cohorts unless their season workload qualifies.',
    'WR/TE workload proxies are explicitly temporary until route-share history is broadened.',
    'This step creates priors only; it does not rewrite current fantasy ranks or make betting recommendations.'
  ]
};
fs.writeFileSync(path.join(root,'data/probability/generated/role-cohort-priors-2021-2025.json'),JSON.stringify(output,null,2)+'\n');
fs.writeFileSync(path.join(root,'guardrails/role-cohort-priors-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(blocked.length)process.exit(1);
