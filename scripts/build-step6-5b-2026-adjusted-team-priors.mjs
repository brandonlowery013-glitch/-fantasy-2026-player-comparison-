import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const OUT='data/probability/generated/step6-5b-2026-adjusted-team-priors.json';
const LEDGER='data/sources/step6-5b-current-evidence-ledger-2026.json';
const CUTDOWN='data/sources/step6-5b-roster-cutdown-reconciliation-2026.json';
const SCHEDULE_URL='https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv';
const TEAM_CODES=['ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC','LV','LAC','LAR','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SEA','SF','TB','TEN','WAS'];
const canon=x=>({LA:'LAR',JAC:'JAX',WSH:'WAS'}[String(x||'').toUpperCase()]||String(x||'').toUpperCase());
const readJson=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));

function csvRows(text){
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean); if(!lines.length)return [];
  const parse=line=>{const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(c===','&&!q){out.push(cur);cur='';}else cur+=c;}out.push(cur);return out;};
  const head=parse(lines[0]); return lines.slice(1).map(l=>{const a=parse(l),o={};head.forEach((h,i)=>o[h]=a[i]);return o;});
}
function evidenceByTeam(ledger,cutdown){
  const out=Object.fromEntries(TEAM_CODES.map(t=>[t,[]]));
  for(const row of ledger.evidence||ledger.items||[]){
    const team=canon(row.team||row.subject_team||row.affected_team); if(!out[team])continue;
    if(!['MATERIAL','POSSIBLY_MATERIAL'].includes(row.status))continue;
    out[team].push({subject:row.subject||null,evidence_type:row.evidence_type||null,status:row.status,affected_engines:row.affected_engines||[],reason:row.reason||null,confidence:row.confidence??null,projection_authority:row.projection_authority??0,source_layer:'CURRENT_EVIDENCE_LEDGER'});
  }
  for(const move of cutdown.verified_pre_deadline_moves||[]){
    const origin=canon(move.origin_team),dest=canon(move.destination_team);
    if(out[origin])out[origin].push({subject:`${move.player} ${move.state.toLowerCase().replaceAll('_',' ')}`,evidence_type:'ROSTER_CUTDOWN_TRANSACTION',status:'MATERIAL',affected_engines:['TEAM_OFFENSE','TEAM_DEFENSE','DST','PLAYER_PROPS'],reason:`Verified roster transaction removes ${move.player} from ${origin}.`,confidence:'HIGH',projection_authority:0,source_layer:'ROSTER_CUTDOWN_RECONCILIATION'});
    if(dest&&out[dest])out[dest].push({subject:`${move.player} acquired from ${origin}`,evidence_type:'ROSTER_CUTDOWN_TRANSACTION',status:'MATERIAL',affected_engines:['TEAM_OFFENSE','TEAM_DEFENSE','DST','PLAYER_PROPS'],reason:`Verified roster transaction adds ${move.player} to ${dest}; role impact requires position-specific review before numeric authority.`,confidence:'HIGH',projection_authority:0,source_layer:'ROSTER_CUTDOWN_RECONCILIATION'});
  }
  return out;
}
function build(rows,ledger,cutdown){
  const games=rows.filter(r=>Number(r.season)===2025&&String(r.game_type||r.season_type||'REG').toUpperCase()==='REG'&&r.home_score!==''&&r.away_score!=='');
  const agg=Object.fromEntries(TEAM_CODES.map(t=>[t,{games:0,pf:0,pa:0}]));
  for(const g of games){const h=canon(g.home_team),a=canon(g.away_team),hs=Number(g.home_score),as=Number(g.away_score);if(!agg[h]||!agg[a]||!Number.isFinite(hs)||!Number.isFinite(as))continue;agg[h].games++;agg[h].pf+=hs;agg[h].pa+=as;agg[a].games++;agg[a].pf+=as;agg[a].pa+=hs;}
  const totalGames=Object.values(agg).reduce((s,x)=>s+x.games,0); const totalPf=Object.values(agg).reduce((s,x)=>s+x.pf,0); const league=totalGames?totalPf/totalGames:null;
  const ev=evidenceByTeam(ledger,cutdown); const teams={};
  for(const t of TEAM_CODES){const a=agg[t];teams[t]={games:a.games,base_2025_points_for_mean:a.games?a.pf/a.games:null,base_2025_points_allowed_mean:a.games?a.pa/a.games:null,league_points_per_team_game_2025:league,verified_2026_adjustment_features:ev[t],numeric_adjustment_authority:0,adjusted_2026_points_for_mean:null,adjusted_2026_points_allowed_mean:null,roster_reconciliation_state:cutdown.teams?.[t]||'UNKNOWN',status:a.games===17?'BASELINE_READY_ADJUSTMENTS_ZERO_AUTHORITY':'BASELINE_INCOMPLETE'};}
  return {schema_version:'STEP6_5B_2026_ADJUSTED_TEAM_PRIORS_1.1.0',season:2026,status:'SHADOW_BASELINE_READY_ADJUSTMENTS_UNCALIBRATED',sportsbook_inputs_used:false,base_season:2025,source:{name:'nflverse schedules',url:SCHEDULE_URL},roster_cutdown_status:cutdown.status,roster_cutdown_closure_allowed:cutdown.closure_allowed,policy:{formula:'2025 performance baseline + validated 2026 personnel/scheme/availability adjustments = 2026 preseason prior',current_numeric_rule:'Only the 2025 scoring baseline has numeric authority. 2026 personnel/coaching/injury/roster feature rows are attached with zero direct point-value authority until leakage-safe calibration validates coefficients.',double_count_rule:'A canonical football fact may feed multiple engines, but the same effect may not be applied twice through both a team prior adjustment and a direct player adjustment without explicit decomposition.'},league:{points_per_team_game_2025:league},teams};
}
async function main(){
  const ledger=readJson(LEDGER),cutdown=readJson(CUTDOWN); let text;
  if(process.argv.includes('--self-test')){
    text='season,game_type,home_team,away_team,home_score,away_score\n2025,REG,ARI,ATL,24,20\n2025,REG,ATL,ARI,17,21\n';
    const x=build(csvRows(text),ledger,cutdown); if(!x.teams.ARI||x.sportsbook_inputs_used!==false||x.teams.ARI.numeric_adjustment_authority!==0||x.schema_version!=='STEP6_5B_2026_ADJUSTED_TEAM_PRIORS_1.1.0')process.exit(1); console.log(JSON.stringify({result:'PASS',mode:'SELF_TEST'})); return;
  }
  const r=await fetch(SCHEDULE_URL,{headers:{'user-agent':'fantasy-2026-step6-5b'}}); if(!r.ok)throw new Error(`nflverse schedules fetch failed: ${r.status}`); text=await r.text();
  const out=build(csvRows(text),ledger,cutdown); fs.mkdirSync(path.dirname(path.join(root,OUT)),{recursive:true}); fs.writeFileSync(path.join(root,OUT),JSON.stringify(out,null,2)+'\n');
  const incomplete=Object.entries(out.teams).filter(([,x])=>x.games!==17).map(([t,x])=>`${t}:${x.games}`); if(incomplete.length)throw new Error(`2025 baseline incomplete: ${incomplete.join(', ')}`);
  console.log(JSON.stringify({result:'PASS',teams:Object.keys(out.teams).length,league_ppg:out.league.points_per_team_game_2025,cutdown_status:out.roster_cutdown_status},null,2));
}
await main();
