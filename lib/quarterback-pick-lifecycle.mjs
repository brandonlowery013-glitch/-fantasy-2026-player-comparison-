import {createHash} from 'node:crypto';
const time=v=>Date.parse(v);
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const clone=v=>structuredClone(v);

// This evaluator consumes normalized, dated game-specific reports and evaluated
// scenarios. It cannot grant validation authority to an experimental model.
export function reviseQuarterbackPick({previous=null,gameId,kickoff,now,report,quote,scenarios=[],validatedModelVersions=[]}) {
  if(!Number.isFinite(time(now))||!Number.isFinite(time(kickoff)))throw new Error('Valid decision time and kickoff required');
  if(previous&&previous.game_id!==gameId)throw new Error('Decision belongs to another game');
  if(previous?.locked_at)return clone(previous);
  if(previous&&time(now)<time(previous.updated_at))throw new Error('Out-of-order decision update');
  const hold=reason=>({decision:'WAIT',selection:null,reason});
  if(time(now)>=time(kickoff)) {
    const recent=previous&&time(kickoff)-time(previous.updated_at)<=5*60000;
    const last=recent?previous.current:hold('No final pregame check was saved.');
    const current=last.decision==='WAIT'?{...last,decision:'PASS'}:clone(last);
    return {...clone(previous||{game_id:gameId,history:[]}),current,locked_at:kickoff,updated_at:now};
  }
  let current;
  const dated=report?.id&&report?.game_id===gameId&&report?.verified===true&&report?.source&&Number.isFinite(time(report.reported_at))&&time(report.reported_at)<=time(now)&&Number.isFinite(time(report.received_at))&&time(report.received_at)>=time(report.reported_at)&&time(report.received_at)<=time(now);
  const freshPrice=quote?.game_id===gameId&&quote?.id&&Number.isFinite(time(quote.captured_at))&&time(quote.captured_at)<=time(now)&&time(now)-time(quote.captured_at)<=5*60000;
  const ready=s=>s&&validatedModelVersions.includes(s.model_version)&&s.report_id===report.id&&s.quote_id===quote.id&&s.game_id===gameId&&s.recommendation&&['PICK','PASS'].includes(s.recommendation.decision)&&Number.isFinite(time(s.evaluated_at))&&time(s.evaluated_at)>=Math.max(time(report.received_at),time(quote.captured_at))&&time(s.evaluated_at)<=time(now);
  if(!dated)current=hold(report?.display_reason||'Waiting for a verified quarterback update.');
  else if(!freshPrice)current=hold('Waiting for updated odds.');
  else if(report.status==='QUESTIONABLE') {
    const a=scenarios.find(s=>s.player_id===report.starter_id),b=scenarios.find(s=>s.player_id===report.backup_id);
    current=report.starter_id&&report.backup_id&&report.starter_id!==report.backup_id&&ready(a)&&ready(b)&&hash(a.recommendation)===hash(b.recommendation)?clone(a.recommendation):hold('Waiting on quarterback news.');
  } else if(['CONFIRMED_PLAYING','REPLACEMENT_CONFIRMED'].includes(report.status)) {
    const s=scenarios.find(s=>s.player_id===report.confirmed_starter_id);
    current=ready(s)?clone(s.recommendation):hold('The confirmed starter is being evaluated at the updated odds.');
  } else current=hold(report.status==='LATE_SETBACK'?'The previous pick has been withdrawn after a late quarterback update.':'Waiting for the starting quarterback to be confirmed.');
  const fingerprint=hash({report,quote,scenarios,validatedModelVersions,current});
  if(previous?.fingerprint===fingerprint)return clone(previous);
  const entry={revision:(previous?.history.length||0)+1,at:now,report_id:report?.id||null,quote_id:quote?.id||null,...clone(current)};
  return {game_id:gameId,updated_at:now,locked_at:null,fingerprint,current,history:[...clone(previous?.history||[]),entry]};
}
