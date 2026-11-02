import {currentTeamPlayers} from './lib/current-team-players.mjs';
import fs from 'node:fs';
import {loadCanonicalPlayers} from '../lib/canonical-player-source.mjs';
import {fantasyInjuryStatus} from '../lib/weekly-ranking-availability.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const {truth,players:seasonPlayers}=await loadCanonicalPlayers(read);
const players=currentTeamPlayers(seasonPlayers);
const context=read('data/probability/weekly-football-context-inputs-2026.json');
const ranks=read('data/weekly/in-season-ranking-layer-2026.json');
const review=read('guardrails/current-football-review.json');
const schedule=read('data/calibration/weekly-event-schedule-2026.json');
if(context.week!==ranks.week||ranks.week!==schedule.week||ranks.universe!==players.length)throw Error('Player detail week/universe mismatch');
const reviewBy=new Map((review.players||[]).map(p=>[p.player,p]));
const clean=x=>String(x||'').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(Number.parseInt(n.startsWith('x')?n.slice(1):n,n.startsWith('x')?16:10))).replace(/&apos;|&#39;/g,"'").replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ');
const normalize=x=>String(x||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const now=Date.now(),validUrl=x=>{try{const u=new URL(x);return u.protocol==='https:'||u.protocol==='http:';}catch{return false;}};
function playerNews(player){
 const seen=new Set();return [...(reviewBy.get(player)?.material_news_signals||[]),...(reviewBy.get(player)?.news_mentions||[])]
 .filter(n=>{const t=Date.parse(n.published||n.date);return Number.isFinite(t)&&t<=now&&now-t<=14*86400000&&validUrl(n.url)&&(n.source==='ESPN_PLAYER'||normalize((n.headline||'')+' '+(n.description||'')).includes(normalize(player)));})
 .sort((a,b)=>Date.parse(b.published||b.date)-Date.parse(a.published||a.date))
 .filter(n=>{if(seen.has(n.url))return false;seen.add(n.url);return true;}).slice(0,3)
 .map(n=>({headline:clean(n.headline||n.title||'Player update'),summary:clean(n.description||n.matched_context||'').split(/\s+/).slice(0,Math.max(0,25-String(n.headline||n.title||'Player update').split(/\s+/).length)).join(' '),published_at:n.published||n.date,url:n.url,source:n.source}));
}
const profiles={};
for(const p of players){
 const c=context.players[p.n],rank=ranks.players[p.n];if(!c||!rank)throw Error('Missing player detail inputs: '+p.n);
 const injury=fantasyInjuryStatus(c,now),evidence=c.signals?.injury?.evidence;
 profiles[p.n]={name:p.n,position:p.p,team:p.t,ros_overall_rank:p.o,true_value_rank:p.tr,season_projected_ppr:p.mp??null,weekly_overall_rank:rank.weekly_overall_rank,weekly_rank_status:rank.weekly_rank_status,
 injury:{...injury,reason:evidence?.display_body_part||evidence?.body_part||evidence?.detail||null,provider_summary:evidence?.summary||null,practice_status:evidence?.practice_status||null,source:injury.display_source||evidence?.source_url||c.signals?.injury?.source||null,observed_at:injury.display_observed_at||evidence?.source_observed_at||c.signals?.injury?.captured_at||null,questionable_numeric_effect:0},news:playerNews(p.n)};
 if(!profiles[p.n].news.length&&evidence?.summary&&evidence?.source_updated_at){profiles[p.n].news=[{headline:p.n+' — '+(evidence.status||'Injury update'),summary:evidence.summary.split(/\s+/).slice(0,Math.max(0,25-(p.n+' — '+evidence.status).split(/\s+/).length)).join(' '),published_at:evidence.source_updated_at,url:reviewBy.get(p.n)?.espn_athlete_id?'https://www.espn.com/nfl/player/_/id/'+reviewBy.get(p.n).espn_athlete_id:'https://www.espn.com/nfl/injuries',source:'ESPN injury report'}];}
}
const personnel=fs.existsSync('data/ingestion/team-personnel-2026.json')?read('data/ingestion/team-personnel-2026.json'):null;
const rosterGroups=new Map();
for(const team of Object.values(personnel?.teams||{}))for(const player of team.players||[]){if(profiles[player.name])continue;const rows=rosterGroups.get(player.name)||[];rows.push(player);rosterGroups.set(player.name,rows);}
const rosterProfiles={};
for(const [name,rows]of rosterGroups){if(rows.length!==1)continue;const p=rows[0],report=[...(p.injury_reports||[])].sort((a,b)=>(Date.parse(b.source_updated_at)||0)-(Date.parse(a.source_updated_at)||0))[0];
 const reference=personnel?.fantasypros_designations?.records?.find(r=>r.name===name&&r.team===p.team&&r.position===p.position);
 const displayEvidence=report?{...report,display_status:reference?.status||null,display_body_part:reference?.body_part||null,display_source:reference?.source_url||null,display_observed_at:reference?personnel.fantasypros_designations.observed_at:null}:reference?{...reference,source_observed_at:personnel.fantasypros_designations.observed_at}:null;
 const injury=fantasyInjuryStatus({signals:displayEvidence?{injury:{evidence:displayEvidence}}:{}},now);
 rosterProfiles[name]={name,team:p.team,position:p.position,modelled:false,ros_overall_rank:null,true_value_rank:null,season_projected_ppr:null,weekly_overall_rank:null,weekly_rank_status:'NOT_MODELLED',injury:{...injury,reason:reference?.body_part||report?.body_part||null,practice_status:report?.practice_status||null,source:reference?.source_url||'https://www.espn.com/nfl/injuries',observed_at:personnel.captured_at,questionable_numeric_effect:0},news:report?.summary&&report.source_updated_at&&Date.parse(report.source_updated_at)<=now?[{headline:name+' — '+report.status,summary:report.summary.split(/\s+/).slice(0,Math.max(0,25-(name+' — '+report.status).split(/\s+/).length)).join(' '),published_at:report.source_updated_at,url:'https://www.espn.com/nfl/injuries',source:'ESPN injury report'}]:[]};
}
const output={schema_version:'1.0.0',season:truth.season,week:ranks.week,universe:players.length,generated_at:new Date().toISOString(),source_of_truth:'MODEL_SOURCE_OF_TRUTH.json',questionable_policy:'LABEL_ONLY_NO_RANK_OR_POINTS_PENALTY',players:profiles,roster_players:rosterProfiles};
fs.mkdirSync('data/weekly',{recursive:true});fs.writeFileSync('data/weekly/player-detail-feed-2026.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({result:'PASS',players:players.length,with_injury_tag:Object.values(profiles).filter(p=>p.injury.tag).length,with_news:Object.values(profiles).filter(p=>p.news.length).length,additional_roster_profiles:Object.keys(rosterProfiles).length}));
