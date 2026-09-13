import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),JSON.stringify(x,null,2)+'\n');};
const asTime=x=>{const n=new Date(x).getTime();return Number.isFinite(n)?n:null;};
const sha=s=>crypto.createHash('sha256').update(s).digest('hex').slice(0,24);

export function capturePredictions({board,schedule,ledger,now=new Date()}={}){
  const games=schedule?.games||{};
  const existing=Array.isArray(ledger?.predictions)?ledger.predictions:[];
  const keys=new Set(existing.map(x=>x.freeze_key).filter(Boolean));
  const added=[];
  for(const p of board?.ranked_picks||[]){
    if(String(p.decision||'').toUpperCase()!=='PICK') continue;
    const g=games[p.game_id];
    const eventStart=p.event_start||g?.event_start;
    const startMs=asTime(eventStart), predMs=asTime(p.captured_at||board.generated_at);
    if(startMs==null||predMs==null||predMs>=startMs||now.getTime()>=startMs) continue;
    const player=p.player||p.entity_name||null;
    const stat=p.stat||p.player_stat||null;
    const freezeKey=[p.entity_type||'GAME',p.game_id||'',p.market_type||'',player||'',stat||'',p.selection||''].join('|');
    if(keys.has(freezeKey)) continue;
    const model=Number(p.model_conditional_win_probability??p.model_probability);
    const market=Number(p.no_vig_market_probability??p.market_probability);
    const odds=Number(p.offered_odds);
    if(!Number.isFinite(model)||!Number.isFinite(market)||!Number.isFinite(odds)) continue;
    const row={
      prediction_id:`BET-${sha(freezeKey)}`,
      freeze_key:freezeKey,
      season:Number(board.season||schedule.season||2026),
      week:Number(p.week||board.week||schedule.week),
      entity_type:p.entity_type||'GAME',
      game_id:p.game_id,
      matchup:p.matchup||null,
      player,
      stat,
      market_type:p.market_type,
      selection:p.selection,
      line:p.line??null,
      offered_odds:odds,
      book:p.book||null,
      model_probability:model,
      market_probability:market,
      probability_edge:Number.isFinite(Number(p.probability_edge))?Number(p.probability_edge):null,
      expected_value:Number.isFinite(Number(p.expected_value))?Number(p.expected_value):null,
      confidence:p.confidence||null,
      prediction_timestamp:new Date(predMs).toISOString(),
      event_start:new Date(startMs).toISOString(),
      split:'HOLDOUT',
      frozen:true,
      stake_units:1,
      source_opportunity_id:p.opportunity_id||null,
      source_layer:p.source_layer||null,
      source_board_generated_at:board.generated_at||null,
      captured_by:'weekly-betting-freeze-v1'
    };
    existing.push(row);added.push(row);keys.add(freezeKey);
  }
  return {schema_version:'1.1.0',season:Number(board?.season||schedule?.season||2026),status:existing.length?'LIVE_HOLDOUT_CAPTURED':'AWAITING_LIVE_PREDICTIONS',generated_at:new Date().toISOString(),predictions:existing,added};
}

const selfTest=process.argv.includes('--self-test');
if(selfTest){
  const board={season:2026,week:1,generated_at:'2026-09-13T15:00:00Z',ranked_picks:[{opportunity_id:'X',week:1,entity_type:'GAME',game_id:'G',market_type:'TOTAL',selection:'OVER 40',offered_odds:-110,model_conditional_win_probability:.6,no_vig_market_probability:.5,probability_edge:.1,decision:'PICK'}]};
  const schedule={season:2026,week:1,games:{G:{event_start:'2026-09-13T20:00:00Z'}}};
  const a=capturePredictions({board,schedule,ledger:{predictions:[]},now:new Date('2026-09-13T16:00:00Z')});
  const b=capturePredictions({board,schedule,ledger:a,now:new Date('2026-09-13T16:30:00Z')});
  const failures=[];
  if(a.added.length!==1)failures.push('expected one pregame capture');
  if(b.added.length!==0)failures.push('capture must be idempotent');
  if(a.predictions[0]?.frozen!==true||a.predictions[0]?.split!=='HOLDOUT')failures.push('capture must be frozen HOLDOUT');
  const late=capturePredictions({board,schedule,ledger:{predictions:[]},now:new Date('2026-09-13T21:00:00Z')});
  if(late.added.length)failures.push('post-kickoff capture prohibited');
  console.log(JSON.stringify({result:failures.length?'BLOCKED':'PASS',failures},null,2));if(failures.length)process.exit(1);
}else{
  const board=read('data/market/unified-opportunities-2026.json');
  const schedule=read('data/calibration/weekly-event-schedule-2026.json');
  const p='data/calibration/weekly-predictions-2026.json';
  const ledger=fs.existsSync(path.join(root,p))?read(p):{schema_version:'1.0.0',season:2026,predictions:[]};
  const out=capturePredictions({board,schedule,ledger});
  const added=out.added.length;delete out.added;write(p,out);
  console.log(JSON.stringify({status:out.status,total:out.predictions.length,added},null,2));
}
