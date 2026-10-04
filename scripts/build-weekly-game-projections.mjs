import {removeRestFromForecast,NO_REST_VERSION} from '../lib/scoring-rest-policy.mjs';
import {behaviorState} from '../lib/football-learning.mjs';
import {matchupPersonnel} from '../lib/team-personnel.mjs';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {simulateGameDistribution} from '../lib/game-market-probability.mjs';

const rerun=process.argv.includes('--all-game-rerun');
const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),JSON.stringify(x,null,2)+'\n');};
const contract=read('data/sources/weekly-game-projection-engine-2026.json');
const schedule=read('data/calibration/weekly-event-schedule-2026.json');
const priors=read('data/probability/generated/game-team-scoring-priors-2023-2025.json');
const personnelPath=path.join(root,'data/ingestion/team-personnel-2026.json');
const personnel=fs.existsSync(personnelPath)?JSON.parse(fs.readFileSync(personnelPath,'utf8')):null;
const learningPath=path.join(root,'data/market/issued-pick-results-2026.json');
const learning=fs.existsSync(learningPath)?JSON.parse(fs.readFileSync(learningPath,'utf8')).football_learning:null;
const learningAsOf=new Date().toISOString();
const round=(x,d=6)=>Number(Number(x).toFixed(d));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const pct=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.max(0,Math.floor((s.length-1)*p)))];};
function synthetic(){return {schedule:{season:2026,week:1,games:{'2026-W1-GB-CHI':{week:1,away_team:'GB',home_team:'CHI',event_start:'2026-09-10T00:20:00Z',verified:true}}},priors:{status:'READY',league:{team_points_mean:22.5,team_score_sd:9.5,home_field_advantage_points:1.8,home_away_score_correlation:.05},teams:{CHI:{shrunk_offense:24,shrunk_defense_allowed:21},GB:{shrunk_offense:23,shrunk_defense_allowed:22}}}};}
function project(gameId,g,p,learned=null){const h=p.teams[g.home_team],a=p.teams[g.away_team],L=p.league;if(!h||!a)return {blocked:`Missing team prior for ${!h?g.home_team:g.away_team}`};const neutral=g.neutral_site===true||g.neutralSite===true;const hfa=neutral?0:Number(L.home_field_advantage_points||0),sd=learned?learned.distribution.team_score_sd:Math.max(1,Number(L.team_score_sd||10)),rho=clamp(learned?learned.distribution.home_away_score_correlation:Number(L.home_away_score_correlation||0),-.5,.5);const hm=learned?learned.home_score_mean:(Number(h.shrunk_offense)+Number(a.shrunk_defense_allowed))/2+hfa/2;const am=learned?learned.away_score_mean:(Number(a.shrunk_offense)+Number(h.shrunk_defense_allowed))/2-hfa/2;const n=contract.distribution_method.simulations,draws=simulateGameDistribution(gameId,{model:{home_score_mean:round(hm,3),away_score_mean:round(am,3)},distribution:{simulations:n,team_score_sd:round(sd,3),home_away_score_correlation:round(rho,4)}}),hs=[],as=[],m=[],tot=[];let hw=0,aw=0,tie=0;for(const draw of draws){const x=draw.home,y=draw.away;hs.push(x);as.push(y);m.push(x-y);tot.push(x+y);if(x>y)hw++;else if(y>x)aw++;else tie++;}return {model_version:learned?.model_version||'three-season-scoring-baseline',scoring_evidence:learned?.evidence||null,home_team:g.home_team,away_team:g.away_team,event_start:g.event_start,neutral_site:neutral,home_field_advantage_applied:round(learned?learned.evidence.home_field_advantage_contribution:hfa,3),model:{home_score_mean:round(hm,3),away_score_mean:round(am,3),home_minus_away_margin:round(hm-am,3),model_home_spread:round(-(hm-am),3),model_total:round(hm+am,3),home_win_probability:round(hw/n),away_win_probability:round(aw/n),tie_probability:round(tie/n),score_percentiles:{home:{p10:pct(hs,.1),p50:pct(hs,.5),p90:pct(hs,.9)},away:{p10:pct(as,.1),p50:pct(as,.5),p90:pct(as,.9)}},margin_percentiles:{p10:pct(m,.1),p50:pct(m,.5),p90:pct(m,.9)},total_percentiles:{p10:pct(tot,.1),p50:pct(tot,.5),p90:pct(tot,.9)}},distribution:{simulations:n,team_score_sd:round(sd,3),home_away_score_correlation:round(rho,4)},sportsbook_inputs_used:false,mode:'SHADOW_ONLY',actionable:false};}
const self=process.argv.includes('--self-test'),src=self?synthetic():{schedule,priors};
const learnedPath='data/probability/generated/current-game-scoring-2026.json';
const learned=!self&&contract.calibrated_scoring?.enabled?read(learnedPath):null;
const previous=!self?read('data/probability/generated/weekly-game-projections-2026.json'):{games:{}};
if(!self&&contract.calibrated_scoring?.enabled){
  const artifactHash=createHash('sha256').update(fs.readFileSync('data/probability/generated/game-scoring-model-2026.json')).digest('hex');
  if(learned?.status!=='READY'||learned.week!==schedule.week||learned.season!==schedule.season||learned.model_version!==contract.calibrated_scoring.model_version||learned.sportsbook_inputs_used!==false||learned.artifact_sha256!==artifactHash)throw Error('Missing, mismatched, or unvalidated current scoring refresh');
  const age=Date.now()-Date.parse(learned.generated_at);if(!Number.isFinite(age)||age<0||(!rerun&&age>24*3600000))throw Error('Current scoring refresh expired');
}
const blocked=[];if(src.priors.status!=='READY')blocked.push('Historical team scoring priors are not READY');if(src.schedule.sportsbook_inputs_used===true||src.priors.sportsbook_inputs_used===true)blocked.push('Market contamination in football inputs');const games={};if(!blocked.length)for(const [id,g] of Object.entries(src.schedule.games||{})){if(!rerun&&learned&&Date.parse(g.event_start)<=Date.now()){const frozen=previous.games?.[id];if(!frozen||frozen.home_team!==g.home_team||frozen.away_team!==g.away_team){blocked.push(`${id}: no original pregame forecast to preserve`);continue;}games[id]=frozen;continue;}let update=learned?.games[id];if(rerun&&update&&update.model_version!==NO_REST_VERSION)update=removeRestFromForecast(read('data/probability/generated/game-scoring-model-2026.json'),update);if(learned&&(!update||update.home_team!==g.home_team||update.away_team!==g.away_team||update.event_start!==g.event_start))throw Error(`Missing or mismatched learned forecast ${id}`);const q=project(id,g,src.priors,update);if(q.blocked)blocked.push(`${id}: ${q.blocked}`);else games[id]={...q,personnel_context:matchupPersonnel(self?null:personnel,g,src.schedule.week),behavior_learning_context:{numeric_authority:0,status:'OBSERVATION',player_history_source:'data/market/issued-pick-results-2026.json#football_learning',state:Object.fromEntries(Object.entries(behaviorState(self?[]:learning?.observations||[],{season:src.schedule.season,week:src.schedule.week,asOf:learningAsOf,regimeEvents:self?[]:learning?.regime_events||[]})).filter(([,state])=>state.entity_type==='team'&&[g.home_team,g.away_team].map(t=>({LA:'LAR',WAS:'WSH',JAC:'JAX'}[t]||t)).includes(state.team))),as_of:learningAsOf}};}if(self){const q=games['2026-W1-GB-CHI'];if(!q)blocked.push('self-test game missing');else {const s=q.model.home_win_probability+q.model.away_win_probability+q.model.tie_probability;if(Math.abs(s-1)>1e-5)blocked.push('self-test probabilities do not sum to 1');if(q.model.model_home_spread!==-q.model.home_minus_away_margin)blocked.push('spread sign convention drift');}}
if(self){
  const game=games['2026-W1-GB-CHI'];
  const replay=simulateGameDistribution('2026-W1-GB-CHI',game);
  const homeWins=replay.filter(d=>d.home>d.away).length/replay.length;
  const awayWins=replay.filter(d=>d.away>d.home).length/replay.length;
  if(Math.abs(homeWins-game.model.home_win_probability)>1e-6||Math.abs(awayWins-game.model.away_win_probability)>1e-6)blocked.push('Projection and betting simulations disagree');
  const symmetric={...src.priors,teams:{CHI:{shrunk_offense:23,shrunk_defense_allowed:23},GB:{shrunk_offense:23,shrunk_defense_allowed:23}}};
  const neutral=project('neutral-test',{...src.schedule.games['2026-W1-GB-CHI'],neutral_site:true},symmetric);
  if(neutral.model.home_score_mean!==neutral.model.away_score_mean||neutral.home_field_advantage_applied!==0)blocked.push('Neutral site received home field advantage');
}
const out={schema_version:'1.0.0',season:2026,week:src.schedule.week??null,status:blocked.length?'BLOCKED':Object.keys(games).length?'SHADOW_ONLY':'AWAITING_VERIFIED_WEEKLY_SCHEDULE',mode:'SHADOW_ONLY',actionable:false,sportsbook_inputs_used:false,generated_at:new Date().toISOString(),games};const report={generated_at:out.generated_at,result:blocked.length?'BLOCKED':'PASS',game_count:Object.keys(games).length,mode:'SHADOW_ONLY',actionable:false,sportsbook_inputs_used:false,blocked,safeguards:contract.locked_rules};write(rerun?'guardrails/all-game-rerun-projection-report.json':'guardrails/weekly-game-projection-report.json',report);if(!self)write(rerun?'data/probability/generated/all-game-rerun-projections-2026.json':'data/probability/generated/weekly-game-projections-2026.json',rerun?{...out,rerun:true,source_generated_at:learned.generated_at,notice:'Recalculated with saved inputs. Not an original pregame prediction or a live betting recommendation.'}:out);console.log(JSON.stringify(report,null,2));if(blocked.length)process.exit(1);
