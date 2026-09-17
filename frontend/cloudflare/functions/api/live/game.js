const ESPN_SUMMARY=id=>`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${encodeURIComponent(id)}`;

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store, max-age=0'}});
const team=v=>({LA:'LAR',WAS:'WSH',GNB:'GB',JAC:'JAX',KAN:'KC',LVR:'LV',NWE:'NE',NOR:'NO',SFO:'SF',TAM:'TB'}[String(v||'').toUpperCase()]||String(v||'').toUpperCase());
const score=x=>x?.score==null?null:Number(x.score);
const statValue=s=>s?.displayValue??s?.value??null;

function teamStats(summary){
  return (summary?.boxscore?.teams||[]).map(block=>({
    team_id:block?.team?.id?String(block.team.id):null,
    team:team(block?.team?.abbreviation||block?.team?.shortDisplayName||block?.team?.displayName),
    stats:Object.fromEntries((block?.statistics||[]).flatMap(s=>{
      const value=statValue(s);
      const keys=[s?.name,s?.displayName].filter(Boolean);
      return keys.map(k=>[k,value]);
    }))
  }));
}

function categoryName(group){
  const raw=String(group?.name||group?.displayName||'').toLowerCase();
  if(raw.includes('pass'))return 'passing';
  if(raw.includes('rush'))return 'rushing';
  if(raw.includes('receiv'))return 'receiving';
  if(raw.includes('defens'))return 'defensive';
  if(raw.includes('kick return'))return 'kickReturns';
  if(raw.includes('punt return'))return 'puntReturns';
  if(raw.includes('kick'))return 'kicking';
  if(raw.includes('punt'))return 'punting';
  return raw.replace(/\s+/g,'_')||'other';
}

function playerStats(summary){
  const rows=[];
  for(const block of summary?.boxscore?.players||[]){
    const teamAbbr=team(block?.team?.abbreviation||block?.team?.shortDisplayName||block?.team?.displayName);
    for(const group of block?.statistics||[]){
      const labels=group?.labels||[];
      const category=categoryName(group);
      for(const athlete of group?.athletes||[]){
        const values=athlete?.stats||[];
        rows.push({
          provider:'espn',
          team_id:block?.team?.id?String(block.team.id):null,
          team:teamAbbr,
          category,
          player_id:athlete?.athlete?.id?String(athlete.athlete.id):null,
          player:athlete?.athlete?.displayName||athlete?.athlete?.shortName||'Player',
          stats:Object.fromEntries(labels.map((label,index)=>[label,values[index]??null]))
        });
      }
    }
  }
  return rows;
}

function scoringPlays(summary){
  return (summary?.scoringPlays||[]).map(play=>({
    id:play?.id?String(play.id):null,
    period:play?.period?.number??null,
    clock:play?.clock?.displayValue??null,
    team_id:play?.team?.id?String(play.team.id):null,
    team:team(play?.team?.abbreviation),
    text:play?.text||null,
    away_score:play?.awayScore==null?null:Number(play.awayScore),
    home_score:play?.homeScore==null?null:Number(play.homeScore)
  }));
}

function winProbability(summary){
  return (summary?.winprobability||summary?.winProbability||[]).map(point=>{
    const play=point?.play||{};
    const home=point?.homeWinPercentage??point?.homeWinProbability??point?.homeWinPct;
    return {
      home_win_probability:home==null?null:Number(home),
      period:play?.period?.number??point?.period?.number??null,
      clock:play?.clock?.displayValue??point?.clock?.displayValue??null,
      text:play?.text||point?.text||null,
      away_score:play?.awayScore==null?(point?.awayScore==null?null:Number(point.awayScore)):Number(play.awayScore),
      home_score:play?.homeScore==null?(point?.homeScore==null?null:Number(point.homeScore)):Number(play.homeScore)
    };
  }).filter(x=>Number.isFinite(x.home_win_probability));
}

function injuries(summary){
  const rows=[];
  for(const block of summary?.injuries||[]){
    const teamAbbr=team(block?.team?.abbreviation||block?.team?.shortDisplayName||block?.team?.displayName);
    for(const item of block?.injuries||[]){
      rows.push({
        team_id:block?.team?.id?String(block.team.id):null,
        team:teamAbbr,
        player_id:item?.athlete?.id?String(item.athlete.id):null,
        player:item?.athlete?.displayName||item?.athlete?.shortName||'Player',
        status:item?.status||item?.details?.type||null,
        detail:item?.details?.detail||item?.details?.type||null,
        source_updated_at:item?.date||null
      });
    }
  }
  return rows;
}

function normalize(summary,eventId){
  const competition=summary?.header?.competitions?.[0]||{};
  const competitors=competition?.competitors||[];
  const away=competitors.find(x=>x.homeAway==='away')||{};
  const home=competitors.find(x=>x.homeAway==='home')||{};
  const state=competition?.status?.type?.state||competition?.status?.type?.name||null;
  return {
    provider:'espn',
    event_id:String(eventId),
    provider_event_id:String(eventId),
    away:{team:team(away?.team?.abbreviation||away?.team?.shortDisplayName||away?.team?.displayName),team_id:away?.team?.id?String(away.team.id):null,score:score(away)},
    home:{team:team(home?.team?.abbreviation||home?.team?.shortDisplayName||home?.team?.displayName),team_id:home?.team?.id?String(home.team.id):null,score:score(home)},
    away_score:score(away),
    home_score:score(home),
    status:competition?.status?.type?.shortDetail||competition?.status?.type?.detail||'Scheduled',
    state,
    clock:competition?.status?.displayClock||null,
    period:competition?.status?.period||null,
    completed:Boolean(competition?.status?.type?.completed)||String(state||'').toLowerCase()==='post',
    event_start:competition?.date||summary?.header?.season?.startDate||null,
    team_stats:teamStats(summary),
    player_stats:playerStats(summary),
    scoring_plays:scoringPlays(summary),
    win_probability:winProbability(summary),
    injuries:injuries(summary)
  };
}

export async function onRequestGet(context){
  try{
    const url=new URL(context.request.url);
    const event=String(url.searchParams.get('event')||'').trim();
    if(!/^\d{5,20}$/.test(event))return json({error:'Valid ESPN event id required'},400);
    const upstream=await fetch(ESPN_SUMMARY(event),{headers:{accept:'application/json'}});
    if(!upstream.ok)return json({error:'ESPN game summary unavailable',upstream_status:upstream.status},502);
    const summary=await upstream.json();
    const game=normalize(summary,event);
    if(!game.away.team||!game.home.team)return json({error:'ESPN game summary did not contain both teams'},502);
    const generated_at=new Date().toISOString();
    return json({provider:'espn',generated_at,health:{status:'ok',provider:'espn',received_at:generated_at},game});
  }catch(error){
    return json({error:'Live game detail request failed',detail:String(error?.message||error)},502);
  }
}
