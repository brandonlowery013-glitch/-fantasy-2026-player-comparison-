import fs from 'node:fs';
import path from 'node:path';

const lower=x=>String(x||'').toLowerCase();
const esc=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const splitClauses=t=>String(t||'').split(/(?<=[.!?;])\s+|\n+|\s+[—–-]\s+/).map(x=>x.trim()).filter(Boolean);
const mentionsPlayer=(text,name)=>{const n=lower(name).trim();return !!n&&new RegExp(`(^|[^a-z])${esc(n)}([^a-z]|$)`,'i').test(String(text||''));};
const structuredSubjectMatches=(signal,name)=>[signal?.player,signal?.player_name,signal?.subject,signal?.athlete].some(x=>x&&lower(x).trim()===lower(name).trim());
const signalFields=s=>[s?.headline,s?.description,s?.body_text,s?.matched_context].filter(Boolean);

export function playerLocalEvidence(player,r){
  const pieces=[];
  for(const s of r?.material_news_signals||[]){
    const fields=signalFields(s),named=[];
    for(const field of fields)for(const clause of splitClauses(field))if(mentionsPlayer(clause,player.n))named.push(clause);
    if(named.length){pieces.push(...named);continue;}
    if(structuredSubjectMatches(s,player.n)||s?.source==='ESPN_PLAYER')pieces.push(...fields);
  }
  if(r?.reason&&mentionsPlayer(r.reason,player.n))pieces.push(r.reason);
  return lower([...new Set(pieces)].join(' '));
}

const has=(t,re)=>re.test(t);
const injuryRe=/injur|ankle|knee|hamstring|groin|shoulder|foot|hip|back|concussion|illness|surgery|acl|mcl|lcl|achilles|meniscus|fracture|tear|dnp|did not practice|miss(?:ed|ing) practice|limited practice|questionable|doubtful|inactive|ruled out|\bout\b|\bir\b|\bpup\b/;
const severeRe=/acl|achilles|surgery|season[- ]ending|out for (?:the )?season|placed on (?:injured reserve|ir)|multi[- ]week|several weeks|indefinitely/;
const shortTermRiskRe=/dnp|did not practice|miss(?:ed|ing) practice|limited practice|questionable|doubtful|inactive|ruled out|danger of missing|game[- ]time decision|week 1|week one/;
const recoveryRe=/full practice|returned to practice|cleared|activated|no injury designation|removed from injury report|expected to play|will play|healthy|ramp(?:ed)? up|return(?:ed|s)? to (?:the )?(?:lineup|practice)|back in (?:the )?lineup/;
const workloadUpRe=/\bstarter\b|\bstarting\b|lead back|workhorse|featured|more touches|more targets|expanded role|first[- ]team|goal[- ]line|three[- ]down|every[- ]down|increased workload|larger role/;
const workloadDownRe=/\bbackup\b|demoted|reduced role|fewer touches|fewer targets|committee|timeshare|lost.*role|second[- ]team|limited role/;
const suspensionRe=/suspend|disciplin|legal|arrest|personal conduct|inactive.*conduct/;
const qbOutRe=/ruled out|will miss|expected to miss|placed on (?:injured reserve|ir)|injured reserve|inactive|benched|suspended|season[- ]ending|out for (?:the )?season|multi[- ]week|several weeks|indefinitely/;
const qbStarterChangeRe=/named (?:the )?starter|named .* starter|will start|starting quarterback|\bstarter\b/;

function qbEventEffect(text){
  const t=lower(text);
  if(has(t,qbOutRe)||has(t,severeRe))return{effect:'DOWNGRADE',near_term_projection:'REDUCE',code:'QB_AVAILABILITY_DOWN',confidence:'HIGH',reason:'Same-team quarterback availability materially deteriorated, creating a causal near-term offense-context downgrade.'};
  if(has(t,injuryRe)&&has(t,shortTermRiskRe))return{effect:'DOWNGRADE',near_term_projection:'REDUCE',code:'QB_AVAILABILITY_RISK',confidence:'MEDIUM',reason:'Same-team quarterback availability is at material near-term risk, creating downside for the surrounding offense.'};
  if(has(t,recoveryRe)&&has(t,injuryRe))return{effect:'UPGRADE',near_term_projection:'INCREASE',code:'QB_RETURN',confidence:'MEDIUM',reason:'Same-team quarterback recovery/return materially improves near-term offense context.'};
  if(has(t,qbStarterChangeRe))return{effect:'HOLD',near_term_projection:'HOLD',code:'QB_STARTER_CHANGE_REVIEW',confidence:'MEDIUM',reason:'Same-team starting-quarterback context changed, but direction is not inferred without evidence that the change improves or worsens the offense.'};
  return null;
}

