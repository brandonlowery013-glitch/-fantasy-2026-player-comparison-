import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(x,null,2)+'\n');};
const source=read('MODEL_SOURCE_OF_TRUTH.json');
const ledger=read('guardrails/current-football-review.json');
const recalc=read('analysis/substantive-component-recalculation-current.json');
const expected=Number(source.active_player_model),shards=Number(source.runtime_player_shards);
let players=[];for(let i=0;i<shards;i++)players.push(...read(`players${i}.json`));
if(players.length!==expected)throw new Error(`Universe mismatch ${players.length}/${expected}`);
const byReview=new Map((ledger.players||[]).map(x=>[x.player,x]));
const byRecalc=new Map((recalc.rows||[]).map(x=>[x.player,x]));
const allowed=new Set(['UP','DOWN','MATERIAL_HOLD','POSITIVE_HOLD','NEGATIVE_HOLD','NO_MATERIAL_UPDATE']);
const posRe=/\b(clear|cleared|return|returned|full practice|healthy|starter|starting|lead|expanded|increase|increased|more|improved|improving|chemistry|trust|breakout|ascending|activated|available)\b/i;
const negRe=/\b(injur(?:y|ed|ies)?|out|limited|miss|ir|pup|suspend|exempt|decrease|reduced|uncertain|questionable|doubtful|setback|surgery|sprain|strain|tear|absence|lost role)\b/i;
const materialRe=/\b(injur(?:y|ed|ies)?|out|dnp|did not practice|ir|pup|nfi|exempt|suspend(?:ed|s|ion)?|trade|traded|waiv(?:e|ed|er|ers)?|release|released|cut|sign|signed|activate|activated|starter|starting|depth chart|practice|practiced|limited|questionable|doubtful|return|returned|role|workload|committee|timeshare|target|route|snap|carry|touch|reps|first team|goal line|red zone|rb1|wr1|te1|qb1|extension)\b/i;
const textNorm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const teamAlias={ARI:'arizona cardinals',ATL:'atlanta falcons',BAL:'baltimore ravens',BUF:'buffalo bills',CAR:'carolina panthers',CHI:'chicago bears',CIN:'cincinnati bengals',CLE:'cleveland browns',DAL:'dallas cowboys',DEN:'denver broncos',DET:'detroit lions',GB:'green bay packers',HOU:'houston texans',IND:'indianapolis colts',JAX:'jacksonville jaguars',KC:'kansas city chiefs',LV:'las vegas raiders',LAC:'los angeles chargers',LA:'los angeles rams',MIA:'miami dolphins',MIN:'minnesota vikings',NE:'new england patriots',NO:'new orleans saints',NYG:'new york giants',NYJ:'new york jets',PHI:'philadelphia eagles',PIT:'pittsburgh steelers',SF:'san francisco 49ers',SEA:'seattle seahawks',TB:'tampa bay buccaneers',TEN:'tennessee titans',WAS:'washington commanders'};
function canonicalTeam(x){const n=textNorm(x);for(const [abbr,name] of Object.entries(teamAlias))if(n===textNorm(abbr)||n===name)return name;return n;}
function signalText(m){return textNorm(`${m?.headline||''} ${m?.description||''} ${m?.matched_context||''} ${m?.body_text||''}`);}
function escapeRe(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function incidentalMention(player,m){
  const n=textNorm(player.n),ctx=textNorm(m?.matched_context||''),headline=textNorm(m?.headline||'');
  if(!n)return false;
  const p=escapeRe(n);
  if(new RegExp(`\\b(?:famous kiss with|outside of) ${p}\\b`).test(ctx))return true;
  if(new RegExp(`\\b${p} s emergence helped\\b`).test(ctx))return true;
  if(new RegExp(`\\b${p} s contract was restructured\\b`).test(ctx))return true;
  if(new RegExp(`\\b${p}\\b.{0,90}\\b(?:salary cap|base salary|signing bonus)\\b`).test(ctx))return true;
  if(new RegExp(`\\b(?:though )?[^.]{0,80}\\b${p}\\b[^.]{0,50}\\b(?:garner|headlines)\\b`).test(ctx)&&!new RegExp(`\\b${p}\\b.{0,80}\\b(injur|practice|activated|pup|ir|exempt|starter|starting|role|workload|traded|signed|released|waived)`).test(ctx))return true;
  if(headline.includes('melbourne')&&new RegExp(`\\b${p}\\b`).test(ctx)&&!new RegExp(`\\b${p}\\b.{0,80}\\b(injur|practice|return|activated|pup|ir|starter|starting|role|workload)`).test(ctx))return true;
  return false;
}
function relevantSignal(player,m,lane){
  const text=signalText(m);if(!materialRe.test(text))return false;
  const playerName=textNorm(player.n),signalPlayer=textNorm(m?.player||m?.matched_player||'');
  if(incidentalMention(player,m))return false;
  if(playerName&&text.includes(playerName))return true;
  if(signalPlayer&&signalPlayer===playerName)return true;
  if(lane==='material_news_signals'&&['BOUND_ESPN_PLAYER','FULL_NAME_HEADER','FULL_NAME_BODY_WINDOW'].includes(m?.match_evidence))return true;
  if(lane==='direct_material_news_signals'||lane==='material_official_team_direct_signals'||lane==='material_external_review_signals')return Boolean(m?.athlete_id||m?.espn_athlete_id||m?.direct_player_match===true);
  if(lane==='material_team_context_signals'){
    const pTeam=canonicalTeam(player.t),mTeam=canonicalTeam(m?.team||m?.current_team||m?.context_team||'');
    if(pTeam&&mTeam&&pTeam===mTeam)return true;
    if(pTeam&&text.includes(pTeam))return true;
    return false;
  }
  return false;
}
function signals(r,p){const keys=['material_news_signals','direct_material_news_signals','material_official_team_direct_signals','material_external_review_signals','material_team_context_signals'];const out=[];for(const k of keys)for(const m of r?.[k]||[])if(relevantSignal(p,m,k))out.push(m);const seen=new Set();return out.filter(m=>{const key=m.url||`${m.source}|${m.headline}|${m.description}`;if(seen.has(key))return false;seen.add(key);return true;});}
function hasValidatedMaterialBasis(q,sigs){return Boolean(sigs.length||q?.status==='NUMERIC_TV_PROPOSAL');}
function sentiment(text){const p=(text.match(posRe)||[]).length,n=(text.match(negRe)||[]).length;if(p>n)return'POSITIVE';if(n>p)return'NEGATIVE';return'MIXED_OR_NEUTRAL';}
function inferComponents(text){const out=new Set();if(/injur|practice|limited|out|ir|pup|suspend|return/.test(text)){out.add('availability');out.add('weekly_reliability');out.add('production');out.add('ceiling');}if(/role|target|carry|touch|starter|depth chart|snap|route|red zone|goal line|workload/.test(text)){out.add('role_volume');out.add('production');out.add('ceiling');}if(/trade|sign|quarterback|qb|offense|coach|scheme|chemistry|timing|trust|extension/.test(text)){out.add('offensive_environment');out.add('production');out.add('ceiling');}return[...out];}

if(relevantSignal({n:'Travis Kelce',t:'Kansas City Chiefs'},{headline:"Melbourne's MCG is ready for first-ever NFL game with Rams-49ers",matched_context:'a famous kiss with Travis Kelce after the Chiefs beat the 49ers in the 2024 Super Bowl'},'material_news_signals'))throw new Error('INCIDENTAL_REGRESSION: Kelce celebrity mention accepted');
if(relevantSignal({n:'DK Metcalf',t:'Pittsburgh Steelers'},{headline:'NFL news roundup',matched_context:'WR DK Metcalf s contract was restructured converting base salary into a signing bonus and creating salary cap space'},'material_news_signals'))throw new Error('INCIDENTAL_REGRESSION: DK cap restructure accepted');
if(relevantSignal({n:'Trey McBride',t:'Arizona Cardinals'},{headline:'Cardinals agree to terms with WR Michael Wilson on extension',matched_context:'Wilson enters the 2026 season as the Cardinals most reliable producer outside of Trey McBride since entering the league'},'material_news_signals'))throw new Error('INCIDENTAL_REGRESSION: McBride comparison mention accepted');
if(relevantSignal({n:'Jaxson Dart',t:'New York Giants'},{headline:'Cam Skattebo back from injury',matched_context:'it along with Jaxson Dart s emergence helped jumpstart the Big Blue offense it came to an abrupt end with a gruesome leg injury'},'material_news_signals'))throw new Error('INCIDENTAL_REGRESSION: Dart historical mention accepted');
const positiveControl={headline:'Zay Flowers returned to full practice',player:'Zay Flowers'};
if(!relevantSignal({n:'Zay Flowers',t:'Baltimore Ravens'},positiveControl,'material_team_context_signals'))throw new Error('POSITIVE_CONTROL_REGRESSION: direct named practice evidence rejected');

const rows=[];
for(const p of players){
  const r=byReview.get(p.n)||null,q=byRecalc.get(p.n)||null,sigs=signals(r,p);
  const material=hasValidatedMaterialBasis(q,sigs);
  const evidenceText=sigs.map(x=>`${x.headline||''} ${x.description||''} ${x.matched_context||''}`).filter(Boolean).join(' ');
  const sent=sentiment(evidenceText);
  let taxonomy='NO_MATERIAL_UPDATE';
  if(q?.status==='NUMERIC_TV_PROPOSAL')taxonomy=Number(q.score_delta)>0?'UP':Number(q.score_delta)<0?'DOWN':'MATERIAL_HOLD';
  else if(material&&q?.status==='BLOCKED_MISSING_QUANTITATIVE_EVIDENCE')taxonomy='MATERIAL_HOLD';
  else if(material)taxonomy=sent==='POSITIVE'?'POSITIVE_HOLD':sent==='NEGATIVE'?'NEGATIVE_HOLD':'MATERIAL_HOLD';
  const components=material?(q?.implicated_components?.length?q.implicated_components:inferComponents(evidenceText.toLowerCase())):[];
  const currentAssumption={status:p.st||null,score:Number(p.s),true_value_rank:Number(p.tr),overall_rank:Number(p.o),components:{production:Number(p.pd),ceiling:Number(p.ce),role_volume:Number(p.r),offensive_environment:Number(p.e),availability:Number(p.a),weekly_reliability:Number(p.rl),sustainability:Number(p.su)}};
  const evidence=sigs.slice(0,8).map(x=>({source:x.source||null,headline:x.headline||null,published:x.published||null,url:x.url||null,context_lanes:x.context_lanes||null}));
  const changedFact=sigs.length?(evidence[0]?.headline||null):null;
  rows.push({player:p.n,pos:p.p,team:p.t||r?.current_team||null,taxonomy,meaningful_evidence:material,evidence_summary:evidence,prior_assumption:currentAssumption,changed_fact:changedFact,implicated_components:components,component_delta:material?(q?.component_deltas||null):null,score_delta:material?(q?.score_delta??0):0,proposed_score:material?(q?.proposed_score??Number(p.s)):Number(p.s),proposed_true_value_rank:material?(q?.proposed_true_value_rank??Number(p.tr)):Number(p.tr),overall_impact:q?.status==='NUMERIC_TV_PROPOSAL'?'PENDING_STRATEGY_OVERLAY':taxonomy==='NO_MATERIAL_UPDATE'?'UNCHANGED':'REVIEW_REQUIRED',connected_player_effects:taxonomy==='NO_MATERIAL_UPDATE'?{status:'NONE_REQUIRED'}:{status:'REQUIRES_CONNECTED_RESOLVER',team:p.t||r?.current_team||null},market_impact:{current_label:p.px||null,status:taxonomy==='NO_MATERIAL_UPDATE'?'UNCHANGED':'RECHECK_CURRENT_COST_AFTER_APPROVAL'},reconciliation_status:material?(q?.status||null):null});
}
const names=new Set(rows.map(x=>x.player));if(rows.length!==expected||names.size!==expected)throw new Error(`Taxonomy universe failure ${rows.length}/${names.size}/${expected}`);
const invalid=rows.filter(x=>!allowed.has(x.taxonomy));if(invalid.length)throw new Error(`Invalid taxonomy: ${invalid.map(x=>x.player).join(', ')}`);
const silent=rows.filter(x=>x.meaningful_evidence&&x.taxonomy==='NO_MATERIAL_UPDATE');if(silent.length)throw new Error(`MEANINGFUL_EVIDENCE_SILENTLY_DROPPED: ${silent.map(x=>x.player).join(', ')}`);
const badDirectional=rows.filter(x=>(x.taxonomy==='UP'&&!(x.score_delta>0))||(x.taxonomy==='DOWN'&&!(x.score_delta<0)));if(badDirectional.length)throw new Error(`Directional taxonomy without numeric delta: ${badDirectional.map(x=>x.player).join(', ')}`);
const phantom=rows.filter(x=>x.taxonomy!=='NO_MATERIAL_UPDATE'&&!x.meaningful_evidence);if(phantom.length)throw new Error(`PHANTOM_MATERIAL_HOLD: ${phantom.map(x=>x.player).join(', ')}`);
const counts=Object.fromEntries([...allowed].map(k=>[k,rows.filter(x=>x.taxonomy===k).length]));
for(const x of ledger.players||[]){const row=rows.find(r=>r.player===x.player);if(row){x.reconciliation_taxonomy=row.taxonomy;x.reconciliation={meaningful_evidence:row.meaningful_evidence,changed_fact:row.changed_fact,implicated_components:row.implicated_components,score_delta:row.score_delta,proposed_true_value_rank:row.proposed_true_value_rank,connected_player_effects:row.connected_player_effects,market_impact:row.market_impact};}}
ledger.reconciliation_taxonomy_schema={version:'1.3.0',allowed:[...allowed],generated_at:new Date().toISOString(),coverage:rows.length,validation:'MATERIAL_HOLD_REQUIRES_DIRECT_OR_CONNECTED_FANTASY_RELEVANT_EVIDENCE'};
write('guardrails/current-football-review.json',ledger);
const report={schema_version:'1.3.0',generated_at:new Date().toISOString(),authoritative:false,mutation_policy:'PROPOSAL_ONLY_NO_CANONICAL_WRITES',universe:{players:expected,shards},counts,validation:{exact_universe:true,unique_players:true,silent_material_evidence:0,directional_numeric_consistency:true,cross_team_context_guard:true,non_material_operational_guard:true,material_hold_requires_validated_evidence:true,incidental_mention_guard:true,phantom_material_holds:0},rows};
write('analysis/full-universe-reconciliation-taxonomy-current.json',report);
const md=['# Full-Universe Reconciliation Taxonomy','',`Generated: ${report.generated_at}`,`Coverage: ${rows.length}/${expected}`,'',`UP ${counts.UP} | DOWN ${counts.DOWN} | MATERIAL_HOLD ${counts.MATERIAL_HOLD} | POSITIVE_HOLD ${counts.POSITIVE_HOLD} | NEGATIVE_HOLD ${counts.NEGATIVE_HOLD} | NO_MATERIAL_UPDATE ${counts.NO_MATERIAL_UPDATE}`,'','| Player | Taxonomy | Score Δ | TV current → proposed | Changed fact | Components |','|---|---|---:|---|---|---|'];
for(const x of rows)md.push(`| ${x.player} | ${x.taxonomy} | ${x.score_delta} | ${x.prior_assumption.true_value_rank} → ${x.proposed_true_value_rank} | ${(x.changed_fact||'').replaceAll('|','/')} | ${x.implicated_components.join(', ')} |`);
fs.writeFileSync(path.join(root,'analysis/full-universe-reconciliation-taxonomy-current.md'),md.join('\n')+'\n');
console.log(JSON.stringify({result:'PASS',coverage:rows.length,counts},null,2));