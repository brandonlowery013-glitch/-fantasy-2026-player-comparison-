/* Kickoff display is Central Time; stored UTC timestamps remain unchanged. */
(function(root){
  const kickoff=value=>{
    if(typeof value!=='string'||!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)||!Number.isFinite(Date.parse(value)))return 'Start time unavailable';
    return new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value))+' CT';
  };
  function status(game){
    const raw=game?.status?.type?.shortDetail||game?.status?.type?.detail||game?.status||game?.game_status||'';
    const state=String(game?.state||game?.status?.type?.state||'').toLowerCase();
    if(/postpon|cancel|delay|suspend/i.test(String(raw)))return String(raw);
    if(state==='in'||state==='post'||/final|halftime|overtime|\b[1-4](st|nd|rd|th)\b/i.test(String(raw)))return typeof raw==='string'&&raw?raw:state==='post'?'Final':'Live';
    const date=game?.event_start||game?.kickoff||game?.start_at||game?.date||game?.start_time;
    return date?kickoff(date):typeof raw==='string'&&raw?raw:'Scheduled';
  }
  root.CTD_TIME=Object.freeze({kickoff,status,timeZone:'America/Chicago'});
  if(typeof module!=='undefined'&&module.exports)module.exports=root.CTD_TIME;
})(globalThis);
