import fs from 'node:fs';

const read=(p)=>JSON.parse(fs.readFileSync(p,'utf8'));
const shards=fs.readdirSync('.').filter(f=>/^players\d+\.json$/.test(f)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
const players=shards.flatMap(read);
if(players.length!==162||new Set(players.map(p=>p.n)).size!==162) throw new Error('Step 3G requires exactly 162 unique players');
const rules=read('data/sources/ui-step3a-feature-rule-contracts-2026.json');
const contract=read('data/sources/step3g-core-features-2026.json');
const weeklyProj=read('data/probability/weekly-projection-inputs-2026.json');
const weeklyCtx=read('data/probability/weekly-football-context-inputs-2026.json');
const gameProj=read('data/probability/generated/weekly-game-projections-2026.json');
const gameRec=read('data/market/weekly-game-market-recommendations-2026.json');

const now=new Date().toISOString();
const finite=(x)=>Number.isFinite(Number(x));
const footballFields=['mp','ce','r','e','a','rl','su'];

// Season-long features are deliberately conservative. The Step 3A contract requires OOS cohort
// validation before breakout/bust cohort similarity receives meaningful authority. That validation
// is not silently replaced by thresholds here.
const seasonPlayers=players.map(p=>{
  const complete=footballFields.every(k=>finite(p[k]));
  const evidence=[];
  if(p.projection_context?.history_seasons!=null) evidence.push(`history_seasons:${p.projection_context.history_seasons}`);
  if(p.st && p.st!=='PASS') evidence.push(`status:${p.st}`);
  if(p.ns) evidence.push(`source:${p.ns}`);
  evidence.push(`ceiling:${p.ce}`,`role:${p.r}`,`environment:${p.e}`,`availability:${p.a}`,`reliability:${p.rl}`,`sustainability:${p.su}`);
  const priorPresent=Number(p.projection_context?.history_seasons||0)>0 || /rookie/i.test(String(p.nm||''));
  const breakoutLabel=complete&&priorPresent?'WATCH':'NO_CALL';
  const footballDownsideLabel=complete?'WATCH':'NO_CALL';
  const downstreamOverpriced=(p.s6==='OVERPRICED'||p.px==='FADE');
  const downstreamAvoid=(p.s7==='AVOID');
  return {
    player:p.n,position:p.p,team:p.t,
    season_projection:finite(p.mp)?Number(p.mp):null,
    football_inputs_complete:complete,
    breakout:{label:breakoutLabel,reason:breakoutLabel==='WATCH'?'Football profile is available, but the required out-of-sample breakout-cohort promotion gate is not yet cleared; no arbitrary breakout/sleeper threshold is used.':'Required season-long football inputs or prior are incomplete.',market_input_used:false,automatic_rank_write:false},
    downside:{football_label:footballDownsideLabel,reason:footballDownsideLabel==='WATCH'?'Football downside context is available, but a new BUST_CANDIDATE is not manufactured without validated downside-cohort evidence.':'Required season-long football inputs are incomplete.',market_input_used:false},
    draft_side_context:{overpriced:downstreamOverpriced,avoid:downstreamAvoid,existing_s6:p.s6??null,existing_s7:p.s7??null,existing_price_label:p.px??null,adp:p.ad??null,note:'Existing downstream draft/market context is preserved for display only and does not alter the football projection or football-only label.'},
    football_value:{expected_points:finite(p.mp)?Number(p.mp):null,q10:null,q50:null,q90:null,safety_components:{availability:finite(p.a)?Number(p.a):null,reliability:finite(p.rl)?Number(p.rl):null,sustainability:finite(p.su)?Number(p.su):null},lambda:null,rho:null,gamma:null,score:null,numeric_authority:0,reason:'Step 3G does not invent unvalidated lambda/rho/gamma coefficients.'},
    evidence,provenance:{player_shards:true,projection_context:Boolean(p.projection_context),current_status_source:p.ns??null},live_projection_movement:0,live_rank_movement:0
  };
});

const wp=weeklyProj.players||{}; const wc=weeklyCtx.players||{};
const weeklyReady=weeklyProj.status!=='AWAITING_WEEKLY_PROJECTIONS'&&weeklyCtx.status!=='AWAITING_LIVE_WEEKLY_CONTEXT'&&Object.keys(wp).length>0&&Object.keys(wc).length>0;
const sitStart=players.map(p=>{
  const proj=wp[p.n]; const ctx=wc[p.n];
  if(!weeklyReady||!proj||!ctx) return {player:p.n,position:p.p,team:p.t,label:'NO_CALL',reason:'Weekly projection/context prerequisites are not populated and missing data is not converted to zero.',week:weeklyProj.week??weeklyCtx.week??null,provenance:{projection_status:weeklyProj.status,context_status:weeklyCtx.status}};
  const expectedActive=ctx.expected_active;
  const dist=proj.distribution||proj.weekly_distribution||null;
  if(expectedActive!==true||!dist) return {player:p.n,position:p.p,team:p.t,label:'NO_CALL',reason:'Expected-active confirmation or weekly distribution prerequisite is missing.',week:weeklyProj.week??null,provenance:{projection_status:weeklyProj.status,context_status:weeklyCtx.status}};
  // No unsupported threshold fallback: a populated upstream decision may be consumed if it uses an allowed label.
  const upstream=proj.sit_start_label||proj.decision_label||null;
  const allowed=new Set(rules.sit_start.labels);
  return {player:p.n,position:p.p,team:p.t,label:allowed.has(upstream)?upstream:'NO_CALL',reason:allowed.has(upstream)?'Consumed validated upstream weekly decision label.':'Weekly prerequisites exist but no validated replacement-line decision label is available; no threshold was invented.',week:weeklyProj.week??null,provenance:{projection_status:weeklyProj.status,context_status:weeklyCtx.status}};
});

const recGames=gameRec.games||{}; const projGames=gameProj.games||{};
const gameKeys=[...new Set([...Object.keys(recGames),...Object.keys(projGames)])].sort();
const gameReady=gameRec.status!=='AWAITING_GAME_MARKET_SNAPSHOTS'&&gameProj.status!=='AWAITING_VERIFIED_WEEKLY_SCHEDULE'&&gameKeys.length>0;
const games=gameKeys.map(id=>{
  const r=recGames[id]||{}; const p=projGames[id]||{};
  const validPick=String(r.recommendation||r.label||r.decision||'').toUpperCase()==='PICK';
  const edge=Number(r.probability_edge); const ev=Number(r.expected_value); const winp=Number(r.model_conditional_win_probability);
  let gotw='PASS';
  if(gameReady&&validPick&&Number.isFinite(edge)&&Number.isFinite(ev)&&Number.isFinite(winp)&&winp>=0.52){
    if(edge>=0.08&&ev>=0.08) gotw='GAME_OF_THE_WEEK';
    else if(edge>=0.05&&ev>=0.04) gotw='STRONG_VALUE';
    else if(edge>=0.03&&ev>=0.02) gotw='LEAN_VALUE';
  }
  const favoriteGap=Number(r.favorite_no_vig_probability)-Number(p.favorite_win_probability??p.model_favorite_win_probability);
  const signals=Array.isArray(r.trap_supporting_signals)?[...new Set(r.trap_supporting_signals)]:[];
  let trap='NO_CALL';
  if(gameReady&&Number.isFinite(favoriteGap)){
    if(favoriteGap>=0.05&&signals.length>=2) trap='TRAP_ALERT';
    else if((favoriteGap>=0.05&&signals.length>=1)||signals.length>=2) trap='TRAP_WATCH';
    else trap='NO_TRAP';
  }
  return {game_id:id,week:gameRec.week??gameProj.week??null,games_of_week:gotw,trap_game:trap,valid_existing_pick:validPick,probability_edge:Number.isFinite(edge)?edge:null,expected_value:Number.isFinite(ev)?ev:null,supporting_signals:signals,trap_creates_opponent_bet:false,football_projection_mutation:false};
});

const historicalCandidates=rules.historical_situational_indicators.candidate_examples.map(id=>({
  indicator:id,status:'AWAITING_QUALIFYING_HISTORICAL_SAMPLE',raw_games:null,effective_games:null,distinct_seasons:null,out_of_sample_validated:false,directional_replication:false,shrinkage_applied:false,display_eligible:false,model_promotion_eligible:false,projection_weight:0,margin_adjustment_points:0,reason:'No Step 3G qualifying controlled historical sample artifact is present; association is not fabricated and receives zero model weight.'
}));

fs.mkdirSync('data/features',{recursive:true}); fs.mkdirSync('guardrails',{recursive:true});
const seasonOut={schema_version:'1.0.0',generated_at:now,step:'STEP_3G_ACTUAL_CORE_FEATURES',feature_group:'SEASON_LONG_PLAYER_FEATURES',status:'EXECUTABLE_CONSERVATIVE_OUTPUT',players_checked:162,sportsbook_inputs_used:false,adp_used_in_football_labels:false,live_projection_movement:0,live_rank_movement:0,players:seasonPlayers};
const weeklyOut={schema_version:'1.0.0',generated_at:now,step:'STEP_3G_ACTUAL_CORE_FEATURES',feature:'SIT_START',status:weeklyReady?'INPUTS_PRESENT':'AWAITING_WEEKLY_PREREQUISITES',week:weeklyProj.week??weeklyCtx.week??null,players:sitStart};
const gameOut={schema_version:'1.0.0',generated_at:now,step:'STEP_3G_ACTUAL_CORE_FEATURES',status:gameReady?'INPUTS_PRESENT':'AWAITING_GAME_PREREQUISITES',week:gameRec.week??gameProj.week??null,games};
const histOut={schema_version:'1.0.0',generated_at:now,step:'STEP_3G_ACTUAL_CORE_FEATURES',feature:'HISTORICAL_SITUATIONAL_INDICATORS',status:'ENGINE_READY_AWAITING_QUALIFYING_SAMPLE',promotion_policy:contract.historical_situational_indicators,indicators:historicalCandidates};
fs.writeFileSync('data/features/season-long-player-features-2026.json',JSON.stringify(seasonOut,null,2)+'\n');
fs.writeFileSync('data/features/weekly-sit-start-2026.json',JSON.stringify(weeklyOut,null,2)+'\n');
fs.writeFileSync('data/features/weekly-game-features-2026.json',JSON.stringify(gameOut,null,2)+'\n');
fs.writeFileSync('data/features/historical-situational-indicators-2026.json',JSON.stringify(histOut,null,2)+'\n');
const summary={generated_at:now,step:'STEP_3G_ACTUAL_CORE_FEATURES',status:'ENGINES_IMPLEMENTED',features:{sit_start:{rows:sitStart.length,non_no_call:sitStart.filter(x=>x.label!=='NO_CALL').length,input_state:weeklyOut.status},sleepers_breakouts:{rows:seasonPlayers.length,breakout_candidates:seasonPlayers.filter(x=>x.breakout.label==='BREAKOUT_CANDIDATE').length,sleepers:seasonPlayers.filter(x=>x.breakout.label==='SLEEPER').length,watch:seasonPlayers.filter(x=>x.breakout.label==='WATCH').length},avoid_busts:{rows:seasonPlayers.length,new_bust_candidates:seasonPlayers.filter(x=>x.downside.football_label==='BUST_CANDIDATE').length,existing_downstream_avoid:seasonPlayers.filter(x=>x.draft_side_context.avoid).length,existing_downstream_overpriced:seasonPlayers.filter(x=>x.draft_side_context.overpriced).length},games_of_the_week:{games:games.length,featured:games.filter(x=>x.games_of_week!=='PASS').length,input_state:gameOut.status},trap_games:{games:games.length,alerts:games.filter(x=>x.trap_game==='TRAP_ALERT').length,watches:games.filter(x=>x.trap_game==='TRAP_WATCH').length,input_state:gameOut.status},historical_situational_indicators:{candidates:historicalCandidates.length,promoted:historicalCandidates.filter(x=>x.model_promotion_eligible).length,status:histOut.status}},live_projection_movement:0,live_rank_movement:0,next_step:'STEP_3H_FULL_STEP_3_QA_AFTER_STEP_3G_VALIDATION'};
fs.writeFileSync('guardrails/step3g-core-features-summary.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
