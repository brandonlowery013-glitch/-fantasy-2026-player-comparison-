import fs from 'node:fs';
import {fitSpread,predictSpread,spreadFeatures} from '../workers/betting-splits/lib/spread-model.mjs';
import {fitResidual} from '../workers/betting-splits/lib/spread-learning.mjs';
import {simulateGameDistribution,outcomeProbabilities,evaluateTwoWay,recommendation} from '../lib/game-market-probability.mjs';

const source=process.argv[2];
if(!source)throw Error('Pass the directory containing the verified current-week model rebuild');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const seed=read('workers/betting-splits/model/spread-training-2026.json');
const projections=read(source+'/data/probability/generated/weekly-game-projections-2026.json');
const schedule=read(source+'/data/calibration/weekly-event-schedule-2026.json');
const ledger=read(source+'/data/market/postgame-model-learning-2026.json');
const policy=read(source+'/data/sources/game-market-recommendation-layer-2026.json').recommendation_policy;
if(projections.week!==9||schedule.week!==9)throw Error('Week 9 model and schedule required');
const names={football:'Football scoring',calibration:'Line-aware calibration',learning:'Calibration + learning'};
const scores=Object.fromEntries(Object.keys(names).map(k=>[k,[]]));
const predictions=[];
for(const week of [...new Set(seed.rows.map(r=>r.week))].sort((a,b)=>a-b)){
 if(week<2)continue;
 const fit=fitSpread(seed.rows,week),plain={...fit,residual:fitResidual([])};
 for(const r of seed.rows.filter(r=>r.week===week&&r.outcome!==null)){
  const game={...r,game_id:r.game_id},quote={market:{home_spread:r.home_line,home_spread_price:r.home_odds,away_spread_price:r.away_odds},captured_at:r.decision_at};
  const f=r.learning_features||{};
  let ps;
  try{ps={football:r.football_probability,calibration:predictSpread(plain,f,game,quote).probability,learning:predictSpread(fit,f,game,quote).probability};}catch{continue;}
  if(!Object.values(ps).every(p=>Number.isFinite(p)&&p>0&&p<1))continue;
  for(const [k,p]of Object.entries(ps))scores[k].push({week,game_id:r.game_id,p,y:r.outcome});
 }
}
const ranking=Object.entries(scores).map(([id,rs])=>({id,name:names[id],games:rs.length,wins:rs.filter(r=>(r.p>.5?1:0)===r.y).length,losses:rs.filter(r=>(r.p>.5?1:0)!==r.y).length,brier:rs.reduce((s,r)=>s+(r.p-r.y)**2,0)/rs.length,test_weeks:[...new Set(rs.map(r=>r.week))]})).sort((a,b)=>a.brier-b.brier).map((r,i)=>({...r,rank:i+1}));
if(!ranking.every(r=>r.games>0&&r.games===ranking[0].games))throw Error('Unequal comparison sample');
const response=await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=2026&seasontype=2&week=9',{signal:AbortSignal.timeout(30000)});
if(!response.ok)throw Error('Current scoreboard unavailable');
const board=await response.json(),now=new Date().toISOString(),alias=t=>({LAR:'LA',WSH:'WAS'}[t]||t);
const fit=fitSpread(seed.rows,9),plain={...fit,residual:fitResidual([])};
for(const [id,s]of Object.entries(schedule.games)){
 const row={game_id:id,away:s.away_team,home:s.home_team,kickoff:s.event_start,variants:{}};
 if(Date.parse(s.event_start)<=Date.parse(now)){row.status=s.completed?'FINAL':'STARTED';predictions.push(row);continue;}
 const g=projections.games[id],event=(board.events||[]).find(e=>String(e.id)===String(s.event_id)),o=event?.competitions?.[0]?.odds?.[0];
 if(!g||!o){row.status='WAIT';row.reason=!g?'No valid pregame forecast':'No current two-sided quote';predictions.push(row);continue;}
 const hs=o.pointSpread?.home?.close,as=o.pointSpread?.away?.close;
 const line=Number(hs?.line),hp=Number(hs?.odds),ap=Number(as?.odds);
 if(!hs||!as||![line,hp,ap].every(Number.isFinite)){row.status='WAIT';row.reason='Incomplete exact spread quote';predictions.push(row);continue;}
 const quote={book:o.provider?.name||'ESPN listed book',captured_at:now,market:{home_spread:line,home_spread_price:hp,away_spread_price:ap}};
 const game={...g,game_id:id,kickoff:g.event_start,football_projection:g.model};
 const features=spreadFeatures(game,ledger,9,now);
 const draws=simulateGameDistribution(id,g).map(d=>d.home-d.away);
 const probs={football:outcomeProbabilities(draws,-line,'OVER').conditional_win_probability,calibration:predictSpread(plain,features,game,quote).probability,learning:predictSpread(fit,features,game,quote).probability};
 row.status='PREVIEW';row.quote=quote;row.projected_score={away:g.model.away_score_mean,home:g.model.home_score_mean};
 for(const [k,p]of Object.entries(probs)){
  const h=k==='football'?outcomeProbabilities(draws,-line,'OVER'):{win_probability:p,push_probability:0,loss_probability:1-p,conditional_win_probability:p};
  const a=k==='football'?outcomeProbabilities(draws,-line,'UNDER'):{win_probability:1-p,push_probability:0,loss_probability:p,conditional_win_probability:1-p};
  const ev=evaluateTwoWay({sideA:h,sideB:a,sideAOdds:hp,sideBOdds:ap,thresholds:policy});
  const label=(t,l)=>t+' '+(l>0?'+':'')+l;
  const rec=recommendation(ev,policy,{side_a:label(row.home,line),side_b:label(row.away,-line)});
  row.variants[k]={direction:p>.5?label(row.home,line):label(row.away,-line),cover_probability:Math.max(p,1-p),...rec,integer_line_conditional:k!=='football'&&Number.isInteger(line)};
 }
 row.agreement=Math.max(...Object.values(row.variants).map(v=>Object.values(row.variants).filter(w=>w.direction===v.direction).length));
 predictions.push(row);
}
const output={season:2026,week:9,generated_at:now,status:'RESEARCH_PREVIEW',ranking_rule:'Lowest common-sample walk-forward Brier score; direction record is secondary',ranking,training_through_week:seed.through_week,limitations:['Three recoverable variants, not proof that these were the original user-selected top three.','Historical sample is reconstructed; no prospective profitability claim.','Current scoring uses the requested no-rest ablation, which differs from older frozen football forecasts.','No live model selection, thresholds or wagering behavior is changed.','Calibration models use conditional non-push probabilities at integer spreads; their EV is conditional on no push.'],games:predictions};
fs.mkdirSync('frontend/cloudflare/data',{recursive:true});fs.writeFileSync('frontend/cloudflare/data/week9-variant-preview.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({ranking,games:predictions.map(g=>({game:g.game_id,status:g.status,variants:g.variants,agreement:g.agreement}))},null,2));
