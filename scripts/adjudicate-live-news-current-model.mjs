import fs from 'node:fs';
import path from 'node:path';

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
const lower=x=>String(x||'').toLowerCase();
const textFor=r=>lower([r?.reason,...(r?.material_news_signals||[]).flatMap(x=>[x.headline,x.description,x.body_text,x.matched_context])].join(' '));
const has=(t,re)=>re.test(t);
const injuryRe=/injur|ankle|knee|hamstring|groin|shoulder|foot|hip|back|concussion|illness|surgery|acl|mcl|lcl|achilles|meniscus|fracture|tear|dnp|did not practice|miss(?:ed|ing) practice|limited practice|questionable|doubtful|inactive|ruled out|\bout\b|ir\b|pup\b/;
const severeRe=/acl|achilles|surgery|season[- ]ending|out for (?:the )?season|placed on ir|injured reserve|multi[- ]week|several weeks|indefinitely/;
const shortTermRiskRe=/dnp|did not practice|miss(?:ed|ing) practice|limited practice|questionable|doubtful|inactive|ruled out|danger of missing|game[- ]time decision|week 1|week one/;
const recoveryRe=/full practice|returned to practice|cleared|activated|no injury designation|removed from injury report|expected to play|will play|healthy|ramp(?:ed)? up/;
const workloadUpRe=/starter|starting|lead back|workhorse|featured|more touches|more targets|expanded role|first[- ]team|goal[- ]line|three[- ]down|every[- ]down|increased workload|larger role/;
const workloadDownRe=/backup|demoted|reduced role|fewer touches|fewer targets|committee|timeshare|lost.*role|second[- ]team|limited role/;
const suspensionRe=/suspend|disciplin|legal|arrest|personal conduct|inactive.*conduct/;
function decisionFor(player,r,rc){
  const t=textFor(r), material=r?.status==='MATERIAL_CHANGE'||(r?.material_news_signals||[]).length>0;
  if(!material)return{status:'NO_MATERIAL_CHANGE',horizon:'NONE',player_effect:'HOLD',season_long_effect:'HOLD',confidence:'HIGH',reason:'No new material football evidence.'};
  let horizon='CURRENT_OUTLOOK',playerEffect='HOLD',seasonLong='HOLD',confidence='MEDIUM',reason='Material football evidence requires current-outlook adjudication.';
  if(has(t,severeRe)){horizon='SEASON_LONG';playerEffect='DOWNGRADE';seasonLong='DOWNGRADE';confidence='HIGH';reason='Evidence indicates a potentially multi-week or season-long availability impairment.';}
  else if(has(t,injuryRe)&&has(t,shortTermRiskRe)){horizon='NEAR_TERM';playerEffect='DOWNGRADE';seasonLong='HOLD';confidence='HIGH';reason='Availability has materially deteriorated for the near term, but current evidence does not establish a season-long impairment.';}
  else if(has(t,injuryRe)&&has(t,recoveryRe)){horizon='NEAR_TERM';playerEffect='UPGRADE';seasonLong='HOLD';confidence='MEDIUM';reason='Availability/recovery evidence improved the near-term outlook without establishing a new season-long baseline.';}
  else if(has(t,suspensionRe)){horizon='NEAR_TERM';playerEffect='DOWNGRADE';seasonLong='HOLD';confidence='HIGH';reason='Availability is reduced by an off-field or disciplinary development; season-long effect remains conditional on duration.';}
  else if(has(t,workloadUpRe)){horizon='CURRENT_OUTLOOK';playerEffect='UPGRADE';seasonLong='REVIEW';confidence='MEDIUM';reason='Role/usage evidence improved expected opportunity; season-long effect requires persistence confirmation.';}
  else if(has(t,workloadDownRe)){horizon='CURRENT_OUTLOOK';playerEffect='DOWNGRADE';seasonLong='REVIEW';confidence='MEDIUM';reason='Role/usage evidence reduced expected opportunity; season-long effect requires persistence confirmation.';}
  if(rc?.status==='NUMERIC_TV_PROPOSAL'){
    const d=Number(rc.score_delta||0);if(Math.abs(d)>=0.000001){seasonLong=d>0?'UPGRADE':'DOWNGRADE';horizon='SEASON_LONG';confidence='HIGH';reason='Validated quantitative recalculation supports a season-long intrinsic-value adjustment.';}
  }
  const nearTermProjection=playerEffect==='DOWNGRADE'&&horizon==='NEAR_TERM'?'REDUCE':playerEffect==='UPGRADE'&&horizon==='NEAR_TERM'?'INCREASE':'HOLD';
  return{status:'ADJUDICATED',horizon,player_effect:playerEffect,near_term_projection:nearTermProjection,season_long_effect:seasonLong,confidence,reason,numeric_recalculation_status:rc?.status||'NOT_TRIGGERED',proposed_projected_ppr:rc?.proposed_projected_ppr??null,proposed_score:rc?.proposed_score??null,proposed_true_value_rank:rc?.proposed_true_value_rank??null};
}
function connectedEffects(player,r,decision){
  const out=[];
  const candidates=review.materially_implicated_untracked||[];
  for(const c of candidates){
    const sig=c.material_news_signals||[];const txt=lower([c.reason,...sig.flatMap(x=>[x.headline,x.description,x.matched_context])].join(' '));
    if(!txt.includes(lower(player.n))&&!textFor(r).includes(lower(c.player)))continue;
    out.push({player:c.player,effect:decision.player_effect==='DOWNGRADE'?'UPGRADE_CONTINGENT_OPPORTUNITY':decision.player_effect==='UPGRADE'?'DOWNGRADE_CONTINGENT_OPPORTUNITY':'REVIEW',reason:c.reason||'Connected-player opportunity changes with the primary player development.'});
  }
  return out;
}
const decisions=[];const auditErrors=[];
for(const p of canonical){
  const r=reviewBy.get(p.n)||null,rc=recalcBy.get(p.n)||null,d=decisionFor(p,r,rc);d.player=p.n;d.position=p.p;d.current_true_value_rank=p.tr;d.current_overall_rank=p.o;d.implicated_components=rc?.implicated_components||[];d.connected_player_effects=connectedEffects(p,r,d);decisions.push(d);
  const material=r?.status==='MATERIAL_CHANGE'||(r?.material_news_signals||[]).length>0;
  if(material&&d.status!=='ADJUDICATED')auditErrors.push(`${p.n}: material evidence was not adjudicated`);
  if(material&&!d.horizon)auditErrors.push(`${p.n}: missing decision horizon`);
  if(d.horizon==='NEAR_TERM'&&d.player_effect==='DOWNGRADE'&&d.season_long_effect==='DOWNGRADE'&&rc?.status!=='NUMERIC_TV_PROPOSAL')auditErrors.push(`${p.n}: short-term downgrade incorrectly forced a season-long downgrade without quantitative support`);
  if(rc?.status==='NUMERIC_TV_PROPOSAL'&&d.season_long_effect==='HOLD')auditErrors.push(`${p.n}: quantitative recalculation exists but season-long decision was HOLD`);
}
if(decisions.length!==expected)throw new Error(`Decision coverage failed: ${decisions.length}/${expected}`);
if(auditErrors.length)throw new Error(`Live-news decision self-audit failed:\n${auditErrors.join('\n')}`);
const counts={players:expected,adjudicated:decisions.filter(x=>x.status==='ADJUDICATED').length,near_term:decisions.filter(x=>x.horizon==='NEAR_TERM').length,season_long:decisions.filter(x=>x.horizon==='SEASON_LONG').length,upgrades:decisions.filter(x=>x.player_effect==='UPGRADE').length,downgrades:decisions.filter(x=>x.player_effect==='DOWNGRADE').length,holds:decisions.filter(x=>x.player_effect==='HOLD').length,self_audit_errors:0};
write('analysis/live-news-decision-audit-current.json',{schema_version:'1.0.0',generated_at:new Date().toISOString(),authoritative:true,policy:'DECIDE_THEN_SELF_AUDIT_CURRENT_OUTLOOK; STATIC_BASELINE_UNTOUCHED; SEASON_LONG_NUMERIC_MOVES_REQUIRE_VALIDATED_QUANTITATIVE_SUPPORT',universe:expected,counts,decisions});
console.log(JSON.stringify({result:'PASS',...counts},null,2));
