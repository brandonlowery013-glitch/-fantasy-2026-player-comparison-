import fs from 'node:fs';
import path from 'node:path';

const lower=x=>String(x||'').toLowerCase();
const esc=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const splitClauses=t=>String(t||'').split(/(?<=[.!?;])\s+|\n+|\s+[—–-]\s+/).map(x=>x.trim()).filter(Boolean);
const mentionsPlayer=(text,name)=>{const n=lower(name).trim();return !!n&&new RegExp(`(^|[^a-z])${esc(n)}([^a-z]|$)`,'i').test(String(text||''));};
const structuredSubjectMatches=(signal,name)=>[signal?.player,signal?.player_name,signal?.subject,signal?.athlete].some(x=>x&&lower(x).trim()===lower(name).trim());

export function playerLocalEvidence(player,r){
  const pieces=[];
  for(const s of r?.material_news_signals||[]){
    const fields=[s?.headline,s?.description,s?.body_text,s?.matched_context].filter(Boolean);
    const named=[];
    for(const field of fields)for(const clause of splitClauses(field))if(mentionsPlayer(clause,player.n))named.push(clause);
    if(named.length){pieces.push(...named);continue;}
    if(structuredSubjectMatches(s,player.n)||s?.source==='ESPN_PLAYER'){pieces.push(...fields);continue;}
  }
  if(r?.reason&&mentionsPlayer(r.reason,player.n))pieces.push(r.reason);
  return lower([...new Set(pieces)].join(' '));
}

const has=(t,re)=>re.test(t);
const injuryRe=/injur|ankle|knee|hamstring|groin|shoulder|foot|hip|back|concussion|illness|surgery|acl|mcl|lcl|achilles|meniscus|fracture|tear|dnp|did not practice|miss(?:ed|ing) practice|limited practice|questionable|doubtful|inactive|ruled out|\bout\b|\bir\b|\bpup\b/;
const severeRe=/acl|achilles|surgery|season[- ]ending|out for (?:the )?season|placed on (?:injured reserve|ir)|multi[- ]week|several weeks|indefinitely/;
const shortTermRiskRe=/dnp|did not practice|miss(?:ed|ing) practice|limited practice|questionable|doubtful|inactive|ruled out|danger of missing|game[- ]time decision|week 1|week one/;
const recoveryRe=/full practice|returned to practice|cleared|activated|no injury designation|removed from injury report|expected to play|will play|healthy|ramp(?:ed)? up/;
const workloadUpRe=/\bstarter\b|\bstarting\b|lead back|workhorse|featured|more touches|more targets|expanded role|first[- ]team|goal[- ]line|three[- ]down|every[- ]down|increased workload|larger role/;
const workloadDownRe=/\bbackup\b|demoted|reduced role|fewer touches|fewer targets|committee|timeshare|lost.*role|second[- ]team|limited role/;
const suspensionRe=/suspend|disciplin|legal|arrest|personal conduct|inactive.*conduct/;

export function decisionFor(player,r,rc={}){
  const material=r?.status==='MATERIAL_CHANGE'||(r?.material_news_signals||[]).length>0;
  if(!material)return{status:'NO_MATERIAL_CHANGE',horizon:'NONE',player_effect:'HOLD',season_long_effect:'HOLD',confidence:'HIGH',binding_status:'NO_MATERIAL_EVIDENCE',reason:'No new material football evidence.'};
  const t=playerLocalEvidence(player,r);
  if(!t)return{status:'ADJUDICATED',horizon:'CURRENT_OUTLOOK',player_effect:'HOLD',near_term_projection:'HOLD',season_long_effect:'HOLD',confidence:'LOW',binding_status:'UNBOUND_MATERIAL_EVIDENCE',reason:'Material source text was present, but no player-specific clause or athlete-bound subject was verified; model/news impact is blocked pending review.',numeric_recalculation_status:rc?.status||'NOT_TRIGGERED'};
  let horizon='CURRENT_OUTLOOK',playerEffect='HOLD',seasonLong='HOLD',confidence='MEDIUM',reason='Player-specific material evidence requires current-outlook adjudication.';
  if(has(t,severeRe)){horizon='SEASON_LONG';playerEffect='DOWNGRADE';seasonLong='DOWNGRADE';confidence='HIGH';reason='Player-specific evidence indicates a potentially multi-week or season-long availability impairment.';}
  else if(has(t,injuryRe)&&has(t,shortTermRiskRe)){horizon='NEAR_TERM';playerEffect='DOWNGRADE';seasonLong='HOLD';confidence='HIGH';reason='Player-specific availability evidence materially deteriorated for the near term without establishing a season-long impairment.';}
  else if(has(t,injuryRe)&&has(t,recoveryRe)){horizon='NEAR_TERM';playerEffect='UPGRADE';seasonLong='HOLD';confidence='MEDIUM';reason='Player-specific recovery evidence improved the near-term outlook without establishing a new season-long baseline.';}
  else if(has(t,suspensionRe)){horizon='NEAR_TERM';playerEffect='DOWNGRADE';seasonLong='HOLD';confidence='HIGH';reason='Player-specific availability is reduced by an off-field or disciplinary development; season-long effect remains conditional on duration.';}
  else if(has(t,workloadUpRe)){horizon='CURRENT_OUTLOOK';playerEffect='UPGRADE';seasonLong='REVIEW';confidence='MEDIUM';reason='Player-specific role/usage evidence improved expected opportunity; season-long effect requires persistence confirmation.';}
  else if(has(t,workloadDownRe)){horizon='CURRENT_OUTLOOK';playerEffect='DOWNGRADE';seasonLong='REVIEW';confidence='MEDIUM';reason='Player-specific role/usage evidence reduced expected opportunity; season-long effect requires persistence confirmation.';}
  if(rc?.status==='NUMERIC_TV_PROPOSAL'){
    const delta=Number(rc.score_delta||0);
    if(Math.abs(delta)>=0.000001){seasonLong=delta>0?'UPGRADE':'DOWNGRADE';horizon='SEASON_LONG';confidence='HIGH';reason='Validated quantitative recalculation supports a season-long intrinsic-value adjustment.';}
  }
  const nearTermProjection=playerEffect==='DOWNGRADE'&&horizon==='NEAR_TERM'?'REDUCE':playerEffect==='UPGRADE'&&horizon==='NEAR_TERM'?'INCREASE':'HOLD';
  return{status:'ADJUDICATED',horizon,player_effect:playerEffect,near_term_projection:nearTermProjection,season_long_effect:seasonLong,confidence,binding_status:'PLAYER_SPECIFIC',reason,evidence_excerpt:t.slice(0,700),numeric_recalculation_status:rc?.status||'NOT_TRIGGERED',proposed_projected_ppr:rc?.proposed_projected_ppr??null,proposed_score:rc?.proposed_score??null,proposed_true_value_rank:rc?.proposed_true_value_rank??null};
}

