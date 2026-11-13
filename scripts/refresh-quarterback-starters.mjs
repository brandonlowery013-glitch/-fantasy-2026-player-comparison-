import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseCSV,canon} from '../lib/game-scoring-calibration.mjs';
import {prepareQuarterbackStarters} from '../lib/prepare-quarterback-starters.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const arg=name=>process.argv.find(a=>a.startsWith(name+'='))?.slice(name.length+1);
const gameId=arg('--game');if(!gameId)throw Error('Use --game=ID for a bounded refresh');
const supplied=arg('--news-file');if(!supplied&&!process.argv.includes('--fetch-news'))throw Error('Supply --news-file=PATH or --fetch-news');
const projection=read('data/probability/generated/weekly-game-projections-2026.json'),p=projection.games[gameId];if(!p)throw Error('Unknown game');
const at=new Date().toISOString();if(Date.parse(p.event_start)<=Date.parse(at))throw Error('Started games cannot receive a new pregame forecast');
const cache='.cache/matchup-context/',files=['players.csv','games.csv',...Array.from({length:7},(_,i)=>`stats_player_week_${2020+i}.csv`),...Array.from({length:7},(_,i)=>`stats_team_week_${2020+i}.csv`)];
const csv=f=>parseCSV(fs.readFileSync(cache+f,'utf8'));
const schedule=csv('games.csv'),sg=schedule.find(g=>+g.season===+projection.season&&+g.week===+(p.week||projection.week)&&canon(g.home_team)===canon(p.home_team)&&canon(g.away_team)===canon(p.away_team));if(!sg)throw Error('Verified schedule game missing');
const names={ARI:'Cardinals',ATL:'Falcons',BAL:'Ravens',BUF:'Bills',CAR:'Panthers',CHI:'Bears',CIN:'Bengals',CLE:'Browns',DAL:'Cowboys',DEN:'Broncos',DET:'Lions',GB:'Packers',HOU:'Texans',IND:'Colts',JAX:'Jaguars',KC:'Chiefs',LA:'Rams',LAR:'Rams',LAC:'Chargers',LV:'Raiders',MIA:'Dolphins',MIN:'Vikings',NE:'Patriots',NO:'Saints',NYG:'Giants',NYJ:'Jets',PHI:'Eagles',PIT:'Steelers',SEA:'Seahawks',SF:'49ers',TB:'Buccaneers',TEN:'Titans',WAS:'Commanders'};
const normalize=t=>t==='LAR'?'LA':t;const home=normalize(sg.home_team),away=normalize(sg.away_team);
const game={id:gameId,season:+sg.season,week:+sg.week,verified:true,home_team:home,away_team:away,kickoff:p.event_start,matchup_aliases:[names[home],names[away]].filter(Boolean),opponent_aliases:{[home]:[names[home]].filter(Boolean),[away]:[names[away]].filter(Boolean)}};
let news;if(supplied)news=read(supplied);else{const r=await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=50',{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Starter news HTTP '+r.status);news=await r.json();}
if(!Array.isArray(news.articles))throw Error('Invalid news response');
const dest='data/context/quarterback-starter-scenarios-2026.json',previous=fs.existsSync(dest)?read(dest):{games:{}};
const result=prepareQuarterbackStarters({news,games:[game],players:csv('players.csv'),schedule,stats:files.filter(f=>f.startsWith('stats_player')).flatMap(csv),teamStats:files.filter(f=>f.startsWith('stats_team')).flatMap(csv),model:read('data/probability/generated/quarterback-score-model-2026.json'),previous,receivedAt:at,injuries:fs.existsSync('data/ingestion/live-injury-poll-2026.json')?read('data/ingestion/live-injury-poll-2026.json').players:[],sourceIds:files.map(f=>f+':'+createHash('sha256').update(fs.readFileSync(cache+f)).digest('hex'))});
const next={...previous,captured_at:at,games:{...previous.games,...result.games}};
if(!process.argv.includes('--dry-run')){fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest+'.tmp',JSON.stringify(next,null,2)+'\n');fs.renameSync(dest+'.tmp',dest);if(process.argv.includes('--recalculate'))execFileSync(process.execPath,[fileURLToPath(new URL('./build-game-market-recommendations.mjs',import.meta.url))],{stdio:'inherit'});}
console.log(JSON.stringify({game:gameId,reports:result.games[gameId]?.reports.length||0,scenarios:result.games[gameId]?.scenarios.length||0,status:result.games[gameId]?.missing_input||(!result.games[gameId]?'No verified announcement found':'READY_FOR_SHADOW_RECALCULATION')}));