export function connectedOffenseContext(player,r,canonical=[]){
  const teammates=(canonical||[]).filter(x=>x&&x.n!==player.n&&x.t===player.t&&x.p==='QB');
  const effects=[];
  for(const s of r?.material_news_signals||[]){
    const fields=signalFields(s);
    if(!fields.length)continue;
    const full=fields.join(' ');
    if(mentionsPlayer(full,player.n)||structuredSubjectMatches(s,player.n))continue;
    for(const qb of teammates){
      if(!mentionsPlayer(full,qb.n)&&!structuredSubjectMatches(s,qb.n))continue;
      const clauses=[];
      for(const field of fields)for(const clause of splitClauses(field))if(mentionsPlayer(clause,qb.n))clauses.push(clause);
      if(!clauses.length&&structuredSubjectMatches(s,qb.n))clauses.push(...fields);
      const evidence=lower([...new Set(clauses)].join(' '));
      const impact=qbEventEffect(evidence);
      if(!impact)continue;
      effects.push({source_player:qb.n,source_position:'QB',target_player:player.n,relation:'SAME_TEAM_OFFENSE',...impact,evidence_excerpt:evidence.slice(0,500),source:s?.url||s?.source||null,published:s?.published||null});
    }
  }
  return effects;
}

export function decisionFor(player,r,rc={},canonical=[]){
  const material=r?.status==='MATERIAL_CHANGE'||(r?.material_news_signals||[]).length>0;
  if(!material)return{status:'NO_MATERIAL_CHANGE',horizon:'NONE',player_effect:'HOLD',near_term_projection:'HOLD',season_long_effect:'HOLD',confidence:'HIGH',binding_status:'NO_MATERIAL_EVIDENCE',reason:'No new material football evidence.',connected_player_effects:[]};
  const t=playerLocalEvidence(player,r);
  const connected=connectedOffenseContext(player,r,canonical);
  if(!t){
    if(connected.length){
      const directional=connected.filter(x=>x.effect==='UPGRADE'||x.effect==='DOWNGRADE');
      const dirs=[...new Set(directional.map(x=>x.effect))];
      if(dirs.length===1){
        const effect=dirs[0];
        return{status:'ADJUDICATED',horizon:'NEAR_TERM',player_effect:effect,near_term_projection:effect==='UPGRADE'?'INCREASE':'REDUCE',season_long_effect:'HOLD',confidence:directional.some(x=>x.confidence==='HIGH')?'HIGH':'MEDIUM',binding_status:'CONNECTED_PLAYER_CONTEXT',reason:directional.map(x=>x.reason).join(' ').slice(0,700),numeric_recalculation_status:rc?.status||'NOT_TRIGGERED',connected_player_effects:connected};
      }
      return{status:'ADJUDICATED',horizon:'CURRENT_OUTLOOK',player_effect:'HOLD',near_term_projection:'HOLD',season_long_effect:'HOLD',confidence:'MEDIUM',binding_status:'CONNECTED_PLAYER_CONTEXT',reason:'Verified same-team quarterback context is relevant to the player, but no unsupported good/bad direction is inferred.',numeric_recalculation_status:rc?.status||'NOT_TRIGGERED',connected_player_effects:connected};
    }
    return{status:'ADJUDICATED',horizon:'CURRENT_OUTLOOK',player_effect:'HOLD',near_term_projection:'HOLD',season_long_effect:'HOLD',confidence:'LOW',binding_status:'UNBOUND_MATERIAL_EVIDENCE',reason:'Material source text was present, but no player-specific clause, athlete-bound subject, or verified causal connected-player context was found; model/news impact is blocked pending review.',numeric_recalculation_status:rc?.status||'NOT_TRIGGERED',connected_player_effects:[]};
  }
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
  return{status:'ADJUDICATED',horizon,player_effect:playerEffect,near_term_projection:nearTermProjection,season_long_effect:seasonLong,confidence,binding_status:'PLAYER_SPECIFIC',reason,evidence_excerpt:t.slice(0,700),numeric_recalculation_status:rc?.status||'NOT_TRIGGERED',proposed_projected_ppr:rc?.proposed_projected_ppr??null,proposed_score:rc?.proposed_score??null,proposed_true_value_rank:rc?.proposed_true_value_rank??null,connected_player_effects:connected};
}

