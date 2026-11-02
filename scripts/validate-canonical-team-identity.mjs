import fs from 'node:fs';
import {athleteRows,resolveCurrentTeams} from '../lib/current-player-teams.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const truth=read('MODEL_SOURCE_OF_TRUTH.json'),players=[];
for(let i=0;i<truth.runtime_player_shards;i++)players.push(...read(`players${i}.json`));
if(players.length!==truth.active_player_model||new Set(players.map(p=>p.n)).size!==players.length)throw Error('Canonical player coverage mismatch');
async function get(url){let error;for(let attempt=0;attempt<3;attempt++){try{const r=await fetch(url,{headers:{accept:'application/json','user-agent':'CTD-current-team-identity/2'},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}catch(e){error=e;}}throw Error(url+': '+error.message);}
const directory=await get('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams?limit=40');
const teams=(directory.sports?.[0]?.leagues?.[0]?.teams||[]).map(r=>r.team||r);
if(teams.length!==32)throw Error('ESPN directory must contain all 32 teams');
if(players.some(p=>!teams.some(t=>t.displayName===p.t)))throw Error("Unknown canonical team name");
const sources=[];
for(let i=0;i<teams.length;i+=8)sources.push(...await Promise.all(teams.slice(i,i+8).map(async t=>{
 const prefix='https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/'+t.id;
 const depth_url=prefix+'/depthcharts',roster_url=prefix+'/roster';
 const [depth,roster]=await Promise.all([get(depth_url),get(roster_url)]);
 const result={name:t.displayName,depth:athleteRows(depth),roster:athleteRows(roster),depth_url,roster_url};
 if(!result.depth.length||!result.roster.length)throw Error('Missing depth/roster identities: '+t.displayName);
 return result;
})));
const identity=resolveCurrentTeams(players,sources);
fs.mkdirSync('data/ingestion',{recursive:true});fs.mkdirSync('guardrails',{recursive:true});
fs.writeFileSync('data/ingestion/current-player-teams-2026.json',JSON.stringify(identity,null,2)+'\n');
const report={generated_at:identity.observed_at,result:identity.status,universe:players.length,teams_checked:32,verified_team_changes:Object.values(identity.players).filter(p=>p.status==='VERIFIED_TEAM_CHANGE'),unresolved:Object.values(identity.players).filter(p=>p.status==='UNRESOLVED_LIVE_TEAM'),blocked:identity.blocked,model_files_modified:false};
fs.writeFileSync('guardrails/canonical-team-identity-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
if(identity.status!=='PASS')throw Error('Current roster identity verification failed: '+identity.blocked.join('; '));