function runSelfTest(){
  const holdTua=decisionFor({n:'Bijan Robinson'},{status:'MATERIAL_CHANGE',material_news_signals:[{headline:'Tua Tagovailoa named Falcons starter',description:'Tua Tagovailoa will start Week 1 for Atlanta.'}]},{});
  if(holdTua.player_effect!=='HOLD'||holdTua.binding_status!=='UNBOUND_MATERIAL_EVIDENCE')throw new Error('Regression failed: unrelated Tua starter text changed Bijan.');
  const holdLondon=decisionFor({n:'Drake London'},{status:'MATERIAL_CHANGE',material_news_signals:[{headline:'Tua Tagovailoa named Falcons starter',description:'Tua Tagovailoa will start Week 1 for Atlanta.'}]},{});
  if(holdLondon.player_effect!=='HOLD'||holdLondon.binding_status!=='UNBOUND_MATERIAL_EVIDENCE')throw new Error('Regression failed: unrelated starter text changed Drake London.');
  const jt=decisionFor({n:'Jonathan Taylor'},{status:'MATERIAL_CHANGE',material_news_signals:[{source:'ESPN_PLAYER',headline:'Colts extend Jonathan Taylor; Sean McKeon placed on injured reserve',description:'Jonathan Taylor signed an extension. Sean McKeon was placed on IR.'}]},{});
  if(jt.player_effect==='DOWNGRADE'||jt.season_long_effect==='DOWNGRADE'||!jt.evidence_excerpt.includes('jonathan taylor')||jt.evidence_excerpt.includes('sean mckeon'))throw new Error('Regression failed: another player IR move contaminated Jonathan Taylor.');
  const trueRole=decisionFor({n:'Bijan Robinson'},{status:'MATERIAL_CHANGE',material_news_signals:[{headline:'Bijan Robinson remains Falcons starting running back',description:'Bijan Robinson will remain the starting running back and is expected to lead the backfield.'}]},{});
  if(trueRole.player_effect!=='UPGRADE')throw new Error('Regression failed: player-specific role evidence not recognized.');
  const trueIr=decisionFor({n:'Jonathan Taylor'},{status:'MATERIAL_CHANGE',material_news_signals:[{headline:'Jonathan Taylor placed on injured reserve',description:'Jonathan Taylor was placed on injured reserve and will miss multiple weeks.'}]},{});
  if(trueIr.player_effect!=='DOWNGRADE'||trueIr.season_long_effect!=='DOWNGRADE')throw new Error('Regression failed: player-specific IR evidence not recognized.');
  const boundPronoun=decisionFor({n:'Example Player'},{status:'MATERIAL_CHANGE',material_news_signals:[{source:'ESPN_PLAYER',headline:'Expected back at practice',description:'He is expected back at practice after an ankle injury.'}]},{});
  if(boundPronoun.binding_status!=='PLAYER_SPECIFIC')throw new Error('Regression failed: athlete-bound pronoun evidence was rejected.');
  console.log(JSON.stringify({result:'PASS',tests:6},null,2));
}

runSelfTest();
if(process.argv.includes('--self-test'))process.exit(0);

