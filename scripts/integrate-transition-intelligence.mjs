import fs from 'node:fs';
import path from 'node:path';

// This script is the authoritative transition integration point. The workflow builds the
// historical review and enriches it from validated unified evidence first; only then do we
// expand material team changes to offensive clusters and synthesize each player's chronology.
await import('./enforce-offensive-transition-clusters.mjs');
await import('./build-chronological-transition-context.mjs');

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(x,null,2)+'\n');};
const source=read('MODEL_SOURCE_OF_TRUTH.json');
const ledger=read('guardrails/current-football-review.json');
const transition=read('analysis/transition-intelligence-current.json');
const expected=Number(source.active_player_model);
if((transition.rows||[]).length!==expected)throw new Error(`Transition coverage ${transition.rows?.length||0}/${expected}`);
if((ledger.players||[]).length!==expected)throw new Error(`Review coverage ${ledger.players?.length||0}/${expected}`);
if(transition.chronological_context?.mandatory!==true)throw new Error('Chronological transition synthesis missing before integration');
if(transition.offensive_transition_cluster?.mandatory!==true)throw new Error('Offensive transition cluster pass missing before integration');
if(Number(transition.fallback_enrichment?.added_evidence||0)>0&&Number(transition.chronological_context?.players_with_timeline||0)===0)throw new Error('Enriched transition evidence was not preserved into chronological timelines');
if(Number(transition.offensive_transition_cluster?.team_count||0)>0&&Number(transition.offensive_transition_cluster?.player_count||0)===0)throw new Error('Offensive transition teams found but no tracked skill players were clustered');
const byName=new Map((ledger.players||[]).map(x=>[x.player,x]));
const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const substantiveCategories=new Set(['scheme_install','adaptation','role_usage','chemistry','competition','readiness','prior_season_injury_recovery','development','teammate_environment','offensive_transition_cluster']);
const directMaterialCategories=new Set(['scheme_install','adaptation','role_usage','chemistry','competition','readiness','prior_season_injury_recovery','development']);
function key(x){return x.url||`${x.source}|${x.headline}|${x.description}`;}
function dedupe(xs){const seen=new Set();return xs.filter(x=>{const k=key(x);if(seen.has(k))return false;seen.add(k);return true;});}
let directAdded=0,teamContextAdded=0,playersWithDirect=0,playersWithTeam=0,recoveryPlayers=0;
for(const row of transition.rows||[]){
  const review=byName.get(row.player);if(!review)throw new Error(`Transition player missing from review: ${row.player}`);
  const direct=[],team=[];
  for(const e of row.development_evidence||[]){
    const cats=(e.categories||[]).filter(c=>substantiveCategories.has(c));
    const isCluster=e.cluster_trigger===true||(row.offensive_transition_cluster?.required===true&&e.team_context_only===true);
    if(!cats.length&&!isCluster)continue;
    const finalCats=isCluster&&cats.length===0?['offensive_transition_cluster']:cats;
    const base={source:'TRANSITION_INTELLIGENCE',original_source:e.source||null,team:e.team||row.team||null,published:e.published||null,url:e.url||null,headline:e.headline||null,description:e.description||null,categories:finalCats,transition_window:{start:row.lookback_start,end:row.lookback_end},matched_context:`${e.headline||''} ${e.description||''}`.trim(),chronological_phase:e.phase||null,chronological_direction:e.direction||null};
    if(e.direct_player_evidence===true&&finalCats.some(c=>directMaterialCategories.has(c))){
      const txt=norm(`${e.headline||''} ${e.description||''}`);const pname=norm(row.player);
      if(!pname||(!txt.includes(pname)&&!String(e.source||'').includes('ESPN_PLAYER_TRANSITION')&&!String(e.source||'').includes('UNIFIED_LEDGER_FALLBACK')))continue;
      direct.push({...base,evidence_scope:'DIRECT_PLAYER_TRANSITION'});
    } else if(e.team_context_only===true||isCluster){
      team.push({...base,categories:[...new Set([...finalCats,'offensive_transition_cluster'])],evidence_scope:'SAME_TEAM_TRANSITION_CONTEXT'});
    }
  }
  const oldDirect=Array.isArray(review.material_news_signals)?review.material_news_signals:[];
  const oldTeam=Array.isArray(review.material_team_context_signals)?review.material_team_context_signals:[];
  const mergedDirect=dedupe([...oldDirect,...direct]);
  const mergedTeam=dedupe([...oldTeam,...team]);
  directAdded+=mergedDirect.length-oldDirect.length;teamContextAdded+=mergedTeam.length-oldTeam.length;
  if(direct.length)playersWithDirect++;if(team.length)playersWithTeam++;
  if(direct.some(x=>(x.categories||[]).includes('prior_season_injury_recovery')))recoveryPlayers++;
  review.material_news_signals=mergedDirect;
  review.material_team_context_signals=mergedTeam;
  review.transition_intelligence={...(review.transition_intelligence||{}),integrated_into_unified_evidence_stack:true,direct_material_signals:direct.length,team_context_signals:team.length,prior_season_injury_recovery_integrated:direct.some(x=>(x.categories||[]).includes('prior_season_injury_recovery')),integration_rule:'DIRECT_PLAYER_TRANSITION_AND_PRIOR_SEASON_RECOVERY_FEED_COMPONENT_REVIEW; SAME_TEAM_CONTEXT_AND_OFFENSIVE_TRANSITION_CLUSTERS_FEED_CONNECTED_EFFECT_REVIEW'};
}
ledger.transition_intelligence_schema={...(ledger.transition_intelligence_schema||{}),integrated_into_unified_evidence_stack:true,integration_rule:'NOT_A_SEPARATE_MODEL_LAYER; CHRONOLOGICAL_DEVELOPMENT_AND_PRIOR_SEASON_INJURY_RECOVERY_ARE_REQUIRED; MAJOR_OFFENSIVE_CHANGES_FORCE_CONNECTED_SKILL_PLAYER_REVIEW'};
write('guardrails/current-football-review.json',ledger);
const report={generated_at:new Date().toISOString(),result:'PASS',coverage:expected,direct_signals_added:directAdded,team_context_signals_added:teamContextAdded,players_with_direct_transition_signals:playersWithDirect,players_with_team_context_signals:playersWithTeam,players_with_prior_season_recovery_signals:recoveryPlayers,offensive_transition_teams:Number(transition.offensive_transition_cluster?.team_count||0),offensive_transition_cluster_players:Number(transition.offensive_transition_cluster?.player_count||0),players_with_chronological_timeline:Number(transition.chronological_context?.players_with_timeline||0),players_with_current_state_basis:Number(transition.chronological_context?.players_with_current_state_basis||0),transition_schema_version:transition.schema_version||null,policy:'TRANSITION_RECOVERY_OFFENSIVE_CLUSTER_AND_CHRONOLOGICAL_DEVELOPMENT_EVIDENCE_PARTICIPATE_IN_EXISTING_NEWS_COMPONENT_CONNECTED_PLAYER_AND_BOARD_REVIEW_PIPELINE'};
write('guardrails/transition-intelligence-integration-report.json',report);
console.log(JSON.stringify(report,null,2));
