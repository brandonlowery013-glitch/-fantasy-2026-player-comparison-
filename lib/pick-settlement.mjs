import crypto from 'node:crypto';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const norm=x=>String(x||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const team=x=>({WAS:'WSH',LA:'LAR'}[x]||x);
const number=x=>x===null||x===undefined||String(x).trim()===''?null:Number(String(x).replace(/,/g,''));
const fields={passing:{YDS:'pass_yards',TD:'pass_tds'},rushing:{YDS:'rush_yards',TD:'rush_tds'},receiving:{YDS:'receiving_yards',REC:'receptions',TD:'receiving_tds'}};
export function finalResult(summary,event){
 const c=summary?.header?.competitions?.[0];
 if(!c||c.status?.type?.completed!==true)return null;
 const away=c.competitors?.find(x=>x.homeAway==='away'),home=c.competitors?.find(x=>x.homeAway==='home');
 if(String(summary.header.id)!==String(event.event_id)||team(away?.team?.abbreviation)!==team(event.away_team)||team(home?.team?.abbreviation)!==team(event.home_team))throw Error('Final event identity mismatch');
 const a=number(away.score),h=number(home.score);if(!finite(a)||!finite(h)||a<0||h<0)throw Error('Invalid final score');
 const players={};
 for(const t of summary.boxscore?.players||[])for(const g of t.statistics||[]){
  const map=fields[g.name];if(!map)continue;
  for(const row of g.athletes||[]){
   const key=norm(row.athlete?.displayName);if(!key)continue;
   const id=String(row.athlete?.id||'');
   if(players[key]&&players[key].id!==id)throw Error('Ambiguous player identity');
   const p=players[key]??={id,stats:{}};
   for(let i=0;i<(g.labels||[]).length;i++){const stat=map[g.labels[i]],value=number(row.stats?.[i]);if(stat&&finite(value)&&value>=0)p.stats[stat]=value;}
  }
 }
 return {event_id:String(event.event_id),away_team:event.away_team,home_team:event.home_team,away_score:a,home_score:h,players};
}
export function gradePick(p,result){
 if(p.decision!=='PICK')return null;
 if(!result||!finite(p.odds)||p.odds===0)return null;
 let actual,delta;
 if(p.player){
  actual=result.players?.[norm(p.player)]?.stats?.[p.market];
  if(!finite(actual)||!finite(p.line)||!['OVER','UNDER'].includes(p.selection))return null;
  delta=(actual-p.line)*(p.selection==='OVER'?1:-1);
 }else if(p.market==='total'){
  if(!finite(p.line)||! /^(OVER|UNDER) /.test(p.selection))return null;
  actual=result.away_score+result.home_score;delta=(actual-p.line)*(p.selection.startsWith('OVER ')?1:-1);
 }else if(['spread','moneyline'].includes(p.market)){
  const selected=team(p.selection?.split(' ')[0]);if(![team(result.home_team),team(result.away_team)].includes(selected))return null;
  actual=(result.home_score-result.away_score)*(selected===team(result.home_team)?1:-1);
  if(p.market==='spread'&&!finite(p.line))return null;
  delta=actual+(p.market==='spread'?p.line:0);
 }else return null;
 const outcome=delta>0?'WIN':delta<0?'LOSS':'PUSH';
 return {outcome,actual,profit_units:outcome==='WIN'?(p.odds>0?p.odds/100:100/-p.odds):outcome==='LOSS'?-1:0};
}
export function settlePicks({history,ledger,results,now}){
 if(!Number.isFinite(Date.parse(now)))throw Error('Invalid settlement time');
 if(ledger.schema_version!=='1.0.0'||!Array.isArray(ledger.settlements))throw Error('Invalid settlement ledger');
 const settlements=[...ledger.settlements],latest=new Map(settlements.map(r=>[r.record_id,r]));
 for(const p of history.records){
  if(!(Date.parse(p.captured_at)<Date.parse(p.kickoff)&&Date.parse(p.kickoff)<Date.parse(now)))continue;
  const result=results[p.game_id],grade=gradePick(p,result);if(!grade)continue;
  const fingerprint=JSON.stringify([grade,result.event_id]),old=latest.get(p.record_id);
  if(old?.fingerprint===fingerprint)continue;
  const revision=(old?.revision||0)+1;
  const row={record_id:p.record_id,revision,previous_settlement_id:old?.settlement_id||null,...grade,settled_at:now,verified_final:true,source_event_id:result.event_id,source_url:`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${result.event_id}`,fingerprint};
  row.settlement_id=crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex');settlements.push(row);latest.set(p.record_id,row);
 }
 return {...ledger,settlements};
}
export function historyFeed(history,ledger,events){
 const latest=new Map(ledger.settlements.map(r=>[r.record_id,r]));
 const streams=new Map();
 for(const p of history.records){if(!streams.has(p.stream_id))streams.set(p.stream_id,[]);streams.get(p.stream_id).push(p);}
 return {schema_version:'1.0.0',basis:'First recorded PICK per game/market/player; risk 1 hypothetical unit. Revisions are not additional bets. Moneyline ties treated as pushes; sportsbook-specific void rules are not inferred.',records:[...streams.values()].map(rows=>{
 rows.sort((a,b)=>a.revision-b.revision);const first=rows.find(r=>r.decision==='PICK');
 return {stream_id:rows[0].stream_id,season:rows[0].season,week:rows[0].week,game_id:rows[0].game_id,home_team:events[rows[0].game_id]?.home_team,away_team:events[rows[0].game_id]?.away_team,market:rows[0].market,player:rows[0].player,primary_record_id:first?.record_id||null,revisions:rows.map(p=>({...p,result:latest.get(p.record_id)||null}))};})};
}