const root=process.cwd();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const write=(p,x)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(x,null,2)+'\n');};
const source=read('MODEL_SOURCE_OF_TRUTH.json');
const review=read('guardrails/current-football-review.json');
const recalc=read('analysis/substantive-component-recalculation-current.json');
const expected=Number(source.active_player_model);
let canonical=[];for(let i=0;i<Number(source.runtime_player_shards);i++)canonical.push(...read(`players${i}.json`));
if(canonical.length!==expected||new Set(canonical.map(x=>x.n)).size!==expected)throw new Error(`Canonical universe invalid: ${canonical.length}/${expected}`);
const reviewBy=new Map((review.players||[]).map(x=>[x.player,x]));
const recalcBy=new Map((recalc.rows||[]).map(x=>[x.player,x]));
function connectedEffects(player,r,decision){
  const out=[];
  const primaryEvidence=playerLocalEvidence(player,r);
  if(!primaryEvidence)return out;
  for(const c of review.materially_implicated_untracked||[]){
    const txt=lower([c.reason,...(c.material_news_signals||[]).flatMap(x=>[x.headline,x.description,x.matched_context])].join(' '));
    if(!mentionsPlayer(txt,c.player)||!mentionsPlayer(primaryEvidence,c.player))continue;
    out.push({player:c.player,effect:decision.player_effect==='DOWNGRADE'?'UPGRADE_CONTINGENT_OPPORTUNITY':decision.player_effect==='UPGRADE'?'DOWNGRADE_CONTINGENT_OPPORTUNITY':'REVIEW',reason:c.reason||'Connected-player opportunity changes with the primary player development.'});
  }
  return out;
}
const decisions=[];const auditErrors=[];
for(const p of canonical){
  const r=reviewBy.get(p.n)||null,rc=recalcBy.get(p.n)||null,d=decisionFor(p,r,rc);
  d.player=p.n;d.position=p.p;d.current_true_value_rank=p.tr;d.current_overall_rank=p.o;d.implicated_components=rc?.implicated_components||[];d.connected_player_effects=connectedEffects(p,r,d);decisions.push(d);
  const material=r?.status==='MATERIAL_CHANGE'||(r?.material_news_signals||[]).length>0;
  if(material&&d.status!=='ADJUDICATED')auditErrors.push(`${p.n}: material evidence was not adjudicated`);
  if(material&&!d.horizon)auditErrors.push(`${p.n}: missing decision horizon`);
  if(d.binding_status==='UNBOUND_MATERIAL_EVIDENCE'&&(d.player_effect!=='HOLD'||d.season_long_effect!=='HOLD'))auditErrors.push(`${p.n}: unbound evidence produced a model move`);
  if(d.horizon==='NEAR_TERM'&&d.player_effect==='DOWNGRADE'&&d.season_long_effect==='DOWNGRADE'&&rc?.status!=='NUMERIC_TV_PROPOSAL')auditErrors.push(`${p.n}: short-term downgrade incorrectly forced season-long downgrade`);
  if(rc?.status==='NUMERIC_TV_PROPOSAL'&&d.binding_status!=='PLAYER_SPECIFIC')auditErrors.push(`${p.n}: numeric proposal lacks player-specific evidence binding`);
  if(rc?.status==='NUMERIC_TV_PROPOSAL'&&d.season_long_effect==='HOLD')auditErrors.push(`${p.n}: quantitative recalculation exists but season-long decision was HOLD`);
}
if(decisions.length!==expected)throw new Error(`Decision coverage failed: ${decisions.length}/${expected}`);
if(auditErrors.length)throw new Error(`Live-news decision self-audit failed:\n${auditErrors.join('\n')}`);
const counts={players:expected,adjudicated:decisions.filter(x=>x.status==='ADJUDICATED').length,player_specific:decisions.filter(x=>x.binding_status==='PLAYER_SPECIFIC').length,unbound_material:decisions.filter(x=>x.binding_status==='UNBOUND_MATERIAL_EVIDENCE').length,near_term:decisions.filter(x=>x.horizon==='NEAR_TERM').length,season_long:decisions.filter(x=>x.horizon==='SEASON_LONG').length,upgrades:decisions.filter(x=>x.player_effect==='UPGRADE').length,downgrades:decisions.filter(x=>x.player_effect==='DOWNGRADE').length,holds:decisions.filter(x=>x.player_effect==='HOLD').length,self_audit_errors:0};
write('analysis/live-news-decision-audit-current.json',{schema_version:'1.2.0',generated_at:new Date().toISOString(),authoritative:true,policy:'PLAYER_SPECIFIC_CLAUSE_OR_ATHLETE_BINDING_REQUIRED_FOR_NEWS_AND_MODEL_MOVES; DECIDE_THEN_SELF_AUDIT_CURRENT_OUTLOOK; STATIC_BASELINE_UNTOUCHED; SEASON_LONG_NUMERIC_MOVES_REQUIRE_VALIDATED_QUANTITATIVE_SUPPORT',universe:expected,counts,decisions});
console.log(JSON.stringify({result:'PASS',...counts},null,2));