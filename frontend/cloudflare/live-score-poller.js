(()=>{
  const POLL_MS=20000;
  const ESPN='https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
  const norm=t=>({LA:'LAR',WAS:'WSH'}[String(t||'').toUpperCase()]||String(t||'').toUpperCase());
  let timer=null,busy=false,lastApplied='';

  function currentWeek(){
    const w=Number(BET_FEED?.week);
    return Number.isInteger(w)&&w>0?w:1;
  }
  function parseEvent(ev){
    const comp=ev?.competitions?.[0];
    if(!comp)return null;
    const teams=comp.competitors||[];
    const away=teams.find(x=>x.homeAway==='away');
    const home=teams.find(x=>x.homeAway==='home');
    if(!away||!home)return null;
    const state=ev?.status?.type?.state||'pre';
    return {
      id:String(ev.id||''),
      away_team:norm(away.team?.abbreviation),
      home_team:norm(home.team?.abbreviation),
      away_score:Number.isFinite(Number(away.score))?Number(away.score):null,
      home_score:Number.isFinite(Number(home.score))?Number(home.score):null,
      state,
      completed:state==='post'||ev?.status?.type?.completed===true,
      status:ev?.status?.type?.shortDetail||ev?.status?.type?.detail||'',
      date:ev?.date||comp.date||null,
      away_periods:(away.linescores||[]).map(x=>Number(x.value??x.displayValue)).filter(Number.isFinite),
      home_periods:(home.linescores||[]).map(x=>Number(x.value??x.displayValue)).filter(Number.isFinite)
    };
  }
  function ctStart(value){
    const d=new Date(value);if(!Number.isFinite(d.getTime()))return 'SCHEDULED';
    return d.toLocaleString('en-US',{timeZone:'America/Chicago',weekday:'short',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
  }
  function apply(rows){
    const feed=BET_FEED;
    if(!feed?.games?.length)return;
    let changed=false;
    for(const g of feed.games){
      const s=rows.find(x=>x.away_team===norm(g.away_team)&&x.home_team===norm(g.home_team));
      if(!s)continue;
      const nextStatus=s.completed?'FINAL':s.state==='in'?(s.status||'LIVE'):ctStart(s.date);
      if(g.away_score!==s.away_score||g.home_score!==s.home_score||g.status!==nextStatus||g.completed!==s.completed)changed=true;
      Object.assign(g,{
        away_score:s.away_score,
        home_score:s.home_score,
        status:nextStatus,
        completed:s.completed,
        latest_scores:{away:[...s.away_periods.slice(0,4),s.away_score],home:[...s.home_periods.slice(0,4),s.home_score]}
      });
      if(s.completed){
        g.model_summary=`Final: ${g.away_team} ${s.away_score}, ${g.home_team} ${s.home_score}. Pregame market analysis is archived.`;
        g.model_spread_pick='GAME FINAL';g.total_pick='GAME FINAL';g.moneyline_pick='GAME FINAL';g.model_edge=null;
      }
    }
    const stamp=JSON.stringify(rows.map(x=>[x.id,x.away_score,x.home_score,x.state,x.status]));
    if(changed||stamp!==lastApplied){
      lastApplied=stamp;
      try{window.renderTicker?.()}catch{}
      try{window.renderSelectedGame?.()}catch{}
      document.dispatchEvent(new CustomEvent('ctd:live-scores-updated',{detail:{updated_at:new Date().toISOString(),poll_ms:POLL_MS}}));
    }
  }
  async function poll(){
    if(busy)return;busy=true;
    try{
      const week=currentWeek();
      const url=`${ESPN}?seasontype=2&dates=2026&week=${week}&limit=100&_=${Date.now()}`;
      const r=await fetch(url,{cache:'no-store'});
      if(!r.ok)throw Error(`ESPN ${r.status}`);
      const data=await r.json();
      const rows=(data.events||[]).map(parseEvent).filter(Boolean);
      if(rows.length)apply(rows);
    }catch(err){console.warn('Live score poll failed; keeping last known scores.',err)}
    finally{busy=false;}
  }
  function start(){
    if(timer)return;
    poll();
    timer=setInterval(poll,POLL_MS);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll()});
    window.addEventListener('focus',poll);
  }
  document.addEventListener('DOMContentLoaded',start,{once:true});
  document.addEventListener('ctd:games-ready',poll);
  if(document.readyState!=='loading')start();
})();
