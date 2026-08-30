import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),JSON.stringify(x,null,2)+'\n');};
const self=process.argv.includes('--self-test');

const asArrayGames=x=>Array.isArray(x?.games)?x.games:Object.entries(x?.games||{}).map(([event_id,g])=>({event_id,...g}));
const pickList=g=>Object.entries(g?.current_recommendations||{}).filter(([,r])=>r?.decision==='PICK').map(([market,r])=>({market,selection:r.selection,confidence:r.confidence,expected_value:r.expected_value,probability_edge:r.probability_edge}));

function build({schedule,gameRecs,propRecs,parlays}){
  const week=schedule?.week??null,blocked=[];
  const hasGameOutput=Object.keys(gameRecs?.games||{}).length>0;
  const hasPropOutput=Object.values(propRecs?.players||{}).some(p=>Object.keys(p?.weekly?.current_by_stat||{}).length>0);
  if(week!=null&&gameRecs?.week!=null&&Number(gameRecs.week)!==Number(week)&&hasGameOutput)blocked.push(`game recommendation week ${gameRecs.week} != active week ${week}`);
  if(week!=null&&propRecs?.week!=null&&Number(propRecs.week)!==Number(week)&&hasPropOutput)blocked.push(`prop recommendation week ${propRecs.week} != active week ${week}`);
  if(week!=null&&parlays?.week!=null&&Number(parlays.week)!==Number(week)&&(parlays?.eligible_leg_count||parlays?.model_picks?.length))blocked.push(`parlay week ${parlays.week} != active week ${week}`);

  const empty=status=>({schema_version:'1.1.0',season:2026,week:week==null?null:Number(week),status,generated_at:new Date().toISOString(),games:[],props:[],parlays:[],eligible_legs:[],correlations:[],blocked:status==='WAITING_FOR_CURRENT_WEEK_OUTPUTS'?blocked:[]});
  if(week==null)return empty('WAITING_FOR_CURRENT_WEEK');
  if(blocked.length)return empty('WAITING_FOR_CURRENT_WEEK_OUTPUTS');

  const propRows=[];
  for(const [player,p] of Object.entries(propRecs?.players||{})){
    if(Number(p?.weekly?.week)!==Number(week))continue;
    for(const [stat,e] of Object.entries(p?.weekly?.current_by_stat||{})){
      if(e?.recommendation?.decision!=='PICK')continue;
      propRows.push({player,position:p.position,team:p.team,stat,line:e.line,side:e.recommendation.side,book:e.book,odds:(e.sides||[]).find(x=>x.side===e.recommendation.side)?.offered_odds??null,confidence:e.recommendation.confidence,expected_value:e.recommendation.expected_value,probability_edge:e.recommendation.probability_edge,snapshot_id:e.snapshot_id,captured_at:e.captured_at,event_id:null});
    }
  }
  const eligibleLegs=(parlays?.eligible_legs||[]).filter(x=>Number(x.week)===Number(week)&&x?.standalone_approved===true&&x?.label==='PICK').map(x=>({...x}));
  const legEvent=new Map(eligibleLegs.filter(x=>x.source_type==='PLAYER_PROP').map(x=>[`${x.player}|${x.stat}|${x.line}|${x.sportsbook}`,x.event_id]));
  for(const p of propRows)p.event_id=legEvent.get(`${p.player}|${p.stat}|${p.line}|${p.book}`)||null;
  propRows.sort((a,b)=>Number(b.expected_value)-Number(a.expected_value));

  const parlayRows=(parlays?.model_picks||[]).map((x,i)=>({ticket_id:`W${week}-P${i+1}`,...x}));
  const scheduleGames=asArrayGames(schedule),games=[];
  for(const sg of scheduleGames){
    const eventId=String(sg.event_id||sg.game_id||sg.id||'');
    const gr=gameRecs?.games?.[eventId];
    const current=gr?.current_recommendations||null;
    const snap=current?(gr.snapshot_evaluations||[]).find(x=>x.snapshot_id===current.snapshot_id):null;
    const picks=gr?pickList(gr):[];
    const market=snap?.market||{};
    const bestEdge=picks.length?Math.max(...picks.map(x=>Number(x.probability_edge||0))):null;
    const eventProps=propRows.filter(x=>String(x.event_id)===eventId).slice(0,5);
    const eventParlays=parlayRows.filter(x=>(x.legs||[]).some(id=>String(id).startsWith(eventId+':'))).slice(0,3);
    games.push({
      ...sg,
      event_id:eventId,
      week:Number(week),
      spread:market.home_spread!=null?`${gr?.home_team||sg.home_team||sg.home} ${Number(market.home_spread)>0?'+':''}${market.home_spread}`:null,
      total:market.total??null,
      moneyline:market.home_moneyline!=null||market.away_moneyline!=null?`${gr?.away_team||sg.away_team||sg.away} ${market.away_moneyline??'—'} / ${gr?.home_team||sg.home_team||sg.home} ${market.home_moneyline??'—'}`:null,
      model_edge:bestEdge,
      model_pick:picks.length?picks.map(x=>`${x.market.toUpperCase()}: ${x.selection} (${x.confidence})`):null,
      win_probability:gr?.football_projection?.home_win_probability??null,
      total_pick:current?.total?.decision==='PICK'?current.total.selection:null,
      model_summary:picks.length?`${picks.length} standalone market${picks.length===1?'':'s'} clear the locked betting threshold at the current verified quote.`:'No current game market clears the locked betting threshold.',
      top_props:eventProps.map(x=>`${x.player} ${x.side} ${x.line} ${x.stat} (${x.book} ${x.odds??'—'})`),
      parlay_candidates:eventParlays.map(x=>`${x.leg_count}-leg ${x.category||'MODEL'} · ${x.grade} · EV ${(Number(x.parlay_expected_value||0)*100).toFixed(1)}%`)
    });
  }

  return {schema_version:'1.1.0',season:2026,week:Number(week),status:'READY',generated_at:new Date().toISOString(),games,props:propRows.slice(0,100),parlays:parlayRows,eligible_legs:eligibleLegs,correlations:[],blocked:[],provenance:{schedule_status:schedule.status||null,game_recommendation_status:gameRecs.status||null,prop_recommendation_status:propRecs.status||null,parlay_status:parlays.status||null,eligible_leg_source:'ALREADY_APPROVED_DOWNSTREAM_RECOMMENDATION',same_game_correlation_runtime:'BLOCK_UNTIL_VERIFIED_PAIR_CORRELATION_AVAILABLE'}};
}

