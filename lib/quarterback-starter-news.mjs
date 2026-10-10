import {createHash} from 'node:crypto';
const canon=x=>({LAR:'LA',WSH:'WAS',JAC:'JAX'}[x]||x);
const escaped=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// News can establish an explicit game-bound starter announcement, never an
// inference from active status, an injury-feed omission or a depth chart.
export function quarterbackStarterNews({articles,games,players,receivedAt}){
 const now=Date.parse(receivedAt);if(!Number.isFinite(now))throw Error('Invalid receipt time');
 const reports=[],rejected=[];
 for(const a of articles||[]){
  const url=a.links?.web?.href,published=a.published,t=Date.parse(published);
  let source;try{source=new URL(url);}catch{continue;}
  if(source.protocol!=='https:'||!['espn.com','www.espn.com'].includes(source.hostname)||!Number.isFinite(t)||t>now||now-t>7*86400000)continue;
  const text=`${a.headline||''}. ${a.description||''}`;
  // Conservative: uncertain, negated, quoted conditional, or retrospective
  // headlines cannot establish who will start.
  if(/\b(if|unless|could|might|may|expected|likely|unlikely|would|should|not|won't|won’t)\b/i.test(text))continue;
  const tags=a.categories||[];
  const teams=new Set(tags.filter(x=>x.type==='team').map(x=>canon(x.team?.abbreviation)));
  for(const p of players.filter(p=>p.position==='QB'&&p.gsis_id&&p.display_name&&p.espn_id)){
   if(!tags.some(x=>x.type==='athlete'&&String(x.athleteId)===String(p.espn_id)))continue;
   const statement=new RegExp(`\\b${escaped(p.display_name)}\\s+(?:(?:has been|was) named (?:the )?(?:starting quarterback|starter)|(?:will|is set to|to) start)\\b`,'i');
   if(!statement.test(text))continue;
   const matches=games.filter(g=>g.verified===true&&Date.parse(g.kickoff)>now&&Date.parse(g.kickoff)-t<=7*86400000&&[g.home_team,g.away_team].some(team=>teams.has(canon(team)))&&g.matchup_aliases?.some(alias=>alias.length>=3&&new RegExp(`\\b${escaped(alias)}\\b`,'i').test(text)));
   if(matches.length!==1){rejected.push({source_url:url,player_id:p.gsis_id,reason:'Announcement not bound to exactly one upcoming matchup'});continue;}
   const g=matches[0],team=canon(p.latest_team);
   if(![canon(g.home_team),canon(g.away_team)].includes(team)||!teams.has(team))continue;
   // The caller's aliases must identify the opponent, not the QB's own team.
   const opponent=canon(g.home_team)===team?canon(g.away_team):canon(g.home_team);
   if(!g.opponent_aliases?.[opponent]?.some(alias=>alias.length>=3&&new RegExp(`\\b${escaped(alias)}\\b`,'i').test(text)))continue;
   reports.push({id:createHash('sha256').update(JSON.stringify([url,published,text,g.id,p.gsis_id])).digest('hex'),game_id:g.id,team,status:'REPLACEMENT_CONFIRMED',confirmed_starter_id:p.gsis_id,source_url:url,reported_at:published,received_at:receivedAt,verified:true,evidence:text});
  }
 }
 return {reports,rejected};
}
