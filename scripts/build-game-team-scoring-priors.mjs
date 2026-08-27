import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),JSON.stringify(x,null,2)+'\n');};
const contract=read('data/sources/weekly-game-projection-engine-2026.json');
const target='data/probability/generated/game-team-scoring-priors-2023-2025.json';
const existing=read(target);
const alias={LAR:'LA',WSH:'WAS',JAC:'JAX'};
const canon=x=>alias[String(x||'').toUpperCase()]||String(x||'').toUpperCase();
const mean=a=>a.reduce((s,x)=>s+x,0)/Math.max(1,a.length);
const sd=a=>{if(a.length<2)return 0;const m=mean(a);return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1));};
const corr=(a,b)=>{if(a.length<2||a.length!==b.length)return 0;const ma=mean(a),mb=mean(b),sa=Math.sqrt(a.reduce((s,x)=>s+(x-ma)**2,0)),sb=Math.sqrt(b.reduce((s,x)=>s+(x-mb)**2,0));if(!sa||!sb)return 0;return a.reduce((s,x,i)=>s+(x-ma)*(b[i]-mb),0)/(sa*sb);};
const round=(x,d=6)=>Number(Number(x).toFixed(d));

function synthetic(){return [
  {season:2023,week:1,home:'CHI',away:'GB',home_score:20,away_score:17},
  {season:2023,week:2,home:'GB',away:'CHI',home_score:24,away_score:21},
  {season:2024,week:1,home:'CHI',away:'GB',home_score:27,away_score:20},
  {season:2024,week:2,home:'GB',away:'CHI',home_score:23,away_score:24},
  {season:2025,week:1,home:'CHI',away:'GB',home_score:28,away_score:24},
  {season:2025,week:2,home:'GB',away:'CHI',home_score:21,away_score:26}
];}

function parse(payload,season,week){const out=[];for(const e of payload.events||[]){const c=e.competitions?.[0];if(!c||e.status?.type?.state!=='post')continue;const t={};for(const x of c.competitors||[]){const team=canon(x.team?.abbreviation),score=Number(x.score);if(!team||!Number.isFinite(score))continue;t[x.homeAway]={team,score};}if(t.home&&t.away)out.push({season,week,home:t.home.team,away:t.away.team,home_score:t.home.score,away_score:t.away.score});}return out;}

async function fetchHistory(){const out=[];for(const season of contract.history_window)for(let week=1;week<=18;week++){const url=contract.historical_score_source.url_template.replace('{season}',season).replace('{week}',week);const r=await fetch(url,{headers:{'user-agent':'fantasy-2026-game-prior'}});if(!r.ok)throw new Error(`${season} W${week} -> ${r.status}`);out.push(...parse(await r.json(),season,week));}return out;}

async function main(){const self=process.argv.includes('--self-test');if(!self&&!process.argv.includes('--refresh')&&existing.status==='READY'&&JSON.stringify(existing.history_window)===JSON.stringify(contract.history_window)){console.log(JSON.stringify({result:'PASS',reused:true,games:existing.game_count},null,2));return;}
  const games=self?synthetic():await fetchHistory();const blocked=[];if(!games.length)blocked.push('No final historical games');
  const teamScores=[],homeScores=[],awayScores=[],homeMargins=[];const by={};
  const ensure=t=>by[t]??={pf:[],pa:[]};
  for(const g of games){if(!Number.isFinite(g.home_score)||!Number.isFinite(g.away_score)){blocked.push('Non-finite score');continue;}teamScores.push(g.home_score,g.away_score);homeScores.push(g.home_score);awayScores.push(g.away_score);homeMargins.push(g.home_score-g.away_score);ensure(g.home).pf.push(g.home_score);ensure(g.home).pa.push(g.away_score);ensure(g.away).pf.push(g.away_score);ensure(g.away).pa.push(g.home_score);}
  const leagueMean=mean(teamScores),k=Number(contract.team_prior_method.shrinkage_equivalent_games);const teams={};
  for(const [team,x] of Object.entries(by)){const n=x.pf.length,pf=mean(x.pf),pa=mean(x.pa);teams[team]={games:n,points_for_mean:round(pf),points_allowed_mean:round(pa),shrunk_offense:round((n*pf+k*leagueMean)/(n+k)),shrunk_defense_allowed:round((n*pa+k*leagueMean)/(n+k))};}
  const league={team_points_mean:round(leagueMean),team_score_sd:round(sd(teamScores)),home_field_advantage_points:round(mean(homeMargins)),home_away_score_correlation:round(Math.max(-.5,Math.min(.5,corr(homeScores,awayScores)))),shrinkage_equivalent_games:k};
  if(self){if(Object.keys(teams).length!==2)blocked.push('self-test team count');if(!(league.team_score_sd>0))blocked.push('self-test score sd');if(!Number.isFinite(league.home_field_advantage_points))blocked.push('self-test home advantage');}
  const out={schema_version:'1.0.0',status:blocked.length?'BLOCKED':'READY',history_window:contract.history_window,sportsbook_inputs_used:false,generated_at:new Date().toISOString(),game_count:games.length,league,teams};
  const report={generated_at:out.generated_at,result:blocked.length?'BLOCKED':'PASS',mode:'SHADOW_ONLY',actionable:false,self_test:self,game_count:games.length,team_count:Object.keys(teams).length,sportsbook_inputs_used:false,league,blocked};write('guardrails/game-team-scoring-priors-report.json',report);if(!self)write(target,out);console.log(JSON.stringify(report,null,2));if(blocked.length)process.exit(1);
}
main().catch(e=>{console.error(e);process.exit(1);});