function runSelfTest(){
  const atl=[{n:'Bijan Robinson',p:'RB',t:'Atlanta Falcons'},{n:'Drake London',p:'WR',t:'Atlanta Falcons'},{n:'Tua Tagovailoa',p:'QB',t:'Atlanta Falcons'}];
  const holdTua=decisionFor(atl[0],{status:'MATERIAL_CHANGE',material_news_signals:[{headline:'Tua Tagovailoa named Falcons starter',description:'Tua Tagovailoa will start Week 1 for Atlanta.'}]},{},atl);
  if(holdTua.player_effect!=='HOLD'||holdTua.binding_status!=='CONNECTED_PLAYER_CONTEXT'||holdTua.connected_player_effects?.[0]?.code!=='QB_STARTER_CHANGE_REVIEW')throw new Error('Regression failed: Tua starter change must be connected context, not a Bijan role upgrade.');
  const holdLondon=decisionFor(atl[1],{status:'MATERIAL_CHANGE',material_news_signals:[{headline:'Tua Tagovailoa named Falcons starter',description:'Tua Tagovailoa will start Week 1 for Atlanta.'}]},{},atl);
  if(holdLondon.player_effect!=='HOLD'||holdLondon.binding_status!=='CONNECTED_PLAYER_CONTEXT')throw new Error('Regression failed: Tua starter change must not directly upgrade Drake London.');
  const qbOut=decisionFor(atl[0],{status:'MATERIAL_CHANGE',material_news_signals:[{headline:'Tua Tagovailoa ruled out',description:'Tua Tagovailoa has been ruled out with an ankle injury and will miss Week 2.'}]},{},atl);
  if(qbOut.player_effect!=='DOWNGRADE'||qbOut.near_term_projection!=='REDUCE'||qbOut.binding_status!=='CONNECTED_PLAYER_CONTEXT')throw new Error('Regression failed: material QB loss did not downgrade connected Bijan offense context.');
  const qbBack=decisionFor(atl[1],{status:'MATERIAL_CHANGE',material_news_signals:[{headline:'Tua Tagovailoa returns',description:'Tua Tagovailoa returned to practice after an ankle injury and is expected to play.'}]},{},atl);
  if(qbBack.player_effect!=='UPGRADE'||qbBack.near_term_projection!=='INCREASE'||qbBack.binding_status!=='CONNECTED_PLAYER_CONTEXT')throw new Error('Regression failed: QB return did not upgrade connected Drake London offense context.');
  const jt=decisionFor({n:'Jonathan Taylor',p:'RB',t:'Indianapolis Colts'},{status:'MATERIAL_CHANGE',material_news_signals:[{source:'ESPN_PLAYER',headline:'Colts extend Jonathan Taylor; Sean McKeon placed on injured reserve',description:'Jonathan Taylor signed an extension. Sean McKeon was placed on IR.'}]},{},[]);
  if(jt.player_effect==='DOWNGRADE'||jt.season_long_effect==='DOWNGRADE'||!jt.evidence_excerpt.includes('jonathan taylor')||jt.evidence_excerpt.includes('sean mckeon'))throw new Error('Regression failed: another player IR move contaminated Jonathan Taylor.');
  const trueRole=decisionFor({n:'Bijan Robinson',p:'RB',t:'Atlanta Falcons'},{status:'MATERIAL_CHANGE',material_news_signals:[{headline:'Bijan Robinson remains Falcons starting running back',description:'Bijan Robinson will remain the starting running back and is expected to lead the backfield.'}]},{},atl);
  if(trueRole.player_effect!=='UPGRADE')throw new Error('Regression failed: player-specific role evidence not recognized.');
  const trueIr=decisionFor({n:'Jonathan Taylor',p:'RB',t:'Indianapolis Colts'},{status:'MATERIAL_CHANGE',material_news_signals:[{headline:'Jonathan Taylor placed on injured reserve',description:'Jonathan Taylor was placed on injured reserve and will miss multiple weeks.'}]},{},[]);
  if(trueIr.player_effect!=='DOWNGRADE'||trueIr.season_long_effect!=='DOWNGRADE')throw new Error('Regression failed: player-specific IR evidence not recognized.');
  const boundPronoun=decisionFor({n:'Example Player',p:'WR',t:'Example'},{status:'MATERIAL_CHANGE',material_news_signals:[{source:'ESPN_PLAYER',headline:'Expected back at practice',description:'He is expected back at practice after an ankle injury.'}]},{},[]);
  if(boundPronoun.binding_status!=='PLAYER_SPECIFIC')throw new Error('Regression failed: athlete-bound pronoun evidence was rejected.');
  console.log(JSON.stringify({result:'PASS',tests:8},null,2));
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
const decisions=[];const auditErrors=[];
for(const p of canonical){
  const r=reviewBy.get(p.n)||null,rc=recalcBy.get(p.n)||null,d=decisionFor(p,r,rc,canonical);
  d.player=p.n;d.position=p.p;d.team=p.t;d.current_true_value_rank=p.tr;d.current_overall_rank=p.o;d.implicated_components=rc?.implicated_components||[];decisions.push(d);
  const material=r?.status==='MATERIAL_CHANGE'||(r?.material_news_signals||[]).length>0;
  if(material&&d.status!=='ADJUDICATED')auditErrors.push(`${p.n}: material evidence was not adjudicated`);
  if(material&&!d.horizon)auditErrors.push(`${p.n}: missing decision horizon`);
  if(d.binding_status==='UNBOUND_MATERIAL_EVIDENCE'&&(d.player_effect!=='HOLD'||d.season_long_effect!=='HOLD'))auditErrors.push(`${p.n}: unbound evidence produced a model move`);
  if(d.binding_status==='CONNECTED_PLAYER_CONTEXT'&&(!Array.isArray(d.connected_player_effects)||!d.connected_player_effects.length))auditErrors.push(`${p.n}: connected-context decision lacks causal connected-player evidence`);
  if(d.binding_status==='CONNECTED_PLAYER_CONTEXT'&&d.season_long_effect!=='HOLD'&&rc?.status!=='NUMERIC_TV_PROPOSAL')auditErrors.push(`${p.n}: connected context forced unsupported season-long change`);
  if(d.horizon==='NEAR_TERM'&&d.player_effect==='DOWNGRADE'&&d.season_long_effect==='DOWNGRADE'&&rc?.status!=='NUMERIC_TV_PROPOSAL')auditErrors.push(`${p.n}: short-term downgrade incorrectly forced season-long downgrade`);
  if(rc?.status==='NUMERIC_TV_PROPOSAL'&&d.binding_status!=='PLAYER_SPECIFIC')auditErrors.push(`${p.n}: numeric proposal lacks player-specific evidence binding`);
  if(rc?.status==='NUMERIC_TV_PROPOSAL'&&d.season_long_effect==='HOLD')auditErrors.push(`${p.n}: quantitative recalculation exists but season-long decision was HOLD`);
}
if(decisions.length!==expected)throw new Error(`Decision coverage failed: ${decisions.length}/${expected}`);
if(auditErrors.length)throw new Error(`Live-news decision self-audit failed:\n${auditErrors.join('\n')}`);
const counts={players:expected,adjudicated:decisions.filter(x=>x.status==='ADJUDICATED').length,player_specific:decisions.filter(x=>x.binding_status==='PLAYER_SPECIFIC').length,connected_context:decisions.filter(x=>x.binding_status==='CONNECTED_PLAYER_CONTEXT').length,unbound_material:decisions.filter(x=>x.binding_status==='UNBOUND_MATERIAL_EVIDENCE').length,near_term:decisions.filter(x=>x.horizon==='NEAR_TERM').length,season_long:decisions.filter(x=>x.horizon==='SEASON_LONG').length,upgrades:decisions.filter(x=>x.player_effect==='UPGRADE').length,downgrades:decisions.filter(x=>x.player_effect==='DOWNGRADE').length,holds:decisions.filter(x=>x.player_effect==='HOLD').length,self_audit_errors:0};
write('analysis/live-news-decision-audit-current.json',{schema_version:'1.3.0',generated_at:new Date().toISOString(),authoritative:true,policy:'PLAYER_SPECIFIC_BINDING_FOR_DIRECT_NEWS; VERIFIED SAME_TEAM_QB EVENTS MAY PROPAGATE AS CONNECTED OFFENSE CONTEXT; STARTER CHANGES ARE NONDIRECTIONAL UNLESS EVIDENCE SUPPORTS GOOD/BAD IMPACT; STATIC BASELINE UNTOUCHED; SEASON_LONG NUMERIC MOVES REQUIRE VALIDATED QUANTITATIVE SUPPORT',universe:expected,counts,decisions});
console.log(JSON.stringify({result:'PASS',...counts},null,2));