const ESPN_SCOREBOARD='https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

const teamKey=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const TEAM={
  ARI:['ARI','ARIZONA','ARIZONACARDINALS'],ATL:['ATL','ATLANTA','ATLANTAFALCONS'],BAL:['BAL','BALTIMORE','BALTIMORERAVENS'],BUF:['BUF','BUFFALO','BUFFALOBILLS'],CAR:['CAR','CAROLINA','CAROLINAPANTHERS'],CHI:['CHI','CHICAGO','CHICAGOBEARS'],CIN:['CIN','CINCINNATI','CINCINNATIBENGALS'],CLE:['CLE','CLEVELAND','CLEVELANDBROWNS'],DAL:['DAL','DALLAS','DALLASCOWBOYS'],DEN:['DEN','DENVER','DENVERBRONCOS'],DET:['DET','DETROIT','DETROITLIONS'],GB:['GB','GNB','GREENBAY','GREENBAYPACKERS'],HOU:['HOU','HOUSTON','HOUSTONTEXANS'],IND:['IND','INDIANAPOLIS','INDIANAPOLISCOLTS'],JAX:['JAX','JAC','JACKSONVILLE','JACKSONVILLEJAGUARS'],KC:['KC','KAN','KANSASCITY','KANSASCITYCHIEFS'],LV:['LV','LVR','LASVEGAS','LASVEGASRAIDERS','OAK'],LAC:['LAC','LOSANGELESCHARGERS','LACHARGERS'],LAR:['LAR','LA','LOSANGELESRAMS','LARAMS'],MIA:['MIA','MIAMI','MIAMIDOLPHINS'],MIN:['MIN','MINNESOTA','MINNESOTAVIKINGS'],NE:['NE','NWE','NEWENGLAND','NEWENGLANDPATRIOTS'],NO:['NO','NOR','NEWORLEANS','NEWORLEANSSAINTS'],NYG:['NYG','NEWYORKGIANTS','NYGIANTS'],NYJ:['NYJ','NEWYORKJETS','NYJETS'],PHI:['PHI','PHILADELPHIA','PHILADELPHIAEAGLES'],PIT:['PIT','PITTSBURGH','PITTSBURGHSTEELERS'],SEA:['SEA','SEATTLE','SEATTLESEAHAWKS'],SF:['SF','SFO','SANFRANCISCO','SANFRANCISCO49ERS'],TB:['TB','TAM','TAMPABAY','TAMPABAYBUCCANEERS'],TEN:['TEN','TENNESSEE','TENNESSEETITANS'],WSH:['WSH','WAS','WASHINGTON','WASHINGTONCOMMANDERS']
};
const canonical=v=>{const x=teamKey(v);for(const [abbr,aliases] of Object.entries(TEAM)){if(aliases.some(a=>teamKey(a)===x))return abbr}return x};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store, max-age=0'}});

function mappedEvent(event){
  const competition=event?.competitions?.[0]||{};
  const competitors=competition.competitors||[];
  const away=competitors.find(x=>x.homeAway==='away')||{};
  const home=competitors.find(x=>x.homeAway==='home')||{};
  const state=event?.status?.type?.state||null;
  return {
    provider:'espn',
    event_id:String(event?.id||''),
    provider_event_id:String(event?.id||''),
    away:{team:canonical(away?.team?.abbreviation||away?.team?.shortDisplayName||away?.team?.displayName),team_id:away?.team?.id?String(away.team.id):null,score:away?.score==null?null:Number(away.score)},
    home:{team:canonical(home?.team?.abbreviation||home?.team?.shortDisplayName||home?.team?.displayName),team_id:home?.team?.id?String(home.team.id):null,score:home?.score==null?null:Number(home.score)},
    status:event?.status?.type?.shortDetail||event?.status?.type?.detail||'Scheduled',
    state,
    clock:event?.status?.displayClock||null,
    period:event?.status?.period||null,
    event_start:event?.date||null,
    completed:Boolean(event?.status?.type?.completed),
    received_at:new Date().toISOString()
  };
}

export async function onRequestGet(context){
  try{
    const url=new URL(context.request.url);
    const week=Number(url.searchParams.get('week'));
    const params=new URLSearchParams({limit:'100'});
    if(Number.isInteger(week)&&week>0&&week<=25)params.set('week',String(week));
    params.set('_',String(Date.now()));
    const upstream=await fetch(`${ESPN_SCOREBOARD}?${params}`,{headers:{accept:'application/json'}});
    if(!upstream.ok)return json({error:'ESPN scoreboard unavailable',upstream_status:upstream.status},502);
    const body=await upstream.json();
    const games=(body?.events||[]).map(mappedEvent).filter(x=>x.event_id&&x.away.team&&x.home.team);
    return json({provider:'espn',week:Number.isInteger(week)&&week>0?week:null,generated_at:new Date().toISOString(),games,health:{status:'ok',event_count:games.length}});
  }catch(error){
    return json({error:'Live scoreboard request failed',detail:String(error?.message||error)},502);
  }
}
