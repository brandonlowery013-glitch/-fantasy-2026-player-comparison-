import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root=process.cwd();
const seasons=[2021,2022,2023,2024,2025];
const positions=new Set(['WR','TE']);
const outDir=path.join(root,'data/probability/generated');
fs.mkdirSync(outDir,{recursive:true});
fs.mkdirSync(path.join(root,'guardrails'),{recursive:true});

const ref=JSON.parse(fs.readFileSync(path.join(outDir,'historical-reference-population-2021-2025.json'),'utf8'));
const sourceOfTruth=JSON.parse(fs.readFileSync(path.join(root,'MODEL_SOURCE_OF_TRUTH.json'),'utf8'));
const guardrailConfig=JSON.parse(fs.readFileSync(path.join(root,'guardrails/guardrails-config.json'),'utf8'));
const authoritativeUniverse=Number(guardrailConfig.authoritative_player_count);
const modelUniverse=Number(sourceOfTruth.active_player_model);
const finite=x=>Number.isFinite(Number(x));
const truth=v=>v===1||v==='1'||v===true||String(v).toLowerCase()==='true';
const val=(r,...ks)=>{for(const k of ks){if(r[k]!==undefined&&r[k]!==null&&r[k]!=='')return r[k]}return null};
function parseCsv(text){
  const rs=[];let row=[],f='',q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){if(c==='"'&&text[i+1]==='"'){f+='"';i++;}else if(c==='"')q=false;else f+=c;}
    else if(c==='"')q=true;else if(c===','){row.push(f);f='';}else if(c==='\n'){row.push(f.replace(/\r$/,''));rs.push(row);row=[];f='';}else f+=c;
  }
  if(f.length||row.length){row.push(f);rs.push(row)}
  const h=rs.shift()||[];
  return rs.filter(r=>r.length>1).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])));
}
function packed(v){
  let s=String(v??'').trim();if(!s)return [];
  s=s.replace(/^\[|\]$/g,'').replace(/["']/g,'');
  const sep=s.includes(';')?';':s.includes('|')?'|':',';
  return s.split(sep).map(x=>x.trim()).filter(Boolean);
}

const playersUrl='https://github.com/nflverse/nflverse-data/releases/download/players/players.csv';
const playersRes=await fetch(playersUrl,{headers:{'user-agent':'fantasy-2026-probability-pipeline'}});
if(!playersRes.ok)throw new Error(`Failed nflverse player master: ${playersRes.status}`);
const playersText=await playersRes.text();
const playerMaster=parseCsv(playersText);
const positionByGsis=new Map();
for(const p of playerMaster){const id=String(val(p,'gsis_id')||'');const pos=String(val(p,'position','position_group')||'').toUpperCase();if(id&&pos)positionByGsis.set(id,pos);}

const refSeasonPlayers=new Map();
for(const r of ref.rows||[]){
  if(!positions.has(r.position)||!r.player_id)continue;
  const key=`${r.player_id}|${r.season}`;
  if(!refSeasonPlayers.has(key))refSeasonPlayers.set(key,{player_id:r.player_id,player:r.player,position:r.position,season:Number(r.season),games:0,targets:0});
  const x=refSeasonPlayers.get(key);x.games++;x.targets+=finite(r.targets)?Number(r.targets):0;
}

const seasonRows=new Map();const sourceReports=[];
let emptyOffensePlayerRows=0,unmappedOffensePlayerIds=0,dropbackPlays=0,matchedParticipationPlays=0,playerDropbackAppearances=0;
for(const season of seasons){
  const pbpUrl=`https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv.gz`;
  const pbpRes=await fetch(pbpUrl,{headers:{'user-agent':'fantasy-2026-probability-pipeline'}});if(!pbpRes.ok)throw new Error(`Failed nflverse PBP ${season}: ${pbpRes.status}`);
  const pbpBuf=Buffer.from(await pbpRes.arrayBuffer());const pbp=parseCsv(zlib.gunzipSync(pbpBuf).toString('utf8'));
  const dropbackMeta=new Map(),teamWeekDropbacks=new Map();
  for(const p of pbp){
    if(String(val(p,'season_type')||'REG').toUpperCase()!=='REG')continue;
    if(truth(val(p,'no_play'))||truth(val(p,'two_point_attempt'))||truth(val(p,'extra_point_attempt')))continue;
    if(!(truth(val(p,'pass_attempt'))||truth(val(p,'sack'))||truth(val(p,'qb_scramble'))))continue;
    const game=String(val(p,'game_id')||''),play=String(val(p,'play_id')||''),team=String(val(p,'posteam')||''),week=Number(val(p,'week'));
    if(!game||!play||!team||!Number.isFinite(week))continue;
    dropbackMeta.set(`${game}|${play}`,{team,week});const tw=`${team}|${week}`;teamWeekDropbacks.set(tw,(teamWeekDropbacks.get(tw)||0)+1);dropbackPlays++;
  }

  const partUrl=`https://github.com/nflverse/nflverse-data/releases/download/pbp_participation/pbp_participation_${season}.csv`;
  const partRes=await fetch(partUrl,{headers:{'user-agent':'fantasy-2026-probability-pipeline'}});if(!partRes.ok)throw new Error(`Failed nflverse participation ${season}: ${partRes.status}`);
  const partText=await partRes.text();const part=parseCsv(partText);const playerWeek=new Map();
  let seasonEmpty=0,seasonUnmapped=0,seasonMatched=0;
  for(const p of part){
    const game=String(val(p,'nflverse_game_id')||''),play=String(val(p,'play_id')||'');const meta=dropbackMeta.get(`${game}|${play}`);if(!meta)continue;
    const possession=String(val(p,'possession_team')||'');if(possession&&possession!==meta.team)continue;
    const ids=packed(val(p,'offense_players'));if(!ids.length){emptyOffensePlayerRows++;seasonEmpty++;continue;}
    matchedParticipationPlays++;seasonMatched++;
    for(const id of ids){
      const pos=positionByGsis.get(id);if(!pos){unmappedOffensePlayerIds++;seasonUnmapped++;continue;}if(!positions.has(pos))continue;
      const k=`${id}|${season}|${meta.week}|${meta.team}`;playerWeek.set(k,(playerWeek.get(k)||0)+1);playerDropbackAppearances++;
    }
  }

  const agg=new Map();
  for(const [k,onField] of playerWeek){
    const [player_id,seasonStr,weekStr,team]=k.split('|');const denom=teamWeekDropbacks.get(`${team}|${weekStr}`)||0;if(!denom)continue;
    const sk=`${player_id}|${seasonStr}`;if(!agg.has(sk))agg.set(sk,{player_id,season:Number(seasonStr),pass_play_snaps:0,eligible_team_dropbacks:0,participating_weeks:0});
    const a=agg.get(sk);a.pass_play_snaps+=onField;a.eligible_team_dropbacks+=denom;a.participating_weeks++;
  }
  for(const [k,a] of agg){a.pass_play_participation=a.eligible_team_dropbacks?a.pass_play_snaps/a.eligible_team_dropbacks:null;seasonRows.set(k,a);}
  sourceReports.push({season,pbp_url:pbpUrl,pbp_compressed_bytes:pbpBuf.length,participation_url:partUrl,participation_bytes:Buffer.byteLength(partText),dropback_plays:dropbackMeta.size,matched_participation_plays:seasonMatched,empty_offense_player_rows:seasonEmpty,unmapped_offense_player_ids:seasonUnmapped,player_seasons_with_pass_play_participation:agg.size,source_attribution:season<=2022?'NFL NextGenStats via nflverse':'FTN Data via nflverse (CC-BY-SA 4.0)'});
}

const matched=[];
for(const [key,r] of refSeasonPlayers){const a=seasonRows.get(key);if(!a)continue;matched.push({...r,...a,target_rate_per_pass_play_snap:a.pass_play_snaps>0?r.targets/a.pass_play_snaps:null,source:a.season<=2022?'NFL NextGenStats via nflverse':'FTN Data via nflverse',source_license:a.season<=2022?'nflverse participation release':'CC-BY-SA 4.0'});}
const matchedKeySet=new Set(matched.map(r=>`${r.player_id}|${r.season}`));const candidate=[...refSeasonPlayers.values()].filter(x=>x.targets>=20);const candidateMatched=candidate.filter(x=>matchedKeySet.has(`${x.player_id}|${x.season}`));
const bySeasonPosition={};for(const season of seasons)for(const pos of positions){const c=candidate.filter(x=>x.season===season&&x.position===pos),m=c.filter(x=>matchedKeySet.has(`${x.player_id}|${x.season}`));bySeasonPosition[`${season}_${pos}`]={candidate_receiving_seasons:c.length,matched_participation_seasons:m.length,coverage:c.length?m.length/c.length:null};}

const blocked=[];
if(!Number.isInteger(authoritativeUniverse)||authoritativeUniverse<=0)blocked.push('invalid authoritative player universe');
if(modelUniverse!==authoritativeUniverse)blocked.push(`model source of truth universe ${modelUniverse} does not match authoritative universe ${authoritativeUniverse}`);
if(ref.live_player_universe_count!==authoritativeUniverse)blocked.push(`historical reference universe ${ref.live_player_universe_count} does not match authoritative universe ${authoritativeUniverse}`);
for(const [k,v] of Object.entries(bySeasonPosition))if(v.candidate_receiving_seasons>=10&&(v.coverage==null||v.coverage<0.70))blocked.push(`${k} pass-play participation coverage below 70%: ${v.coverage}`);
if(candidateMatched.length<750)blocked.push(`matched receiving-role player-seasons unexpectedly small: ${candidateMatched.length}`);
if(emptyOffensePlayerRows>250)blocked.push(`too many dropback participation rows with no offense_players: ${emptyOffensePlayerRows}`);
for(const r of matched)if(!(r.pass_play_participation>0&&r.pass_play_participation<=1.02))blocked.push(`${r.player} ${r.season} invalid pass-play participation ${r.pass_play_participation}`);

const generated_at=new Date().toISOString();
const output={schema_version:'2.1.1',generated_at,mode:'SHADOW_ONLY',actionable:false,history_window:seasons,sportsbook_inputs_used:false,authoritative_player_universe:authoritativeUniverse,granularity:'PLAYER_SEASON',status:'STEP_2D_B_REPRODUCIBLE_RECEIVING_ROLE_PARTICIPATION',metric_definition:{pass_play_snaps:'Observed team dropbacks on which the player is listed among nflverse offensive participants.',eligible_team_dropbacks:'Team dropbacks in player-weeks with at least one observed offensive dropback participation. Inactive weeks are not silently added to the denominator.',pass_play_participation:'pass_play_snaps / eligible_team_dropbacks. This is on-field participation on dropbacks, NOT routes run and NOT route participation.',target_rate_per_pass_play_snap:'historical targets divided by observed pass-play snaps; this is NOT labeled targets per route run.'},identity_policy:'offense_players GSIS IDs are mapped to position with the nflverse player master so 2021-2022 NGS and 2023-2025 FTN participation use one stable identity/position method.',source_policy:{bulk_backbone:'nflverse play-by-play participation',player_master:playersUrl,source_2021_2022:'NFL NextGenStats via nflverse',source_2023_2025:'FTN Data via nflverse (CC-BY-SA 4.0)',true_route_validation:'Fantasy Life Utilization Game Log primary when available; StatRankings secondary only'},true_route_metrics_status:'EXTERNAL_VALIDATION_ONLY_NOT_FABRICATED',source_reports:sourceReports,rows:matched};
const report={generated_at,result:blocked.length?'BLOCKED':'PASS',mode:'SHADOW_ONLY',actionable:false,authoritative_player_universe:authoritativeUniverse,model_source_of_truth_universe:modelUniverse,reference_live_player_universe:ref.live_player_universe_count,matched_player_seasons:matched.length,candidate_receiving_seasons:candidate.length,candidate_matched:candidateMatched.length,coverage:candidate.length?candidateMatched.length/candidate.length:null,coverage_by_season_position:bySeasonPosition,empty_offense_player_rows:emptyOffensePlayerRows,unmapped_offense_player_ids:unmappedOffensePlayerIds,dropback_plays:dropbackPlays,matched_participation_plays:matchedParticipationPlays,player_dropback_appearances:playerDropbackAppearances,blocked,sportsbook_inputs_used:false,safeguards:['Uses reproducible nflverse participation instead of scraping a throttled/premium table.','All seasons use GSIS IDs plus the nflverse player master for WR/TE position mapping.','Pass-play participation is explicitly not mislabeled as route participation or routes run.','WR/TE role cohorts combine observed pass-play participation with receiving involvement to avoid blocking-only contamination.','Missing participation stays missing and never becomes zero.','2023-2025 FTN-via-nflverse attribution is preserved.','No current fantasy rank/projection or sportsbook input is used.','Live-universe integrity requires guardrail authoritative count, MODEL_SOURCE_OF_TRUTH, and historical reference population to match exactly.']};
fs.writeFileSync(path.join(outDir,'historical-pass-play-participation-2021-2025.json'),JSON.stringify(output,null,2)+'\n');fs.writeFileSync(path.join(root,'guardrails/historical-route-participation-backfill-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(blocked.length)process.exit(1);
