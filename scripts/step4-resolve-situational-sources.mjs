import fs from 'node:fs';

const years=[2021,2022,2023,2024,2025];
const weeks=[...Array(18)].map((_,i)=>i+1);
const ua={'user-agent':'fantasy-2026-step4-data-integrity'};
async function get(url){const r=await fetch(url,{headers:ua});if(!r.ok)throw new Error(`${r.status} ${url}`);return r.json();}
const events=[];
for(const season of years){
  for(const week of weeks){
    const url=`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`;
    const j=await get(url);
    for(const e of j.events||[]){
      const c=e.competitions?.[0];
      if(!c) continue;
      events.push({season,week,id:e.id,name:e.name,date:e.date,venue:c.venue||null,source_url:url});
    }
  }
}
function keysDeep(x,set=new Set()){
  if(Array.isArray(x)){for(const v of x)keysDeep(v,set);return set;}
  if(x&&typeof x==='object'){for(const [k,v] of Object.entries(x)){set.add(k.toLowerCase());keysDeep(v,set);}}
  return set;
}
function walk(x,out=[]){
  if(Array.isArray(x)){for(const v of x)walk(v,out);return out;}
  if(x&&typeof x==='object'){out.push(x);for(const v of Object.values(x))walk(v,out);}
  return out;
}
const venueKeys=new Set();for(const e of events)keysDeep(e.venue,venueKeys);
const countries=events.map(e=>e.venue?.address?.country).filter(Boolean);
const internationalEvents=events.filter(e=>{const c=String(e.venue?.address?.country||'').toUpperCase();return c&& !['USA','US','UNITED STATES','UNITED STATES OF AMERICA'].includes(c);});

const comebackScoreboard=await get('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=2022&seasontype=2&week=15');
const comebackEvent=(comebackScoreboard.events||[]).find(e=>String(e.name||'').includes('Indianapolis Colts')&&String(e.name||'').includes('Minnesota Vikings'));
let comebackProbe={event_found:Boolean(comebackEvent),event_id:comebackEvent?.id||null,chronological_score_state_found:false};
let snapProbe={summary_checked:false,snap_field_found:false,snap_keys:[]};
if(comebackEvent){
  const summaryUrl=`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${comebackEvent.id}`;
  const summary=await get(summaryUrl);
  const objs=walk(summary);
  const scoreStates=objs.filter(o=>{
    const period=Number(o.period?.number??o.period??o.quarter);
    const hs=Number(o.homeScore??o.home_score);
    const as=Number(o.awayScore??o.away_score);
    return Number.isFinite(period)&&period>=4&&Number.isFinite(hs)&&Number.isFinite(as);
  });
  comebackProbe={...comebackProbe,summary_url:summaryUrl,chronological_score_state_found:scoreStates.length>0,score_state_rows:scoreStates.length};
  const ks=[...keysDeep(summary)].filter(k=>k.includes('snap'));
  snapProbe={summary_checked:true,summary_url:summaryUrl,snap_field_found:ks.length>0,snap_keys:ks};
}

const hasExplicitTimezone=[...venueKeys].some(k=>k.includes('timezone')||k==='timezone');
const hasCoordinates=[...venueKeys].some(k=>['latitude','longitude','lat','lng','lon'].includes(k));
const countryFieldCoverage=events.length?countries.length/events.length:0;
const sourceDecisions=[
  {
    indicator:'trailed_14_plus_fourth_quarter_then_won',
    status:comebackProbe.chronological_score_state_found?'SOURCE_RESOLVED':'SOURCE_NOT_CONFIRMED',
    source:'ESPN public NFL game summary play-by-play',
    evidence:comebackProbe,
    projection_weight:0,
    next_action:comebackProbe.chronological_score_state_found?'Historical backfill may be built from the verified score-state chronology before any model promotion.':'Keep source-blocked; no model authority.'
  },
  {
    indicator:'international_game_recovery',
    status:internationalEvents.length>0&&countryFieldCoverage>0.9?'SOURCE_RESOLVED':'SOURCE_NOT_CONFIRMED',
    source:'ESPN public NFL scoreboard competition.venue.address.country',
    evidence:{events_scanned:events.length,country_field_coverage:countryFieldCoverage,international_events_found:internationalEvents.length,examples:internationalEvents.slice(0,5).map(e=>({season:e.season,week:e.week,name:e.name,country:e.venue?.address?.country}))},
    projection_weight:0,
    next_action:'Country flag is source-resolved; historical recovery classification may be rebuilt and revalidated before promotion.'
  },
  {
    indicator:'west_to_east_early_kick',
    status:hasExplicitTimezone&&hasCoordinates?'SOURCE_RESOLVED':'ZERO_AUTHORITY_SOURCE_INSUFFICIENT',
    source:'Current locked ESPN scoreboard venue metadata',
    evidence:{events_scanned:events.length,explicit_timezone_field_found:hasExplicitTimezone,coordinate_field_found:hasCoordinates,venue_keys:[...venueKeys].sort()},
    projection_weight:0,
    next_action:'Requires a provenance-backed stadium/team timezone or longitude dataset plus kickoff-local-time mapping; do not infer from team names.'
  },
  {
    indicator:'high_snap_load_previous_game',
    status:snapProbe.snap_field_found?'SOURCE_RESOLVED':'ZERO_AUTHORITY_SOURCE_INSUFFICIENT',
    source:'Current locked ESPN game summary plus existing skill-position history',
    evidence:snapProbe,
    projection_weight:0,
    next_action:'Requires complete comparable snap/workload history; existing partial skill-position usage cannot be treated as complete game workload.'
  }
];
const unresolved=sourceDecisions.filter(x=>x.status==='SOURCE_NOT_CONFIRMED');
const out={
  schema_version:'STEP4_SITUATIONAL_SOURCE_RESOLUTION_1.0.0',
  generated_at:new Date().toISOString(),
  history_window:years,
  events_scanned:events.length,
  missing_is_unknown:true,
  sportsbook_or_adp_used:false,
  source_decisions:sourceDecisions,
  source_resolved:sourceDecisions.filter(x=>x.status==='SOURCE_RESOLVED').map(x=>x.indicator),
  zero_authority_insufficient_source:sourceDecisions.filter(x=>x.status==='ZERO_AUTHORITY_SOURCE_INSUFFICIENT').map(x=>x.indicator),
  status:unresolved.length?'REVIEW_REQUIRED':'ALL_FOUR_EXPLICITLY_RESOLVED_OR_ZERO_AUTHORITY'
};
fs.mkdirSync('data/sources',{recursive:true});
fs.writeFileSync('data/sources/step4-situational-source-resolution-2026.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out,null,2));
if(unresolved.length)process.exit(1);