function synthetic(){const leg=(id,event)=>({leg_id:id,event_id:event,week:3,market_type:'spread',side:'B -2.5',sportsbook:'BOOK',american_odds:-110,model_win_probability:.58,probability_edge:.05,expected_value:.08,observed_at:'2026-09-24T12:00:00Z',standalone_approved:true,label:'PICK',source_type:'GAME'});return {schedule:{season:2026,week:3,status:'VERIFIED',games:{g1:{away_team:'A',home_team:'B',status:'Scheduled'},g2:{away_team:'C',home_team:'D',status:'Scheduled'}}},gameRecs:{week:3,status:'SHADOW_ONLY',games:{g1:{week:3,away_team:'A',home_team:'B',football_projection:{home_win_probability:.57},current_recommendations:{snapshot_id:'s',spread:{decision:'PICK',selection:'B -2.5',confidence:'MODERATE',expected_value:.08,probability_edge:.05},total:{decision:'PASS'},moneyline:{decision:'PASS'}},snapshot_evaluations:[{snapshot_id:'s',market:{home_spread:-2.5,total:45.5,home_moneyline:-130,away_moneyline:110}}]}}},propRecs:{week:3,players:{}},parlays:{week:3,status:'READY',eligible_leg_count:2,eligible_legs:[leg('g1:spread:s:B_-2.5','g1'),leg('g2:spread:s:D_-1.5','g2')],model_picks:[]}};}

const src=self?synthetic():{schedule:read('data/calibration/weekly-event-schedule-2026.json'),gameRecs:read('data/market/weekly-game-market-recommendations-2026.json'),propRecs:read('data/market/player-prop-recommendations-2026.json'),parlays:read('data/market/parlay-recommendations-2026.json')};
const out=build(src);
if(self){
  if(out.status!=='READY'||out.week!==3||out.games.length!==2)throw new Error('self-test current-week feed failed');
  if(out.eligible_legs.length!==2||out.eligible_legs.some(x=>x.standalone_approved!==true||x.label!=='PICK'))throw new Error('self-test eligible-leg exposure failed');
  const stale=build({...src,gameRecs:{...src.gameRecs,week:2}});
  if(stale.status!=='WAITING_FOR_CURRENT_WEEK_OUTPUTS'||stale.games.length||stale.eligible_legs.length)throw new Error('self-test stale-week isolation failed');
}
if(!self)write('data/market/final-betting-ui-feed-2026.json',out);
console.log(JSON.stringify({result:out.blocked?.length?'BLOCKED':'PASS',week:out.week,status:out.status,games:out.games.length,props:out.props.length,parlays:out.parlays.length,eligible_legs:out.eligible_legs.length,blocked:out.blocked},null,2));
if(out.blocked?.length)process.exit(1);
