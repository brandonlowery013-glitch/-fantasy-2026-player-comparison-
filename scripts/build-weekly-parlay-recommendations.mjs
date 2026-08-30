import fs from 'node:fs';
import path from 'node:path';
import {generateModelParlays} from './parlay-engine-2026.mjs';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const exists=p=>fs.existsSync(path.join(root,p));
const write=(p,x)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),JSON.stringify(x,null,2)+'\n');};
const self=process.argv.includes('--self-test');

function build({schedule,gameRecs,propRecs,propLedger}){
  const blocked=[],review_required=[],legs=[];
  const week=schedule?.week??null;
  const inRange=Number.isInteger(Number(week))&&Number(week)>=1&&Number(week)<=18;
  if(week!=null&&!inRange)blocked.push(`schedule week ${week} outside 1-18`);
  if(week!=null&&gameRecs?.week!=null&&Number(gameRecs.week)!==Number(week))blocked.push(`game recommendation week ${gameRecs.week} != schedule week ${week}`);
  if(week!=null&&propRecs?.week!=null&&Number(propRecs.week)!==Number(week))blocked.push(`player prop week ${propRecs.week} != schedule week ${week}`);
  const propSnapshotById=new Map((propLedger?.snapshots||[]).map(x=>[x.snapshot_id,x]));

  if(week!=null&&!blocked.length){
    for(const [eventId,g] of Object.entries(gameRecs?.games||{})){
      if(Number(g.week)!==Number(week))continue;
      const cur=g.current_recommendations;
      if(!cur)continue;
      const ev=(g.snapshot_evaluations||[]).find(x=>x.snapshot_id===cur.snapshot_id);
      if(!ev)continue;
      for(const marketType of ['spread','total','moneyline']){
        const rec=cur[marketType],market=ev.markets?.[marketType];
        if(rec?.decision!=='PICK'||!market)continue;
        const side=[market.side_a,market.side_b].filter(Boolean).sort((a,b)=>Number(b.expected_value)-Number(a.expected_value))[0];
        if(!side)continue;
        legs.push({
          leg_id:`${eventId}:${marketType}:${cur.snapshot_id}:${String(rec.selection).replace(/\s+/g,'_')}`,
          event_id:eventId,
          week:Number(week),
          market_type:marketType,
          side:rec.selection,
          sportsbook:cur.book,
          american_odds:Number(side.offered_odds),
          model_win_probability:Number(side.conditional_win_probability),
          probability_edge:Number(side.probability_edge),
          expected_value:Number(side.expected_value),
          observed_at:cur.captured_at,
          standalone_approved:true,
          label:'PICK',
          source_type:'GAME'
        });
      }
    }

    for(const [player,p] of Object.entries(propRecs?.players||{})){
      if(Number(p?.weekly?.week)!==Number(week))continue;
      for(const [stat,e] of Object.entries(p?.weekly?.current_by_stat||{})){
        if(e?.recommendation?.decision!=='PICK')continue;
        const raw=propSnapshotById.get(e.snapshot_id);
        const eventId=raw?.event_id||raw?.game_id||null;
        if(!eventId){review_required.push({type:'PLAYER_PROP_EVENT_ID_MISSING',player,stat,snapshot_id:e.snapshot_id});continue;}
        const side=(e.sides||[]).find(x=>x.side===e.recommendation.side);
        if(!side)continue;
        legs.push({
          leg_id:`${eventId}:player_prop:${e.snapshot_id}:${player.replace(/\s+/g,'_')}:${stat}:${e.recommendation.side}`,
          event_id:String(eventId),
          week:Number(week),
          market_type:'player_prop',
          side:`${player} ${e.recommendation.side} ${e.line} ${stat}`,
          player,
          stat,
          line:Number(e.line),
          sportsbook:e.book,
          american_odds:Number(side.offered_odds),
          model_win_probability:Number(side.model_conditional_win_probability??side.model_win_probability),
          probability_edge:Number(side.probability_edge),
          expected_value:Number(side.expected_value),
          observed_at:e.captured_at,
          standalone_approved:true,
          label:'PICK',
          source_type:'PLAYER_PROP'
        });
      }
    }
  }

  const model_picks=week!=null&&!blocked.length?generateModelParlays(legs,{correlations:[],limit:50}):[];
  const status=blocked.length?'BLOCKED':week==null?'WAITING_FOR_CURRENT_WEEK':'READY';
  return {schema_version:'1.0.0',season:2026,week:week==null?null:Number(week),status,mode:'SHADOW_ONLY',actionable:false,generated_at:new Date().toISOString(),eligible_leg_count:legs.length,eligible_legs:legs,model_picks,review_required,blocked};
}

function synthetic(){
  const schedule={season:2026,week:2,games:{g1:{},g2:{}}};
  const mk=(id,week,team)=>({week,away_team:'A',home_team:team,current_recommendations:{snapshot_id:'s',captured_at:'2026-09-15T12:00:00Z',book:'BOOK',spread:{decision:'PICK',selection:`${team} -3`},total:{decision:'PASS'},moneyline:{decision:'PASS'}},snapshot_evaluations:[{snapshot_id:'s',markets:{spread:{side_a:{expected_value:.1,probability_edge:.08,conditional_win_probability:.61,offered_odds:-110},side_b:{expected_value:-.1,probability_edge:-.08,conditional_win_probability:.39,offered_odds:-110}}}}]});
  return {schedule,gameRecs:{week:2,games:{g1:mk('g1',2,'H1'),g2:mk('g2',2,'H2')}},propRecs:{week:2,players:{}},propLedger:{snapshots:[]}};
}

const src=self?synthetic():{
  schedule:read('data/calibration/weekly-event-schedule-2026.json'),
  gameRecs:read('data/market/weekly-game-market-recommendations-2026.json'),
  propRecs:read('data/market/player-prop-recommendations-2026.json'),
  propLedger:exists('data/market/player-prop-market-snapshots-2026.json')?read('data/market/player-prop-market-snapshots-2026.json'):{snapshots:[]}
};
const out=build(src);
if(self){
  if(out.status!=='READY')throw new Error('self-test should be READY');
  if(out.eligible_leg_count!==2)throw new Error(`self-test expected 2 eligible legs, got ${out.eligible_leg_count}`);
  if(!out.model_picks.length)throw new Error('self-test expected at least one cross-game parlay');
  const stale=build({...src,gameRecs:{...src.gameRecs,week:1}});
  if(stale.status!=='BLOCKED'||stale.model_picks.length)throw new Error('week mismatch must block stale parlay output');
}
if(!self)write('data/market/parlay-recommendations-2026.json',out);
console.log(JSON.stringify({result:out.blocked.length?'BLOCKED':'PASS',week:out.week,status:out.status,eligible_leg_count:out.eligible_leg_count,model_pick_count:out.model_picks.length,review_required:out.review_required.length,blocked:out.blocked},null,2));
if(out.blocked.length)process.exit(1);
